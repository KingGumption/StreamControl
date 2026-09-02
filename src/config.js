const fs = require('node:fs');
const path = require('node:path');
const { getConfigValue, setConfigValue, listOverrides } = require('./db');
const { defaultCommandPermissions, DEFAULT_PERMISSION_PRESETS } = require('./permissions');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'permissions.json');

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
  ensureDataFile();
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
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
  const config = readConfig();
  const dbConfig = getConfigValue('permissions_config', config);
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
  return config;
}

function saveConfig(config) {
  setConfigValue('permissions_config', config);
  writeConfig(config);
  return config;
}

module.exports = {
  readConfig,
  writeConfig,
  saveConfig,
  getLiveConfig,
  CONFIG_PATH,
};
