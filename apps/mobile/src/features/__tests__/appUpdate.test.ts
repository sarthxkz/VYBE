import { newerApk } from '../appUpdateCheck';

const api = 'https://api.example';
const apk = { versionCode: 3, versionName: '0.2.0', url: `${api}/app/android/vybe-0.2.0-3.apk` };

test('offers only a newer APK from our own https host', () => {
  expect(newerApk(apk, 2, api)).toEqual(apk);
  expect(newerApk(apk, 3, api)).toBeNull();
  expect(newerApk({ ...apk, url: 'https://evil.example/app/android/x.apk' }, 2, api)).toBeNull();
  expect(newerApk(apk, 2, 'http://api.example')).toBeNull();
  expect(newerApk({ versionCode: '9' }, 2, api)).toBeNull();
  expect(newerApk(null, 2, api)).toBeNull();
});
