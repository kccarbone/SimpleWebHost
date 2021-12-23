const fs = require('fs');
const express = require('express');
const app = express();
const server = require('http').Server(app);
const axios = require('axios');
const { response } = require('express');
const { config } = require('./configManager');
const releaseManager = require('./releaseManager');


app.get('*', (req, res) => {
  res.send(events);
});

init().then(() => {
  //server.listen(config.serverPort, async callback => {
  //  console.log(`Server running on port ${config.serverPort}`);
  //});
});

async function init() {
  const test = await releaseManager.getInfo(config.apps[0]);

  console.dir(test, { depth: null });

  await releaseManager.install(config.apps[0], test.remote.all[0]);
}