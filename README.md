# International Futures Network Diagram

### Data Conversion

1. move your new nodes.json + edges.json into the **assets** directory in the duForce root - it must be moved here, nowhere else
![Screenshot 2026-06-19 at 09.11.28.png](images%2FScreenshot%202026-06-19%20at%2009.11.28.png)
3. open the terminal in the root
3. type 'npm run rebuild-data' and wait - messages will appear in the terminal as the conversion progresses, should take about 10 mins
4. your new files (convertedData.json, defaultNodePositions_ x 3 (landscape, portrait, square) will be saved into the assests folder
5. the old files will have been saved into the assets_backup folder


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


### Build

This really only applies if 
* you are working on the app code
* you've made changes to the app code
* your are running the app (currently held Github/BMPMS/duForce) locally using npm run build

1. Run the command below to build the app.
```
npm run build
```
2. push the changes to the server


There are 3 assets files in the repo:
* assets - this is the root data folder, new data should go here, running locally (npm run dev) the app will reference these files
* docs/assets -  overwritten on build, build results - used by  BMPMS/duForce which hosts on Github Pages
* docs/duForce/assets - overwritten on build, copy of build results - used by ifs-network-app which requires assets to be in a 'duForce' subfolder

### Copying changes across

When the app has been changed and a new build has been created, the following files must be copied across to the ifs-network-app (and stable version when ready)

* index.html
* infoPanel.html
* package.json
* folders
  * assets (only if data changes were made in BMPMS/duForce)
  * chart_js
  * dev_documentation (if recent changes)
  * docs
  * scripts

There may be outlier circumstances where other files will change but that is the regular routine

```
node ./scripts/parse-db.js
```

If the Node script above is not run, ensure required data in correct JSON format is stored in 'assets' folder.
