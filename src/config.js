const fs = require('node:fs');
const path = require('node:path');
const { getConfigValue, setConfigValue, listOverrides, getConfigRevision } = require('./db');
const { defaultCommandPermissions, DEFAULT_PERMISSION_PRESETS } = require('./permissions');

const { appConfig } = require('./app-config');
const CONFIG_PATH = path.join(appConfig.dataDir, 'permissions.json');
const LEGACY_PATH = path.join(__dirname, '..', 'data', 'permissions.json');
let cached, revision = -1;

function ensureDataFile() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
      commands: defaultCommandPermissions(),
      presets: DEFAULT_PERMISSION_PRESETS,
      overrides: [],
    }, null, 2));
  }
}

function readConfig() {
  const source = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : LEGACY_PATH;
  const raw = fs.existsSync(source) ? fs.readFileSync(source, 'utf8') : '{}';
  try {
    const json = JSON.parse(raw);
    return {
      commands: json.commands || defaultCommandPermissions(),
      presets: json.presets || DEFAULT_PERMISSION_PRESETS,
      overrides: Array.isArray(json.overrides) ? json.overrides : [],
    };
  } catch {
    return {
      commands: defaultCommandPermissions(),
      presets: DEFAULT_PERMISSION_PRESETS,
      overrides: [],
    };
  }
}

function writeConfig(config) {
  ensureDataFile();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getLiveConfig() {
  if (cached && revision === getConfigRevision()) return structuredClone(cached);
  let dbConfig = getConfigValue('permissions_config');
  if (!dbConfig) { dbConfig = readConfig(); setConfigValue('permissions_config', dbConfig); }
  const config = { commands: defaultCommandPermissions(), presets: DEFAULT_PERMISSION_PRESETS };
  if (dbConfig && dbConfig.commands) {
    config.commands = dbConfig.commands;
  }
  if (dbConfig && dbConfig.presets) {
    config.presets = dbConfig.presets;
  }
  const dbOverrides = listOverrides();
  config.overrides = dbOverrides.map((row) => ({
    id: row.id,
    platform: row.platform,
    username: row.username,
    command: row.command,
    access: row.access,
    user_id: row.user_id,
  }));
  cached = config; revision = getConfigRevision();
  return structuredClone(config);
}

function saveConfig(config) {
  setConfigValue('permissions_config', config);
  cached = null;
  return config;
}

module.exports = {
  readConfig,
  writeConfig,
  saveConfig,
  getLiveConfig,
  CONFIG_PATH,
};
