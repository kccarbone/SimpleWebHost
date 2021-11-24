const fs = require('fs');
const express = require('express');
const app = express();
const server = require('http').Server(app);
const axios = require('axios');
const { response } = require('express');
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));


app.get('*', (req, res) => {
  res.send(events);
});

init().then(() => {
  server.listen(config.serverPort, async callback => {
    console.log(`Server running on port ${config.serverPort}`);
  });
});

async function init() {
  if (!fs.existsSync('./web')) {
    console.log('Initializing web site...');
    var repo = (config.githubProject || '').match(/^.*github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/|\#|$)/);

    if (repo && repo.length > 2) {
      const repoUrlBase = `https://api.github.com/repos/${repo[1]}/${repo[2]}`;
      const options = {};

      if (config.githubUsername && config.githubPassword) {
        options.auth = {
          username: config.githubUsername,
          password: config.githubPassword
        }
      };

      try {
        const releaseInfo = await axios.get(`${repoUrlBase}/releases`, options);
        if (releaseInfo.data && releaseInfo.data.length > 0) {
          const releases = releaseInfo.data.sort((a, b) => b.id - a.id);
          console.log(`Latest release found: ${releases[0].name}`);
        }
        else {
          console.error(`No releases found at ${repoUrlBase}/releases`);
          process.exit(3);
        }
      }
      catch(error) {
        console.error(`Unable to access git repository at ${repoUrlBase} [${error?.response?.status || 0}]`);
        process.exit(2);   
      }
    }
    else {
      console.error('Missing or invalid configuration value: githubProject');
      process.exit(1);
    }

    process.exit(0);
  }
}