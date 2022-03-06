const releaseManager = require('./releaseManager');
const webEngine = require('./webEngine');
const { config } = require('./configManager');
const SERVER_PORT = config.serverPort || process.env.SERVERPORT || 18000;

async function init() {
  const web = new webEngine();

  await allApps(app => releaseManager.install(app));
  await allApps(app => releaseManager.tryStart(app));
  await allApps(app => web.addApp(app));
  //console.dir(test, { depth: null });

  return web.server;
}

async function allApps(func) {
  for (let i = 0; i < (config?.apps?.length || 0); i++) {
    await func(config.apps[i]);
  }
}

init().then(server => {
  server.listen(SERVER_PORT, () => {
    console.log(`Server running on port ${SERVER_PORT}`);
  });
});

process.on('SIGINT', async () => {
  console.log('Service shutting down!');
  await allApps(app => releaseManager.tryStop(app));
  process.exit(0);
});