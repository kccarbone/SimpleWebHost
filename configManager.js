const fs = require('fs');
const path = require('path');

function readJson(filename) {
  const fullPath = path.resolve(__dirname, filename);

  if (!fs.existsSync(fullPath)) {
    console.error(`Missing config file! (${filename})`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

module.exports = {
  config: readJson('./config/config.json')
};