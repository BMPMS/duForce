const express = require("express");
const app = express();
const path = require("path");

// Serve static files from the dist folder
app.use(express.static(path.join(__dirname, "dist")));


// Start the Express server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
