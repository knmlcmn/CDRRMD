import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(path: string) {
  const raw = await readFile(resolve(root, path), 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

test('v10 candidate keeps the production identity and uses an isolated OTA runtime', async () => {
  const config = await readJson('app.json');
  assert.equal(config.expo.android.package, 'ph.gov.calambacity.cdrrmd');
  assert.equal(config.expo.android.versionCode, 10);
  assert.equal(config.expo.version, '1.0.4');
  assert.deepEqual(config.expo.runtimeVersion, { policy: 'appVersion' });
  assert.equal(config.expo.updates.enabled, true);
  assert.equal(config.expo.updates.url, 'https://u.expo.dev/5bfee76a-32ab-4691-a88f-98236817fba8');
});

test('candidate build profile uses the dedicated channel and production environment', async () => {
  const eas = await readJson('eas.json');
  const profile = eas.build['production-v10-performance'];
  assert.equal(profile.extends, 'production');
  assert.equal(profile.channel, 'production-v10-performance');
  assert.equal(profile.environment, 'production');
  assert.equal(eas.build.production.android.buildType, 'apk');
});

test('production Firebase configuration matches the Android application identity', async () => {
  const app = await readJson('app.json');
  const firebase = await readJson('google-services.json');
  const packages = firebase.client.map(
    (client: any) => client.client_info.android_client_info.package_name,
  );
  assert.ok(packages.includes(app.expo.android.package));
});
