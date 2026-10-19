#!/usr/bin/env node
// Publish app updates to the VM (served as static files by Caddy under /ota and /app).
//   node scripts/publish.mjs ota   JS/asset changes: phones download them in the background, applied next launch
//   node scripts/publish.mjs apk   native changes: uploads the release APK + latest.json (in-app "Update available")
// Signing happens here: the OTA private key (~/.vybe/ota-private-key.pem) never goes to the VM.
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = (process.env.EXPO_PUBLIC_API_URL ??= 'https://api.161-153-37-106.sslip.io');
process.env.APP_VARIANT = 'production';
const SSH = process.env.VYBE_SSH ?? 'sarthak@161.153.37.106';
const SSH_KEY = process.env.VYBE_SSH_KEY ?? join(homedir(), '.ssh', 'bunkr_oracle');
const OTA_KEY = process.env.VYBE_OTA_KEY ?? join(homedir(), '.vybe', 'ota-private-key.pem');
const REMOTE = 'vybe/deploy/public';
const out = join(root, 'dist-publish');

// Windows needs a shell only for npx (a .cmd); ssh/scp/tar get their args verbatim.
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' });
const expoConfig = () => JSON.parse(execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], { cwd: root, shell: process.platform === 'win32' }).toString());

// Upload `out` and move it into place on the VM; the file that clients poll (manifest / latest.json) moves last.
function upload(lastFile) {
  const tar = 'dist-publish.tar'; // relative: scp would read "F:\..." as a host name
  run('tar', ['-cf', tar, '-C', 'dist-publish', '.']);
  run('scp', ['-i', SSH_KEY, '-q', tar, `${SSH}:vybe-publish.tar`]);
  const script = `set -e; d=$(mktemp -d); tar -xf ~/vybe-publish.tar -C "$d"; rm ~/vybe-publish.tar
mkdir -p ~/${REMOTE}; last="$d/${lastFile}"; tmp=$(mktemp ~/${REMOTE}/.tmp.XXXX); cp "$last" "$tmp"; rm "$last"
cp -rn "$d"/. ~/${REMOTE}/; mkdir -p "$(dirname ~/${REMOTE}/${lastFile})"; chmod 644 "$tmp"; mv "$tmp" ~/${REMOTE}/${lastFile}; rm -rf "$d"`;
  run('ssh', ['-i', SSH_KEY, SSH, script]);
  rmSync(join(root, tar));
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', json: 'application/json' };

function publishOta() {
  if (!existsSync(OTA_KEY)) throw new Error(`OTA signing key not found at ${OTA_KEY}`);
  const exp = join(root, 'dist-ota');
  rmSync(exp, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
  run('npx', ['expo', 'export', '--platform', 'android', '--output-dir', 'dist-ota']);
  const config = expoConfig();
  const runtime = config.runtimeVersion;
  if (typeof runtime !== 'string') throw new Error('runtimeVersion must be a string in app.config.ts');
  const meta = JSON.parse(readFileSync(join(exp, 'metadata.json'), 'utf8')).fileMetadata.android;

  const asset = (rel, ext, contentType) => {
    const buf = readFileSync(join(exp, rel));
    const hash = createHash('sha256').update(buf).digest('base64url');
    const name = `${createHash('sha256').update(buf).digest('hex')}.${ext}`;
    mkdirSync(join(out, 'ota', 'assets'), { recursive: true });
    writeFileSync(join(out, 'ota', 'assets', name), buf);
    return { hash, key: createHash('md5').update(buf).digest('hex'), fileExtension: `.${ext}`, contentType, url: `${API_URL}/ota/assets/${name}` };
  };
  const manifest = JSON.stringify({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    runtimeVersion: runtime,
    launchAsset: asset(meta.bundle, 'bundle', 'application/javascript'),
    assets: meta.assets.map((a) => asset(a.path, a.ext, MIME[a.ext] ?? 'application/octet-stream')),
    metadata: {},
    extra: { expoClient: config },
  });
  const sig = sign('sha256', Buffer.from(manifest), createPrivateKey(readFileSync(OTA_KEY))).toString('base64');

  // Expo Updates protocol v1 response, prebuilt so Caddy can serve it as a static file (boundary set in the Caddyfile).
  const B = 'vybe-ota';
  const body =
    `--${B}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Disposition: form-data; name="manifest"\r\n` +
    `expo-signature: sig="${sig}", keyid="main"\r\n\r\n${manifest}\r\n` +
    `--${B}\r\nContent-Type: application/json\r\nContent-Disposition: form-data; name="extensions"\r\n\r\n{"assetRequestHeaders":{}}\r\n--${B}--\r\n`;
  const manifestPath = `ota/android/${runtime}/manifest`;
  mkdirSync(dirname(join(out, manifestPath)), { recursive: true });
  writeFileSync(join(out, manifestPath), body);
  upload(manifestPath);
  console.log(`OTA update published for runtime ${runtime}: phones pick it up on their next launch.`);
}

function publishApk() {
  const apk = join(root, 'android/app/build/outputs/apk/release/app-release.apk');
  if (!existsSync(apk)) throw new Error(`No signed release APK at ${apk}. Build it first (see README).`);
  const config = expoConfig();
  const versionCode = config.android?.versionCode;
  const name = `vybe-${config.version}-${versionCode}.apk`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'app', 'android'), { recursive: true });
  copyFileSync(apk, join(out, 'app', 'android', name));
  const latest = { versionCode, versionName: config.version, url: `${API_URL}/app/android/${name}` };
  writeFileSync(join(out, 'app', 'android', 'latest.json'), JSON.stringify(latest));
  upload('app/android/latest.json');
  console.log(`APK ${name} published: ${latest.url}`);
}

const cmd = process.argv[2];
if (cmd === 'ota') publishOta();
else if (cmd === 'apk') publishApk();
else {
  console.error('usage: node scripts/publish.mjs ota|apk');
  process.exit(1);
}
