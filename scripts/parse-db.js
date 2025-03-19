const { writeFile } = require('fs');
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("IFsVar.db");

db.all(`SELECT * FROM ifsvar`, [], (error, rows) => {
  if (error) {
    console.log('An error has occurred ', error);
    return;
  }
  writeFile('./assets/nodes.json', JSON.stringify(rows, null, 2), (error) => {
    if (error) {
      console.log('An error has occurred ', error);
      return;
    }
    console.log('Data written successfully to disk');
  });
});

db.all(`SELECT * FROM varlink`, [], (error, rows) => {
  if (error) {
    console.log('An error has occurred ', error);
    return;
  }
  writeFile('./assets/edges.json', JSON.stringify(rows, null, 2), (error) => {
    if (error) {
      console.log('An error has occurred ', error);
      return;
    }
    console.log('Data written successfully to disk');
  });
});