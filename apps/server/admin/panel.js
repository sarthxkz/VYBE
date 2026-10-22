// Vybe admin panel. Tokens live in memory only (a reload means signing in again), every value from the
// server is rendered with textContent (never innerHTML), and the session ends after 15 idle minutes.
'use strict';

const IDLE_MS = 15 * 60_000;
const REFRESH_MS = 30_000;
let tokens = null;
let idleTimer = null;
let pollTimer = null;

const $ = (id) => document.getElementById(id);

/** Builds an element. Strings become text nodes, so nothing from the server is ever parsed as HTML. */
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const fmt = new Intl.NumberFormat();
const num = (n) => fmt.format(n ?? 0);
function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function duration(sec) {
  const d = Math.floor(sec / 86400), hr = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${hr}h` : hr ? `${hr}h ${m}m` : `${m}m`;
}
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '–');
const row = (label, value) => h('div', { class: 'row' }, h('span', { class: 'muted' }, label), h('span', null, value));

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- API ----------

class ApiError extends Error {
  constructor(status, code) {
    super(code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function call(path, opts = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
  const res = await fetch(`/v1${path}`, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
  if (res.status === 401 && tokens && retry) {
    // Access tokens last 15 minutes; rotate once, then give up and ask for the password again.
    const r = await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens.refreshToken }) });
    if (r.ok) {
      tokens = await r.json();
      return call(path, opts, false);
    }
    signedOut('Your session ended. Sign in again.');
    throw new ApiError(401, 'SESSION_ENDED');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code);
  return data;
}

// ---------- Session ----------

function bumpIdle() {
  clearTimeout(idleTimer);
  if (tokens) idleTimer = setTimeout(() => logout('Signed out after 15 minutes without activity.'), IDLE_MS);
}
['click', 'keydown', 'pointermove'].forEach((e) => document.addEventListener(e, bumpIdle, { passive: true }));

function signedOut(message) {
  tokens = null;
  clearInterval(pollTimer);
  clearTimeout(idleTimer);
  $('app').hidden = true;
  $('login').hidden = false;
  $('password').value = '';
  const err = $('login-error');
  err.hidden = !message;
  err.textContent = message || '';
}

async function logout(message) {
  if (tokens) await call('/auth/logout', { body: {} }, false).catch(() => {});
  signedOut(message);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  const err = $('login-error');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  err.hidden = true;
  try {
    const res = await fetch('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value, deviceName: 'Admin panel (web)' }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const code = data?.error?.code;
      throw new Error(
        code === 'RATE_LIMITED' ? 'Too many attempts. Wait a few minutes and try again.'
        : code === 'EMAIL_NOT_VERIFIED' ? 'Verify this account’s email in the app first.'
        : code === 'ACCOUNT_SUSPENDED' ? 'This account is suspended.'
        : 'Email or password is incorrect.',
      );
    }
    tokens = data;
    try {
      await load();
    } catch (x) {
      if (x instanceof ApiError && x.status === 403) {
        await logout(); // don't leave a session behind for a non-admin account
        throw new Error('This account doesn’t have admin access.');
      }
      throw x;
    }
    $('password').value = '';
    $('login').hidden = true;
    $('app').hidden = false;
    bumpIdle();
    schedule();
  } catch (x) {
    err.textContent = x.message || 'Couldn’t sign in.';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('logout').addEventListener('click', () => logout());
$('refresh').addEventListener('click', () => load().then(() => toast('Updated')).catch(() => toast('Couldn’t refresh')));
$('auto').addEventListener('change', schedule);

function schedule() {
  clearInterval(pollTimer);
  // Polling is not user activity, so it never extends the idle timeout.
  if ($('auto').checked) pollTimer = setInterval(() => void load().catch(() => {}), REFRESH_MS);
}

// ---------- Tabs ----------

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    for (const t of ['overview', 'reports', 'errors']) $(`tab-${t}`).hidden = t !== b.dataset.tab;
  }),
);

// ---------- Rendering ----------

async function load() {
  const [o, reports] = await Promise.all([call('/admin/overview'), call('/admin/reports?status=OPEN')]);
  renderOverview(o);
  renderReports(reports.reports);
  renderErrors(o.clientErrors);
  $('updated').textContent = `Updated ${new Date(o.generatedAt).toLocaleTimeString()}`;
}

function kpi(label, value, sub, i) {
  return h('div', { class: 'card kpi', style: { animationDelay: `${i * 40}ms` } }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
}

function health(label, state, detail) {
  return h('div', { class: 'pill' }, h('span', { class: `dot ${state}` }), h('div', null, h('strong', null, label), h('div', { class: 'muted', style: { fontSize: '12px' } }, detail)));
}

function renderOverview(o) {
  const memPct = o.server.host.totalMem ? 1 - o.server.host.freeMem / o.server.host.totalMem : 0;
  const diskPct = o.storage.disk ? 1 - o.storage.disk.free / o.storage.disk.total : 0;
  const load1 = o.server.host.load[0] / Math.max(1, o.server.host.cpus);
  $('health').replaceChildren(
    health('API', 'good', `Up ${duration(o.server.uptimeSec)} · v${o.server.version}`),
    health('Database', o.db.ok ? (o.db.latencyMs > 50 ? 'warn' : 'good') : 'bad', o.db.ok ? `${o.db.latencyMs} ms · ${bytes(o.db.sizeBytes)}` : 'Not reachable'),
    health('Realtime', 'good', `${num(o.realtime.sockets)} sockets · ${num(o.realtime.usersOnline)} online`),
    health('Disk', diskPct > 0.9 ? 'bad' : diskPct > 0.75 ? 'warn' : 'good', o.storage.disk ? `${Math.round(diskPct * 100)}% used · ${bytes(o.storage.disk.free)} free` : 'Unknown'),
    health('Push', o.server.push ? 'good' : 'warn', o.server.push ? 'FCM configured' : 'FCM not configured'),
    health('Email', o.server.mail ? 'good' : 'warn', o.server.mail ? 'SMTP configured' : 'SMTP not configured'),
  );

  const u = o.users;
  $('kpi-users').replaceChildren(
    ...[
      ['Total users', num(u.total), `${num(u.verified)} verified`],
      ['New today', num(u.new24h), `${num(u.new7d)} this week`],
      ['Active today', num(u.active24h), `${num(u.active7d)} this week`],
      ['Online now', num(o.realtime.usersOnline), `${num(u.activeSessions)} signed-in devices`],
      ['Admins', num(u.admins), null],
      ['Suspended', num(u.suspended), null],
    ].map(([l, v, s], i) => kpi(l, v, s, i)),
  );

  const max = Math.max(1, ...u.signupsByDay.map((d) => d.count));
  $('signups').replaceChildren(
    ...u.signupsByDay.map((d, i) =>
      h(
        'div',
        { class: 'bar', title: `${d.day}: ${d.count}` },
        h('span', null, d.count || ''),
        h('i', { style: { height: `${(d.count / max) * 100}%`, animationDelay: `${i * 30}ms` } }),
        h('span', null, d.day.slice(8)),
      ),
    ),
  );

  $('kpi-activity').replaceChildren(
    row('Friendships', num(o.social.friendships)),
    row('Pending friend requests', num(o.social.pendingRequests)),
    row('Sharing location now', num(o.location.sharingNow)),
    row('In Ghost Mode', num(o.location.ghostMode)),
    row('Photos (today / all time)', `${num(o.content.photos24h)} / ${num(o.content.photos)}`),
    row('Live stories', num(o.content.liveStories)),
    row('Story views today', num(o.content.storyViews24h)),
    row('Encrypted messages awaiting delivery', num(o.content.pendingMessages)),
    row('Encrypted chat backups', num(o.content.chatBackups)),
    row('Blocks', num(o.social.blocks)),
  );

  const s = o.server;
  $('server').replaceChildren(
    row('Version', `v${s.version} (${s.env})`),
    row('Node.js', s.node),
    row('Started', when(s.startedAt)),
    row('Memory (RSS / heap)', `${bytes(s.memory.rss)} / ${bytes(s.memory.heapUsed)}`),
    row('Host', s.host.platform),
    row('CPU load (1/5/15 min)', `${s.host.load.map((x) => x.toFixed(2)).join(' / ')} on ${s.host.cpus} CPU${s.host.cpus === 1 ? '' : 's'}`),
    h('div', { class: 'meter', title: 'Load per CPU' }, h('i', { style: { width: `${Math.min(100, load1 * 100)}%` } })),
    row('Host memory used', `${Math.round(memPct * 100)}% of ${bytes(s.host.totalMem)}`),
    h('div', { class: 'meter' }, h('i', { style: { width: `${memPct * 100}%` } })),
    row('Host uptime', duration(s.host.uptimeSec)),
    row('Google sign-in', s.googleSignIn ? 'Enabled' : 'Off'),
  );

  const st = o.storage;
  $('storage').replaceChildren(
    row('Media files', `${num(st.mediaFiles)} · ${bytes(st.mediaBytes)}`),
    ...st.byKind.map((k) => row(k.kind === 'CHAT_BLOB' ? 'Encrypted chat attachments' : k.kind === 'PHOTO' ? 'Photos & stories' : 'Avatars', `${num(k.files)} · ${bytes(k.bytes)}`)),
    st.disk ? row('Disk', `${bytes(st.disk.total - st.disk.free)} used of ${bytes(st.disk.total)}`) : null,
    st.disk ? h('div', { class: 'meter' }, h('i', { style: { width: `${diskPct * 100}%` } })) : null,
  );

  $('db').replaceChildren(
    row('Status', o.db.ok ? 'Connected' : 'Not reachable'),
    row('Query latency', `${o.db.latencyMs} ms`),
    row('Database size', bytes(o.db.sizeBytes)),
    h('h3', { style: { marginTop: '12px' } }, 'Latest migrations'),
    ...(o.db.migrations.length ? o.db.migrations.map((m) => row(m.name, m.finishedAt ? when(m.finishedAt) : 'not finished')) : [h('div', { class: 'muted' }, 'None found')]),
  );

  // Served by Caddy next to the API.
  fetch('/app/android/latest.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((a) =>
      $('release').replaceChildren(
        ...(a ? [row('Latest APK', `${a.versionName} (code ${a.versionCode})`), row('Download', h('a', { href: a.url, rel: 'noopener' }, 'APK link'))] : [h('div', { class: 'muted' }, 'No APK published here.')]),
      ),
    )
    .catch(() => $('release').replaceChildren(h('div', { class: 'muted' }, 'Couldn’t read latest.json.')));

  $('audit').replaceChildren(
    row('Failed sign-ins', num(o.security.failedLogins24h)),
    ...o.security.auditByType24h.map((a) => row(a.type, num(a.count))),
  );

  const badge = $('reports-badge');
  badge.hidden = !o.moderation.openReports;
  badge.textContent = String(o.moderation.openReports);
}

function renderReports(list) {
  const box = $('reports');
  if (!list.length) return box.replaceChildren(h('div', { class: 'card empty' }, 'No open reports. 🎉'));
  box.replaceChildren(
    ...list.map((r) => {
      const act = async (action, label) => {
        if (action !== 'NONE' && !confirm(`${label}? This can't be undone from here.`)) return;
        try {
          await call(`/admin/reports/${encodeURIComponent(r.id)}/resolve`, { body: { action } });
          toast('Report resolved');
          await load();
        } catch {
          toast('Couldn’t resolve the report');
        }
      };
      return h(
        'div',
        { class: 'card report' },
        h('div', { class: 'meta' }, h('span', { class: 'tag' }, r.reason), h('strong', null, `@${r.target?.username ?? 'unknown'}`), r.target?.suspendedAt ? h('span', { class: 'tag' }, 'suspended') : null, h('span', { class: 'muted' }, when(r.createdAt))),
        r.details ? h('p', { class: 'details' }, r.details) : null,
        r.photoPost ? h('div', { class: 'muted' }, `About a photo${r.photoPost.caption ? `: “${r.photoPost.caption}”` : ''}`) : null,
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'soft', onclick: () => act('NONE', 'Dismiss') }, 'Dismiss'),
          r.photoPost ? h('button', { class: 'soft', onclick: () => act('REMOVE_PHOTO', 'Remove the photo') }, 'Remove photo') : null,
          h('button', { class: 'danger', onclick: () => act('SUSPEND', `Suspend @${r.target?.username ?? 'this user'} and sign them out everywhere`) }, 'Suspend user'),
        ),
      );
    }),
  );
}

function renderErrors(list) {
  const box = $('errors');
  if (!list.length) return box.replaceChildren(h('div', { class: 'card empty' }, 'No crashes reported since the server started.'));
  box.replaceChildren(
    h(
      'div',
      { class: 'card list' },
      ...list.map((e) => h('div', { class: 'row', style: { flexDirection: 'column', gap: '4px' } }, h('code', null, e.message), h('span', { class: 'muted', style: { textAlign: 'left' } }, `${when(e.at)} · ${e.path || 'unknown screen'} · app ${e.version || '?'}${e.updateId ? ` · update ${e.updateId.slice(0, 8)}` : ''}`))),
    ),
  );
}

signedOut();
