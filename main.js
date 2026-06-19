import VariableTree from "./tree";
import { config } from "./config";
import * as d3 from "d3";

const handleUrlInputs = () => {
  // check if reload
  const navEntry = performance.getEntriesByType("navigation")[0];

  if(navEntry.type === "reload"){
    // reset url to "" and return
    console.log('resetting url')
    history.replaceState(null, '', window.location.href.split("?")[0]);
    return;
  }

  // if url search contents
  if (window.location.search) {
    String(window.location.search)
      .replace(/\?/g, '') // remove ?
      .split("&") // split the arguments
      .forEach((param) => {
        const args = param.split("=");
        const urlType = args[0];
        if(args.length === 2){
          // must be 2 arguments
          let parameters = args[1];
          if(parameters.includes("~")){
            // ~used for upper case (URL lower/upper unreliable with caching)
            parameters = parameters.replace(/~/g,'');
          }
          // split parameters
          const {0: parameter1, 1: parameter2} = parameters.split(":");
          if(urlType.includes("NN") && config.parameterData.nodes.some((s) => s.id === parameter1)){
            // NN - only applies if parameter is valid
            // set origin + degree - depending on NND/NNV set currentLayout
            config.setNearestNeighbourDegree(+parameter2);
            config.setCurrentLayout(urlType === "NND" ? "default" : "nearestNeighbour");
            if(urlType === "NNV"){
              // additional config needed to change layout to NN after loading
              config.setNNUrlView(true);
              config.setNearestNeighbourOrigin(parameter1);
            } else {
              config.setMMClickedVariable(parameter1);
            }
            // change type => parameter and check input
            config.setGraphDataType("parameter");
            d3.selectAll('input[name="chartDataRadio"][value="parameter"]')
              .property("checked", true)
          } else if (urlType === "SP" && config.parameterData.nodes.some((s) => s.id === parameter1)
            && config.parameterData.nodes.some((s) => s.id === parameter2)){
            // SP only applies if both parameters are valid
            // set start and end
            config.setShortestPathStart(parameter1);
            config.setShortestPathEnd(parameter2);
            // change type => parameter and check input
            config.setGraphDataType("parameter");
            d3.selectAll('input[name="chartDataRadio"][value="parameter"]')
              .property("checked", true);
          } else if (urlType === "QV" || urlType === "MV"){
            // macro or meso
            if(urlType === "MV"){
              // for meso, change type => segment and check input
              config.setGraphDataType("segment");
              d3.selectAll('input[name="chartDataRadio"][value="segment"]')
                .property("checked", true);
            }
            // set config
            config.setMacroMesoUrlExtras(parameters.split("_"));
          } else if (urlType === "view"){
            if(parameters === "meso"){
              config.graphDataType = "segment";
              d3.selectAll('input[name="chartDataRadio"][value="segment"]')
                .property("checked", true);
            } else if (parameters === "variable"){
              config.graphDataType = "parameter";
              d3.selectAll('input[name="chartDataRadio"][value="parameter"]')
                .property("checked", true);
            }
          }  else {
            config.setMacroMesoUrlExtras([]);
          }
        }
      });
    if(!window.location.href.includes("?view")){
      const newUrl = window.location.origin + window.location.pathname;
      history.replaceState(null, '', newUrl);
    }
  }

}

async function getConvertedData () {
  try {

    //const [response1, response2] = await Promise.all([fetch("/api/nodes", params), fetch("/api/edges", params)]);
    const [response1] = await Promise.all([fetch(`${import.meta.env.BASE_URL}assets/convertedData.json`),]);
    if (!response1.ok) {
      throw new Error(`HTTP error! Status: ${response1.status}`);
    }

    const aspectRatio = window.innerWidth/window.innerHeight;
    let nodeFilename = "defaultNodePositions_square.json";
    if(Number(aspectRatio)){
      if(aspectRatio > 1.1) {
        nodeFilename = "defaultNodePositions_landscape.json";
      } else if (aspectRatio < 1.1){
        nodeFilename = "defaultNodePositions_portrait.json";
      }
    }

    const [response2] = await Promise.all([fetch(`${import.meta.env.BASE_URL}assets/${nodeFilename}`),]);
    if (!response2.ok) {
      throw new Error(`HTTP error! Status: ${response2.status} `);
    }
    const nodePositions = await response2.json();

      config.setDefaultNodePositions(nodePositions);
      config.setStoredDefaultNodePositions(nodePositions);


    const convertedData = await response1.json();
    const {parameterData, hierarchyData, mmLinks,segmentSubmoduleMapper} = convertedData;

    config.setParameterData(parameterData);

    const treeData = d3.hierarchy(hierarchyData);
    // mapping submodules and segments to their child nodes (for tree selection)
    config.setTier1And2Mapper(treeData.descendants().filter((f) => f.data.type === "tier3").reduce((acc, entry) => {
        const {subModule, parent, NAME} = entry.data;
        if(!acc[subModule]) {acc[subModule] = []};
        if(!acc[parent]) {acc[parent] = []};
        acc[subModule].push(NAME);
        acc[parent].push(NAME);
        return acc;
        },{}));

      config.setExpandedMacroMesoNodes([]);
      config.setMacroMesoUrlExtras([]);

      handleUrlInputs();
      // copy hierarchy data
      const nodesCopy = treeData.copy();

      const subModuleNodes = nodesCopy.descendants().filter((f) => f.depth === 1);
      const subModuleNames = subModuleNodes.map((m) => m.data.id);
      const segmentNodes = nodesCopy.descendants().filter((f) => f.depth === 2);
      const segmentNames = segmentNodes.map((m) => m.data.id);
      config.setHierarchyData({
        subModuleNodes,
        segmentNodes,
        subModuleNames,
        segmentNames,
        mmLinks,
        segmentSubmoduleMapper
      })

      config.setTotalNodeCount(parameterData.nodes.length);
      config.setNoParameterNodeCount(parameterData.nodes.filter((f) => !f.isParameter).length);
      config.setAllNodeNames(parameterData.nodes.map((m) => m.id))
      config.setNoParameterAllNodeNames(parameterData.nodes.filter((f) => !f.isParameter).map((m) => m.id))
      config.setSelectedNodeNames(config.showParameters ? parameterData.nodes.map((m) => m.id) : parameterData.nodes.filter((f) => !f.isParameter).map((m) => m.id));

      // call the tree
      VariableTree(treeData);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}


// cheat because main.js was calling twice and didn't want to waste your time debugging at this stage
if(!config.initialLoadComplete){
   getConvertedData();

}
