const fs = require('fs-extra');
const path = require('path');

// List of file/folder names to exclude
const exemptNames = ['nodes.json', 'edges.json'];

const filter = (src) => {
  const basename = path.basename(src);
  return !exemptNames.includes(basename);
};

// Copy assets to 'docs/assets'
fs.copySync('./assets', './docs/assets', { filter });

// Additional copy
fs.copySync('./assets', './docs/duForce/assets', { filter });

console.log('Assets copied successfully');
