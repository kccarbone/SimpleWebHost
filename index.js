const path = require('path');
const express = require('express');
const webProccess = express();
const server = require('http').Server(webProccess);
const ws = require('ws');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { config } = require('./configManager');
const releaseManager = require('./releaseManager');
const proxyManager = require('./proxyManager');
const SERVER_PORT = config.serverPort || 18000;
const SETUP_PATH = config.setupPath || '/setup';

const abs = relativePath => path.resolve(__dirname, relativePath);
const fuzzyMatch = (a, b) => ((a || '').toLowerCase() === (b || '').toLowerCase());

init().then(() => {
  server.listen(SERVER_PORT, async callback => {
    console.log(`Server running on port ${SERVER_PORT}`);
  });
});

async function init() {
  await allApps(app => releaseManager.install(app));
  await allApps(app => releaseManager.tryStart(app));
  await allApps(app => wireUp(app));
  //console.dir(test, { depth: null });

  const wss = new ws.WebSocketServer({
    path: `${SETUP_PATH}/status`,
    noServer: true
  });


  server.on('upgrade', (req, socket, head) => {
    console.log(`upgrade request for ${req.url}`);
    if (fuzzyMatch(req.url, `${SETUP_PATH}/status`)) {
      wss.handleUpgrade(req, socket, head, conn => wss.emit('connection', conn, req));
    }
  });

  wss.on('connection', conn => {
    conn.send(JSON.stringify([ {app: 'api', status: 'ready'}]));
  });

  webProccess.get(`${SETUP_PATH}/:appName/updates`, async (req, res) => {
    const app = config.apps.find(x => fuzzyMatch(x.name, req.params.appName));

    if (app) {
      if (app.status !== 'updating') {
        const result = await releaseManager.getInfo(app);
        console.dir(result, { depth: null });
        res.send(result);
      }
      else {
        res.status(400).send({ message: 'App is currently updating' });
      }
    }
    else {
      res.status(404).send({ message: 'App not found' });
    }
  });

  webProccess.put(`${SETUP_PATH}/:appName/install/:tag`, async (req, res) => {
    console.log(req.params);
    const app = config.apps.find(x => fuzzyMatch(x.name, req.params.appName));

    if (app) {
      if (app.status !== 'updating') {
        releaseManager.install(app, req.params.tag);
        res.send({ message: 'Update in progress' });
      }
      else {
        res.status(400).send({ message: 'App is currently updating' });
      }
    }
    else {
      res.status(404).send({ message: 'App not found' });
    }
  });
}

async function wireUp(app) {
  if (app?.name && app?.type) {
    const rootPath = app.rootPath || '/';
    const socketPath = app.socketPath || '/';

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
        const wsProxy = createProxyMiddleware(socketPath, {
          target: `ws://localhost:${app.socketPort}`,
          changeOrigin: true,
          ws: true,
          logLevel: 'silent'
        });
        server.on('upgrade', wsProxy.upgrade);
        //webProccess.use(socketPath, wsProxy);
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