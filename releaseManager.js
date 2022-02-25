const cproc = require("child_process");
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const rimraf = require('rimraf');
const axios = require('axios');
const unzip = require('extract-zip');
const APP_DIR = path.resolve(__dirname, './apps');
const WORK_DIR = path.resolve(__dirname, './__installer');

const exec = (cmd, dir) => new Promise(r => cproc.exec(cmd, { cwd: dir }, (_, out) => r(out)));
const copyFile = (src, dest) => new Promise(r => fs.copyFile(src, dest, r));
const readFile = (filePath, enc) => new Promise(r => fs.readFile(filePath, enc, (_, data) => r(data)));
const writeFile = (filePath, content) => new Promise(r => fs.writeFile(filePath, content, (_, data) => r(data)));
const readdir = filePath => new Promise(r => fs.readdir(filePath, (_, data) => r(data)));
const lstat = filePath => new Promise(r => fs.lstat(filePath, (_, data) => r(data)));
const mkdir = filePath => new Promise(r => fs.mkdir(filePath, r));
const rm = filePath => new Promise(r => rimraf(filePath, r));

async function readJson(filePath, encoding = 'utf8') {
  if (fs.existsSync(filePath)) {
    const rawData = await readFile(filePath, encoding);

    if (rawData) {
      return JSON.parse(rawData);
    }
  }
}

async function copyFolder(src, dest) {
  const contents = await readdir(src);
  await mkdir(dest);

  for (let i = 0; i < contents.length; i++) {
    const sourcePath = path.resolve(src, contents[i]);
    const destPath = path.resolve(dest, contents[i]);
    const item = await lstat(sourcePath);

    if (item.isFile()) {
      await copyFile(sourcePath, destPath);
    }
    else {
      await copyFolder(sourcePath, destPath);
    }
  }
}

async function githubApi(app, uri, saveDest) {
  const result = {};

  if (app?.source) {
    const repo = (app.source?.repository || '').match(/^.*github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/|\#|$)/);

    if (repo?.length > 2) {
      const repoUrlBase = `https://api.github.com/repos/${repo[1]}/${repo[2]}`;
      const options = {};

      if (app.source.username && app.source.password) {
        options.auth = {
          username: app.source.username,
          password: app.source.password
        }
      };

      if (saveDest) {
        try {
          options.headers = { 'Accept': 'application/octet-stream' };
          options.responseType = 'stream';
          const writer = fs.createWriteStream(path.resolve(saveDest));
          const response = await axios.get(`${repoUrlBase}${uri}`, options);

          await new Promise(r => stream.pipeline(response.data, writer, r));
        }
        catch (error) {
          console.error(`Unable to download file`);
          console.log(error);
          result.failed = true;
        }
      }
      else {
        try {
          const response = await axios.get(`${repoUrlBase}${uri}`, options);
          if (response.status === 200 && response.data) {
            result.data = response.data;
          }
          else {
            console.error('API request failed');
            result.failed = true;
          }
        }
        catch (error) {
          console.error(`[${error?.response?.status || 0}] API request failed for ${repoUrlBase}${uri}`);
          result.failed = true;
        }
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
  await mkdir(APP_DIR);

  if (app?.name && app?.source) {
    console.log(`Getting release info for ${app.name}...`);
    const localVersion = await readJson(path.resolve(APP_DIR, app.name, '_VERSION'));
    result.local = {};
    result.remote = {};

    if (localVersion?.tag) {
      console.log(`Local version: ${localVersion.tag}`);
      const { tag, installDate } = localVersion;
      result.local.status = 'installed';
      result.local.tag = tag;

      if (Date.parse(installDate)) {
        result.local.installDate = new Date(installDate);
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

  if (app?.name && app?.source) {
    const currentState = await getInfo(app);

    if ((currentState?.remote?.all || []).length > 0) {
      const releaseList = currentState.remote.all;
      let releaseTarget;

      if (typeof release === 'string') {
        releaseTarget = releaseList.find(x => x.tag === release);
      }
      else if (typeof release === 'number') {
        releaseTarget = releaseList.find(x => x.id === release);
      }
      else {
        releaseTarget = releaseList[0];
      }

      if (releaseTarget?.id) {
        if (currentState?.local?.tag !== releaseTarget?.tag) {
          console.log(`== Preparing to update '${app.name}' to version ${releaseTarget.tag} ==`);
          console.log('Cleaning workspace...');
          await rm(WORK_DIR);
          await mkdir(WORK_DIR);

          console.log('Fetching manifest...');

          const assetInfo = await githubApi(app, `/releases/${releaseTarget.id}/assets`);

          if (assetInfo.data && assetInfo.data.length > 0) {
            for (let i = 0; i < assetInfo.data.length; i++) {
              const asset = assetInfo.data[i];
              console.log(`Downloading ${asset.name}...`);
              await githubApi(app, `/releases/assets/${asset.id}`, `${WORK_DIR}/${asset.name}`);
              if (/\.zip$/.test(asset.name)) {
                console.log(`Extracting ${asset.name}...`);
                await unzip(`${WORK_DIR}/${asset.name}`, { dir: WORK_DIR });
                await rm(`${WORK_DIR}/${asset.name}`);
              }
            }
          }
          else {
            console.error('Unable to fetch assets for this version');
            result.failed = true;
          }

          if (app.commands?.setup) {
            console.log('Running setup...');
            const test = await exec(app.commands.setup, WORK_DIR);
            console.dir(test, { depth: null });
          }

          console.log('Replacing old version...');
          const appBase = path.resolve(APP_DIR, app.name);
          await rm(appBase);
          await mkdir(appBase);
          await copyFolder(WORK_DIR, appBase);
        
          console.log('Tagging new copy...');
          const versionFile = path.resolve(appBase, '_VERSION');
          const tagData = JSON.stringify({
            tag: releaseTarget.tag,
            installDate: new Date()
          }, null, '\t');
          await writeFile(versionFile, tagData);
          console.log('== Update successful ==');
        }
        else {
          console.log(`Version ${releaseTarget.tag} is already installed`);
        }
      }
      else {
        console.error(`Could not find a matching release for ${release}`);
        result.failed = true;
      }
    }
    else {
      console.error('Could not fetch release list');
      result.failed = true;
    }
  }
  else {
    console.error('Invalid app or version');
    result.failed = true;
  }

  return result;
}

async function clean() {
  console.log('Cleaning work directory...');
  await rm(WORK_DIR);
  console.log('Cleaning app directory...');
  await rm(APP_DIR);
}

module.exports = {
  getInfo,
  install,
  clean
};