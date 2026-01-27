import VariableTree from "./tree";
import { config } from "./config";
import * as d3 from "d3";

// functions used by getData in order - dataNullValueCheck, generateParameterData, getHierarchy, setHierarchyData
const dataNullValueCheck = (nodeData, dataType) => {
  // makes sure that there are matching nodes for segment and submodule names
  nodeData.filter((f) => f[dataType] === null).map((m) => {
    const matching = nodeData.find((f) => f[`${dataType}_NAME`] === m[`${dataType}_NAME`]);
    if(matching){
      m[dataType] = matching[dataType];
    } else {
      console.error(`${JSON.stringify(m)} has missing ${dataType} data`);
    }
  });
  return nodeData.filter((f) => f[dataType] !== null);
}

const generateParameterData = (dataNodes, dataLinks) => {
  // building nodes and links here
  const nodeIdVar = "NAME";
  const sourceIdVar = "UsesVariable";
  const targetIdVar = "Variable";
  // filtering out duplicate links and set direction to both if opposite
  const links = dataLinks.reduce((acc, link) =>  {
    link.source = link[sourceIdVar].replace(/ /g, "_");
    link.target = link[targetIdVar].replace(/ /g, "_");
    link.direction = "out";
    // PRECAUTIONARY ACTION: REMOVE DUPLICATE LINKS and set direction
    if(!acc.some((s) => s.source === link.source && s.target === link.target)){
      const oppositeLink = acc.find((f) => f.source === link.target && f.target === link.source);
      if(oppositeLink){
        oppositeLink.direction = "both";
      } else {

        acc.push({
          source: link.source,
          target: link.target,
          direction: link.direction
        });
      }
    }
    return acc;
  },[]);

  const forOb = [];
  // add id, type and tier3 nodes to data nodes
  const nodes = dataNodes.reduce((acc, node) => {
    node.id = node[nodeIdVar];
    node.type = "tier3";
    node.subModule = `submodule-${node.SUBMODULE}`;
    node.segment = `segment-${node.SEGMENT}`;
    const sourceLinks = links.filter((f) => f.source === node.id).length;
    const targetLinks = links.filter((f) => f.target === node.id).length;
    forOb.push({id: node.id, sourceLinks, targetLinks, isParameter: node.isParameter})
    node.linkCount =  Math.log(1 + (sourceLinks + targetLinks))
    acc.push(node);
    return acc;
  }, [])

  console.log(forOb)

  return {nodes, links};

}

const getHierarchy = (nodes) => {

  const ROOT = { id: "ROOT" };
  // slightly re-written from original since data is simpler for chart - same result
  // get + set submodules
  const SUBMODULES = Array.from(nodes.reduce((acc, node) => {
    acc.add(`${node.SUBMODULE}-${node.SUBMODULE_NAME}`)
    return acc;
  },new Set()))
    .reduce((acc, entry) => {
      const entrySplit = entry.split("-");
      // handling null values
      const subModuleId = `submodule-${entrySplit[0]}`;
      // filtering out duplicates for the demo
      if(!acc.some((f) => f.id === subModuleId)){
        acc.push({
          id: subModuleId,
          parent: "ROOT",
          subModule: subModuleId,
          NAME: entrySplit[1],
          type: "tier1",
        });
      } else {
        console.error(`${entry} is being filtered out as this subModule ID has been used previously with a different subModule Name`)
      }
      return acc;
    },[])
    .sort((a,b) => d3.ascending(a.NAME,b.NAME))

  // get segments
  const SEGMENTS = Array.from(nodes.reduce((acc, node) => {
    acc.add(`${node.SEGMENT}-${node.SEGMENT_NAME}-${node.SUBMODULE}`)
    return acc;
  },new Set()))
    .reduce((acc, entry) => {
      const entrySplit = entry.split("-");
      const parent = `submodule-${entrySplit[2]}`;
      const segmentId =`segment-${entrySplit[0]}`
      // filtering out duplicates for the demo
      if(!acc.some((f) => f.id === segmentId)) {
        acc.push( {
          id: segmentId,
          subModule: parent,
          parent,
          NAME: entrySplit[1],
          type: "tier2",
        });
      } else {
        console.error(`${segmentId} with submodule ${parent} is being filtered out as this segmentId has been used previously with a different Segment Name`)
      }
      return acc;
    },[])

  let data = nodes.reduce((acc, node,i) => {
    acc.push({
      parent: `segment-${node.SEGMENT}`,
      subModule: `submodule-${node.SUBMODULE}`,
      id: node.id,
      NAME: node.NAME,
      DISPLAY_NAME: node.DISPLAY_NAME,
      type: "tier3",
      linkCount: node.linkCount,
      isParameter: node.isParameter
    })
    return acc;
  },[])


  data = data.sort((a,b) => d3.ascending(a.NAME.toLowerCase(), b.NAME.toLowerCase()));
  const stratifyData = [ROOT].concat(SUBMODULES).concat(SEGMENTS).concat(data);

  return d3
    .stratify()
    .id((d) => d.id)
    .parentId((d) => d.parent)(stratifyData)
    .eachBefore((d,i) => { // sort as previous
      d.data.hOrderPosition = i; // needed to keep correct order of tree menu
    })
}

