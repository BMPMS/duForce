const fs = require('fs-extra');

// Copy assets to 'dist/assets'
fs.copySync('./assets', './docs/assets');

// Additional copy
fs.copySync('./assets', './docs/duForce/assets');


console.log('Assets copied successfully');
