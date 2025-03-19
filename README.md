# International Futures Network Diagram

### Setup

1. If there is a database file (IFsVar.db), place it at the root folder. Run a Node script to parse the database file contents, convert them into individual JSON files and save them locally in the 'assets' folder. Nodes dataset is called 'nodes.json' and edges dataset is called 'edges.json'.

```
node ./scripts/parse-db.js
```

2. If the Node script above is not run, ensure required data in correct JSON format is stored in 'assets' folder. 


3. Open a new terminal tab. Install the dependencies

```
npm install
```

4. Run the development server

```
npm run dev
```

5. View the app on `http://localhost:5174/`


### Deployment

1. Run the command below to build the app.
```
npm run build
```

2. The build will be stored in 'dist' folder, which can then be uploaded into any development playform offering deployment services such as Netlify. Optional: You may view the build locally by running the server. 

```
node server.js
```