const setHierarchyData = (nodesCopy, resultEdges,parameterOnlyHierarchy) => {
  const subModuleNames = new Set();
  const segmentNames = new Set();
  const mmLinks = [];

  const getOppositeData = (leaves) => {
    // set of parameters which belong to this submodule OR segment
    const parameterSet = leaves.map((m) => m.data.id);
    const variableOnly = leaves
      .filter((f) => !f.data.isParameter)
      .map((m) => m.data.id)
    const linkCount = resultEdges
      .filter((f) => variableOnly.includes(f.source) ||  variableOnly.includes(f.target))
      .length;
    // currently in the data all edge direction is OUT
    const edgeDirection = [...new Set(resultEdges.map((m) => m.direction))]
    if(edgeDirection.length !== 1){
      // adding a check in case this changes
      console.log('change in data, new direction added!!!')
    }
    // direction the same as out
    const sourceLinks = resultEdges.filter((f) => parameterSet.includes(f.source) && !parameterSet.includes(f.target))
      .reduce((acc, entry) => {
        if(!acc.some((s) => s.target === entry.target)){
          acc.push({
            source: entry.source,
            target: entry.target,
            direction: "out"
          })
        }
        return acc;
      },[])

    // switching source + target as in
    const targetLinks = resultEdges.filter((f) => !parameterSet.includes(f.source) && parameterSet.includes(f.target))
      .reduce((acc, entry) => {
        if(!acc.some((s) => s.source === entry.target)){
          // switching the direction!
          const hasOpposite = sourceLinks.find((s) => s.target === entry.target && s.source === entry.source);
          if(hasOpposite){
            hasOpposite.direction = "both";
          } else {
            acc.push({
              source: entry.target,
              target: entry.source,
              direction: "out"
            })
          }
        }
        return acc
      },[])

     // internalLinks = source + target in parameterSet
     // parameter -> parameter therefore included in parameterData

      return  {externalLinks: [
        ...sourceLinks,
        ...targetLinks],linkCount}
  }

  const addToAllLinks = (mmLinks, link) => {
    const matchingLink = mmLinks.find((s) => s.source === link.source && s.target === link.target);
    if(matchingLink){
      if(matchingLink.direction !== link.direction){
        matchingLink.direction = "both";
      }
    } else {
      const oppositeLink = mmLinks.find((s) => s.source === link.target && s.target === link.source);
      if(oppositeLink && (oppositeLink.direction === "both" || (oppositeLink.direction === "out" && link.direction === "out"))){
        oppositeLink.direction = "both";
      } else {
        mmLinks.push(link);
      }
    }
  }
  // remember we've switched externalLinks so all source ids are the current submodule/segment
  const getMMLinks = (linkVar, externalLinks, currentId) => externalLinks.reduce((acc, link) => {

    const matchingTarget = config.parameterData.nodes.find((s) => s.id === link.target);
    const target = matchingTarget[linkVar];
    const matchingLink = acc.find((s) => s.source === link.source && s.target === target)
    if(matchingLink) {
      if(matchingLink.direction !== link.direction){
        matchingLink.direction = "both";
      }
    } else {
      if(currentId !== target){
        acc.push({
          source: currentId,
          target: target,
          direction: link.direction
        })
      }
    }
    return acc;
    },[])

  // add extra properties and populate submodule + segment sets
  nodesCopy.descendants()
    .map((m) => {
      m.id = m.data.id;
      m.type = `tier${m.depth}`;
      m.group = m.data.id;
      m.subModule = m.data.subModule;
      m.isParameter = m.data.isParameter;
      if(m.depth === 1){
        m.data.parameterCount = m.leaves().length;
        subModuleNames.add(m.data.id);
        const { externalLinks,linkCount } = getOppositeData(m.leaves());
        // subModule -> parameter and parameter -> subModule
        const subModuleLinks = getMMLinks("subModule",externalLinks, m.data.id);
        // subModule -> segment and segment -> subModule
        const segmentLinks = getMMLinks("segment",externalLinks, m.data.id);
        const parameterLinks = getMMLinks("id",externalLinks, m.data.id);
        m.data.linkCount = linkCount;
        subModuleLinks.forEach((link) => addToAllLinks(mmLinks,link));
        segmentLinks.forEach((link) => addToAllLinks(mmLinks,link));
        parameterLinks.forEach((link) => addToAllLinks(mmLinks,link));
        // internal links covered by parameterData links
      } else if(m.depth === 2){
        m.data.parameterCount = m.children.length;
        segmentNames.add(m.data.id);
        const {externalLinks,linkCount } = getOppositeData(m.leaves());
        // already covered subModule -> segment and segment -> subModule
        // segment -> segment and segment -> segment
        const segmentLinks = getMMLinks("segment",externalLinks, m.data.id);
        const parameterLinks = getMMLinks("id",externalLinks, m.data.id);
        m.data.linkCount = linkCount;
        segmentLinks.forEach((link) => addToAllLinks(mmLinks,link));
        parameterLinks.forEach((link) => addToAllLinks(mmLinks,link));
        // already covered internal links within subModule
      } else if (m.depth === 3){
        m.data.parameterCount = 1;
        const { linkCount } = getOppositeData(m.leaves());
        m.data.linkCount = linkCount
        // not storing any data, covered by parameterData links
      }
    })
  const subModuleNodes = nodesCopy.descendants().filter((f) => f.depth === 1);
  const segmentNodes = nodesCopy.descendants().filter((f) => f.depth === 2);
  segmentNodes.map((m) => m.group = m.subModule);
  const segmentSubmoduleMapper = {};
  subModuleNodes.forEach((d) => segmentSubmoduleMapper[d.data.id] = d.data.NAME);
  segmentNodes.forEach((d) => segmentSubmoduleMapper[d.data.id] = d.data.NAME);

  config.setHierarchyData({
    subModuleNodes,
    segmentNodes,
    mmLinks,
    segmentNames: Array.from(segmentNames),
    subModuleNames: Array.from(subModuleNames),
    segmentSubmoduleMapper
  })
  function hierarchyToJSON(node) {
    return {
      ...node.data, // your original data fields
      children: node.children?.map(hierarchyToJSON)
    };
  }
  console.log({
    'hierarchyData': hierarchyToJSON(subModuleNodes[0].parent),
    'parameterData': config.parameterData,
    'mmLinks': mmLinks,
    'segmentSubmoduleMapper': segmentSubmoduleMapper
  })

}

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
            parameters = parameters.replace(/~/g,'').toUpperCase();
          }
          // split parameters
          const {0: parameter1, 1: parameter2} = parameters.split(":");
          if(urlType.includes("NN") && config.parameterData.nodes.some((s) => s.id === parameter1)){
            // NN - only applies if parameter is valid
            // set origin + degree - depending on NND/NNV set currentLayout
            config.setNearestNeighbourOrigin(parameter1);
            config.setNearestNeighbourDegree(+parameter2);
            config.setCurrentLayout(urlType === "NND" ? "default" : "nearestNeighbour");
            if(urlType === "NNV"){
              // additional config needed to change layout to NN after loading
              config.setNNUrlView(true);
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
      throw new Error(`HTTP error! Status: ${response1.status} ${response2.status}`);
    }

    const convertedData = await response1.json();
    const {parameterData, hierarchyData, mmLinks,segmentSubmoduleMapper} = convertedData;

    config.setParameterData(parameterData);
    const selectedNodeNames = parameterData.nodes.map((m) => m.NAME);
    config.setSelectedNodeNames(selectedNodeNames);

    // copy selected node names and set config
    const selectedNodeNamesCopy = JSON.parse(JSON.stringify(config.selectedNodeNames));
    config.setAllNodeNames(selectedNodeNamesCopy);

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

      // call the tree
      VariableTree(treeData);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}
