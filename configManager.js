const fs = require('fs');
const path = require('path');
const readJson = filename => JSON.parse(fs.readFileSync(path.resolve(__dirname, filename), 'utf8'));

module.exports = {
  config: readJson('./config.json')
};