const path = require('path');
const express = require('express');
const webProccess = express();
const server = require('http').Server(webProccess);
const { createProxyMiddleware } = require('http-proxy-middleware');
const { config } = require('./configManager');
const releaseManager = require('./releaseManager');
const proxyManager = require('./proxyManager');

const abs = relativePath => path.resolve(__dirname, relativePath);

//app.use('/assets', express.static(abs('apps/web/assets')));

//webProccess.use(express.static(abs('apps/web')));

//app.get('*', (req, res) => {
//  res.sendFile(abs('apps/web/index.html'));
//});

init().then(() => {
  server.listen(config.serverPort, async callback => {
    console.log(`Server running on port ${config.serverPort}`);
  });
});

async function init() {
  await allApps(app => releaseManager.install(app));
  await allApps(app => wireUp(app));
  //console.dir(test, { depth: null });
}

async function wireUp(app) {
  if (app?.name && app?.type) {
    const rootPath = app.rootPath || '/';

    if (app.type.toUpperCase() === 'STATIC') {
      console.log(`${app.name} will serve static files from ${rootPath}`);
      webProccess.use(rootPath, express.static(abs(`apps/${app.name}`)));
    } 
    else if (app.type.toUpperCase() === 'PROCESS') {
      if (app.httpPort) {
        console.log(`${app.name} will proxy traffic from ${rootPath}`);
        webProccess.use(rootPath, createProxyMiddleware({
          target: `http://localhost:${app.httpPort}`,
          changeOrigin: true,
          logLevel: 'silent'
        }));
      }
      if (app.socketPort) {
        console.log(`${app.name} will proxy websocket requests`);
        const wsProxy = createProxyMiddleware({
          target: `ws://localhost:${app.socketPort}`,
          ws: true,
          logLevel: 'silent'
        });
        server.on('upgrade', wsProxy.upgrade);
        webProccess.use('/ws', wsProxy);
      }
    } 
    else {
      console.error('Invalid app type!');
    }
  }
  else {
    console.error('Invalid app configuration!');
  }
}

async function allApps(func) {
  for (let i = 0; i < (config?.apps?.length || 0); i++) {
    await func(config.apps[i]);
  }
}

process.on('SIGINT', async () => {
  console.log('Service shutting down!');
  await allApps(app => releaseManager.tryStop(app));
  process.exit(0);
});