async function getData() {
  try {
    config.setInitialLoadComplete(true);
    console.log('call get data')

    console.log('Base URL:', import.meta.env.BASE_URL);
    console.log('Current URL:', window.location.href);

    const [response1, response2] = await Promise.all([fetch(`${import.meta.env.BASE_URL}assets/nodes.json`), fetch(`${import.meta.env.BASE_URL}assets/edges.json`)]);

    if (!response1.ok || !response2.ok) {
      throw new Error(`HTTP error! Status: ${response1.status} ${response2.status}`);
    }

    const resultNodes = await response1.json();
    const resultEdges = await response2.json();
    const parameters = new Set();
    if (resultNodes && resultEdges) {
      let resultNodesTrunc = resultNodes.map((d) => {
        parameters.add(d.IsParameter);
        return {
          NAME: d.NAME.replace(/ /g, "_"), // ensuring no spaces (removed in labels)
          DISPLAY_NAME: d["DISPLAY NAME"].replace(/ /g, "_"), // ensuring no spaces (removed in labels)
          SUBMODULE: d.SUBMODULE, // MUST BE A UNIQUE ID
          SUBMODULE_NAME: d["SUBMODULE NAME"] || d["SUBMODULE_NAME"], // PREFERABLY A UNIQUE LABEL
          SEGMENT: d.SEGMENT, // MUST BE A UNIQUE ID
          SEGMENT_NAME: d["SEGMENT NAME"]  || d["SEGMENT_NAME"], // PREFERABLY A UNIQUE LABEL
          isParameter: d.IsParameter === "Yes",
          "Parameter Explanation": d["Parameter Explanation"]
        };
      });
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SUBMODULE");
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SEGMENT");
      // selected node names stored in global array (default all selected)
      config.setSelectedNodeNames(resultNodesTrunc.map((m) => m.NAME));

      // as previously, chart always renders with full dataset (stored here);
      config.setParameterData(generateParameterData(resultNodesTrunc,resultEdges));

      // copy selected node names and set config
      const selectedNodeNamesCopy = JSON.parse(JSON.stringify(config.selectedNodeNames));
      config.setAllNodeNames(selectedNodeNamesCopy);

      // get hierarchy from node names
      const treeData = getHierarchy(resultNodesTrunc);
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
      // set more config variables
      setHierarchyData(nodesCopy, resultEdges);
      // call the tree
      VariableTree(treeData);
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// cheat because main.js was calling twice and didn't want to waste your time debugging at this stage
if(!config.initialLoadComplete){
   //getConvertedData();

     getData();

  // Instructions to upload new data

  // a) copy nodes.json + edges.json into the assets folder (should only be convertedData.json in there)
  // b) comment getConvertedData() and uncomment getData()
  // c) the new convertedData.json has been written to the console in developer tools
  // d) copy this from the console (for me this is right click copy object)
  // e) replace current contents of convertedData.json with new data from console
  // f) uncomment getData() and comment getConvertedData()
  // g) make sure the nodes load correctly
  // h) delete nodes.json and edges.json from assets

}
