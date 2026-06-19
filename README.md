# International Futures Network Diagram

### Data Conversion

1. move your new nodes.json + edges.json into the **assets** directory in the duForce root - it must be moved here, nowhere else
![Screenshot 2026-06-19 at 09.11.28.png](images%2FScreenshot%202026-06-19%20at%2009.11.28.png)
3. open the terminal in the root
3. type 'npm run rebuild-data' and wait - messages will appear in the terminal as the conversion progresses, should take about 10 mins
4. your new files (convertedData.json, defaultNodePositions_ x 3 (landscape, portrait, square) will be saved into the assests folder
5. the old files will have been saved into the assets_backup folder

NB: If the code changes the developer has to run 'npm run build' which overwrites the docs folder as follows

This is what the docs folder should look like
![Screenshot 2026-06-19 at 09.09.16.png](images%2FScreenshot%202026-06-19%20at%2009.09.16.png)

The additional folder (duForce) which is used in the iFVars environment will be overwritten if you directly copy this folder across



2. Running the app locally


a) open a new terminal tab.
b) if you haven't done this before, install the dependencies

```
npm install
```

c)  Run the development server

```
npm run dev
```

d) View the app on `http://localhost:5173/duForce`


### Deployment

1. Run the command below to build the app.
```
npm run build
```


ADD HERE RE: pushing to main and Github Pages

2. The build will be stored in 'dist' folder, which can then be uploaded into any development platform offering deployment services such as Netlify. Optional: You may view the build locally by running the server.

```
node server.js
```



NOT SURE WHAT THIS IS OR IF IT IS STILL VALID?  (Bryony Mar 2026)
```
node ./scripts/parse-db.js
```

If the Node script above is not run, ensure required data in correct JSON format is stored in 'assets' folder.
