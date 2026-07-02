# International Futures Network Diagram

### Data Conversion

1. move your new nodes.json + edges.json into the **assets** directory in the duForce root - it must be moved here, nowhere else
![Screenshot 2026-06-19 at 09.11.28.png](images%2FScreenshot%202026-06-19%20at%2009.11.28.png)
2. open the terminal in the root
3. enter the following and click return

```
npm run rebuild-data
```

4.  wait - messages will appear in the terminal as the conversion progresses, should take about 10 mins
5your new files (convertedData.json, defaultNodePositions_ x 3 (landscape, portrait, square) will be saved into the assets folder
5. the old files will have been saved into the assets_backup folder
6. now enter the following into the terminal and click return

```
npm run build
```
NB: Step 6 is crucial, it copies all the required files to the right place so the app works locally in both environments AND on the server ifs-network-app 

### Running the app locally


1. open a new terminal tab.
2. if you haven't done this before, install the dependencies

```
npm install
```

3. Run the development server

```
npm run dev
```

d) View the app on `http://localhost:5173/duForce`


### Build

This really only applies if 
* you are working on the app code
* you've made changes to the app code

1. Run the command below to build the app.

```
npm run build
```

2. push the changes to the server


There are 3 assets files in the repo:

* assets - this is the root data folder, new data should go here, running locally (npm run dev) the app will reference these files
* docs/assets -  overwritten on build, build results - used by  BMPMS/duForce which hosts on Github Pages
* docs/duForce/assets - overwritten on build, copy of build results - used by ifs-network-app which requires assets to be in a 'duForce' subfolder

These will all be created correctly when you run the build command

### Copying changes across

When the app has been changed and a new build has been created, the following files must be copied across to the ifs-network-app (and stable version when ready)

* index.html
* infoPanel.html
* package.json
* entire folders
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
