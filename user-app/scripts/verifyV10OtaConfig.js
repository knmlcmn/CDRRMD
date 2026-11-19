const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const profile = eas.build?.['production-v10-performance'];

const failures = [];
if (app?.version !== '1.0.4') failures.push('Expo app version must remain 1.0.4.');
if (app?.android?.versionCode !== 10) failures.push('Android versionCode must remain 10.');
if (app?.android?.package !== 'ph.gov.calambacity.cdrrmd') failures.push('Android package identity changed.');
if (app?.owner !== 'polmokmoktomi') failures.push('Expo owner must remain polmokmoktomi.');
if (app?.extra?.eas?.projectId !== '5bfee76a-32ab-4691-a88f-98236817fba8') failures.push('EAS project ID changed.');
if (app?.runtimeVersion?.policy !== 'appVersion') failures.push('Runtime policy must remain appVersion.');
if (app?.updates?.enabled !== true) failures.push('Expo Updates must remain enabled.');
if (!app?.updates?.url) failures.push('Expo Updates URL is required.');
if (profile?.channel !== 'production-v10-performance') failures.push('The v10 profile must target production-v10-performance.');
if (profile?.environment !== 'production') failures.push('The v10 profile must use the production environment.');

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('V10 OTA configuration verified: runtime 1.0.4, channel production-v10-performance.');
}
