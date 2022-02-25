const releaseManager = require('./releaseManager');

releaseManager.clean().then(() => console.log('Done!'));
