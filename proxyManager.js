const path = require('path');
const express = require('express');

const abs = relativePath => path.resolve(__dirname, relativePath);

function staticWeb(app) {
  if (app?.name) {
    console.log(`${app.name} will serve static files from /`);
    return express.static(abs(`apps/${app.name}`));
  }
  
  console.error('Invalid app');
}

module.exports = {
  staticWeb
};