const path = require('path');
const express = require('express');

const abs = relativePath => path.resolve(__dirname, relativePath);

function staticWeb(app) {
  if (app?.name) {
    return express.static(abs(`apps/${app.name}`));
  }
  
  console.error('Invalid app');
}

module.exports = {
  staticWeb
};