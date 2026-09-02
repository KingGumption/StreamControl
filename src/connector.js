const { appConfig, requireDeploymentConfig } = require('./app-config');
const { ConnectorRuntime } = require('./connector-runtime');

requireDeploymentConfig(appConfig);
if (appConfig.mode !== 'connector') throw new Error('Set APP_MODE=connector before starting the local connector');

const connector = new ConnectorRuntime({ config: appConfig });
connector.start();

async function shutdown() {
  await connector.stop();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
