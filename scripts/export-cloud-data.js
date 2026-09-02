const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { appConfig } = require('../src/app-config');

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.resolve(process.argv[2] || path.join(__dirname, '..', 'backups', `cloud-migration-${stamp}`));
  fs.mkdirSync(destination, { recursive: true });
  const sourceDatabase = path.join(appConfig.dataDir, 'permissions.db');
  if (fs.existsSync(sourceDatabase)) {
    const database = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
    await database.backup(path.join(destination, 'permissions.db'));
    database.close();
  }
  for (const entry of ['polaroid-config.json', 'polaroid-captures']) {
    const source = path.join(appConfig.dataDir, entry);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(destination, entry), { recursive: true });
  }
  fs.writeFileSync(path.join(destination, 'README.txt'), [
    'StreamEngagement cloud migration export',
    `Created: ${new Date().toISOString()}`,
    'Copy these files into the cloud service DATA_DIR (/var/data on Render) while the service is stopped.',
    'polaroid-config.json can contain webhook or OBS credentials; transfer and store this export securely.',
  ].join('\n'));
  console.log(`Cloud migration export created at ${destination}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
