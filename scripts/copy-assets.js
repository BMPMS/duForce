const fs = require('fs-extra');

// Remove the 'dist' folder
//fs.removeSync('dist');

// Copy assets to 'dist/assets'
fs.copySync('./assets', './dist/assets');

console.log('Assets copied successfully');
