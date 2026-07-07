const fs = require('fs-extra');
const path = require('path');

// List of file/folder names to exclude
const exemptNames = ['nodes.json', 'edges.json'];

const filter = (src) => {
  const basename = path.basename(src);
  return !exemptNames.includes(basename);
};

// Copy source assets (excluding JSON files)
fs.copySync('./assets', './docs/assets', { filter });
fs.copySync('./assets', './docs/duForce/assets', { filter });

// Copy the built index.html
fs.copySync('./docs/index.html', './docs/duForce/index.html');

// Copy the built assets (hashed JS/CSS/etc.)
fs.copySync('./docs/assets', './docs/duForce/assets');



console.log('Assets copied successfully');
