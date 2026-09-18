const { startAdminServer } = require('./admin');
const { appConfig, requireDeploymentConfig } = require('./app-config');
const { integrationRuntime } = require('./integration-runtime');
const { spotifyAuth } = require('./spotify-auth');
const { polaroidRuntime } = require('./polaroid/runtime');
const { bridgeHub } = require('./bridge-hub');

requireDeploymentConfig(appConfig);
if (appConfig.mode === 'connector') throw new Error('Connector mode must be started with npm run connector');
const httpServer = startAdminServer(appConfig.port);
if (appConfig.mode === 'cloud') bridgeHub.attach(httpServer);
polaroidRuntime.start({ streamerBot: integrationRuntime.streamerBot, port: appConfig.port });
integrationRuntime.start();
spotifyAuth.initialize();

async function shutdown() {
  integrationRuntime.stop();
  await polaroidRuntime.stop();
  bridgeHub.close();
  await require('./analytics-service').close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
