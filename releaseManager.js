const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const axios = require('axios');
const WORK_DIR = path.resolve(__dirname, './__installer');

const mkdir = path => new Promise(r => fs.mkdir(path, r));
const rm = path => new Promise(r => rimraf(path, r));

async function githubApi(app, path) {
  const result = {};

  if (app && app.source) {
    const repo = (app.source?.repository || '').match(/^.*github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/|\#|$)/);

    if (repo && repo.length > 2) {
      const repoUrlBase = `https://api.github.com/repos/${repo[1]}/${repo[2]}`;
      const options = {};

      if (app.source.username && app.source.password) {
        options.auth = {
          username: app.source.username,
          password: app.source.password
        }
      };

      try {
        const response = await axios.get(`${repoUrlBase}${path}`, options);
        if (response.status === 200 && response.data) {
          result.data = response.data;
        }
        else {
          console.error('API request failed');
          result.failed = true;
        }
      }
      catch (error) {
        console.error(`Unable to access git repository at ${repoUrlBase} [${error?.response?.status || 0}]`);
        result.failed = true;
      }
    }
    else {
      console.error('Unable to parse source url');
      result.failed = true;
    }
  }
  else {
    console.error('Invalid app');
    result.failed = true;
  }

  return result;
}

async function getInfo(app) {
  const result = {};

  if (app && app.name && app.source && app.localPath) {
    console.log(`Getting release info for ${app.name}...`);
    const localVersionFile = path.resolve(__dirname, app.localPath, '_VERSION');
    result.local = {};
    result.remote = {};
    
    if (fs.existsSync(localVersionFile)) {
      const localVersion = JSON.parse(fs.readFileSync(localVersionFile, 'utf8'));

      if (localVersion && localVersion.tag) {
        console.log(`Local version: ${localVersion.tag}`);
        const { tag, installDate } = localVersion;
        result.local.status = 'installed';
        result.local.tag = tag;

        if (Date.parse(installDate)) {
          result.local.installDate = new Date(installDate);
        }
      }
      else {
        console.log('Invalid version file!');
        result.local.status = 'invalid';
      }
    }
    else {
      console.log('Local copy not found!');
      result.local.status = 'missing';
    }

    const releaseInfo = await githubApi(app, '/releases');

    if (releaseInfo.data && releaseInfo.data.length > 0) {
      const releases = releaseInfo.data.sort((a, b) => b.id - a.id).map(x => ({
        id: x.id,
        tag: x.name,
        published: x.published_at
      }));
      result.remote.all = releases;
      result.remote.latest = releases[0].tag;
      console.log(`Latest release found: ${releases[0].tag}`);
      //console.dir(releases[0], { depth: null });

      if (result.remote.latest !== result.local.tag) {
        result.updateAvailable = true;
      }
    }
    else {
      console.error('No releases found!');
      result.remote.all = [];
    }
  }
  else {
    console.error('Invalid app');
    result.failed = true;
  }

  return result;
}

async function install(app, release) {
  const result = {};

  if (app && app.name && app.source && app.localPath && release && release.id && release.tag) {
    console.log('Cleaning workspace...');
    await rm(WORK_DIR);
    await mkdir(WORK_DIR);

    console.log(`Getting assets for ${app.name} version ${release.tag}...`);

    const assetInfo = await githubApi(app, `/${release.id}/assets`);

    if (assetInfo.data && assetInfo.data.length > 0) {
      for (let i = 0; i < assetInfo.data.length; i++){
        const artifact = await githubApi(app, `/assets/${assetInfo.data[i].id}`);
        // download as file (application/octet-stream)
      }
    }
    else {
      console.error('Unable to fetch assets for this version');
      result.failed = true;
    }
  }
  else {
    console.error('Invalid app or version');
    result.failed = true;
  }

  return result;
}


module.exports = {
  getInfo,
  install
};