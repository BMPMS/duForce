# International Futures Network Diagram

### Data Conversion

1. move your new nodes.json + edges.json into the assets directory in the duForce root - it must be moved here, nowhere else
2. open the terminal in the root
3. type 'npm run rebuild-data' and wait - messages will appear in the terminal as the conversion progresses, should take about 10 mins






### OLD INSTRUCTIONS

1. Data
Default position is working with current convertedData.json (see assets).
If dataset changes, go to the bottom of the main.js and follow these instructions (repeated there)

a) copy nodes.json + edges.json into the assets folder (you may have been given an IFsVar.db file, you'll have to ask someone to convert this to json first)
b) comment getConvertedData() and uncomment getData() - in main.js where these instructions are repeated
c) go to the terminal and start the app by running npm run dev (if this is the first time doing this you'll need to follow install instructions below)
d) the new convertedData.json has been written to the console in developer tools
d) copy this from the console (on a Mac, this is right click copy object)
e) replace current contents of convertedData.json with new data from console
f) uncomment getData() and comment getConvertedData()
g) make sure the nodes load correctly
h) delete nodes.json and edges.json from assets

NODE POSITIONS

i) after you've finished you'll need to save the nodePositions at the 3 different aspect ratios - square, landscape + portrait
j) step 1 go to constants and change useDefaults to false
k) run the variable simulation for each of the sizes.  It will take a few minutes, don't worry.
after the simulation is complete the node positions are written to the console on every load
l) copy these (right click, copy object on a Mac) + then paste into the relevant file in the assets folder
* portrait (346 × 750 px, aspect ratio 1.46)
* landscape (1001 × 563 px, aspect ratio 1.78)
it doesn't matter as long as the window is clearly portrait, landscape or square
m) double check you've copied to the assets folder (docs is overwritten on build)
n) when down, go to constants and change useDefaults back to true


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
