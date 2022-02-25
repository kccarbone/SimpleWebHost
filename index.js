const fs = require('fs');
const path = require('path');
const express = require('express');
const webProccess = express();
const server = require('http').Server(webProccess);
const axios = require('axios');
const { response } = require('express');
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
  //const test = await releaseManager.getInfo(config.apps[0]);

  //console.dir(test, { depth: null });

  const result = await releaseManager.install(config.apps[0]);

  console.dir(result, { depth: null });

  if (!result.failed) {
    wireUp(config.apps[0]);
  }
}

function wireUp(app) {
  if (app?.name && app?.type) {
    if (app.type.toUpperCase() === 'STATIC') {
      webProccess.use(proxyManager.staticWeb(app));
    } 
    else if (app.type.toUpperCase() === 'PROCESS') {
      webProccess.use(proxyManager.staticWeb(app));
    } 
    else {
      console.error('Invalid app type!');
    }
  }
  else {
    console.error('Invalid app configuration!');
  }
}