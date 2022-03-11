
const express = require('express');
const path = require('path');
const http = require('http');
const ws = require('ws');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { config } = require('./configManager');
const releaseManager = require('./releaseManager');
const SETUP_PATH = config.setupPath || '/setup';

const abs = relativePath => path.resolve(__dirname, relativePath);
const fuzzyMatch = (a, b) => ((a || '').toLowerCase() === (b || '').toLowerCase());

function create() {
  const proxy = express();
  const server = http.createServer(proxy);
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

  proxy.get(`${SETUP_PATH}/:appName/updates`, async (req, res) => {
    const app = config.apps.find(x => fuzzyMatch(x.name, req.params.appName));

    if (app) {
      if (app.status !== 'updating') {
        const result = await releaseManager.getInfo(app, wss);
        //console.dir(result, { depth: null });
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

  proxy.put(`${SETUP_PATH}/:appName/install/:tag`, async (req, res) => {
    console.log(req.params);
    const app = config.apps.find(x => fuzzyMatch(x.name, req.params.appName));

    if (app) {
      if (app.status !== 'updating') {
        releaseManager.install(app, req.params.tag, wss);
        res.status(202).end();
      }
      else {
        res.status(400).send({ message: 'App is currently updating' });
      }
    }
    else {
      res.status(404).send({ message: 'App not found' });
    }
  });

  return {
    server,
    proxy,
    addApp: app => addApp(server, proxy, app)
  }
}

async function addApp(server, proxy, app) {
  if (app?.name && app?.type) {
    const rootPath = app.rootPath || '/';
    const socketPath = app.socketPath || '/';

    if (app.type.toUpperCase() === 'STATIC') {
      console.log(`${app.name} will serve static files from ${rootPath}`);
      proxy.use(rootPath, express.static(abs(`apps/${app.name}`)));
      
      if (app.catchall) {
        const index = `apps/${app.name}/${app.catchall}`;
        console.log(`unmatched requests mapped to ~/${index}`);
        proxy.use('*', (req, res) => res.sendFile(abs(index)));
      }
    } 
    else if (app.type.toUpperCase() === 'PROCESS') {
      if (app.httpPort) {
        console.log(`${app.name} will proxy traffic from ${rootPath}`);
        proxy.use(rootPath, createProxyMiddleware({
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

module.exports = create;