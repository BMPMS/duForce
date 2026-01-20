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

  // add id, type and tier3 nodes to data nodes
  const nodes = dataNodes.reduce((acc, node) => {
    node.id = node[nodeIdVar];
    node.type = "tier3";
    node.subModule = `submodule-${node.SUBMODULE}`;
    node.segment = `segment-${node.SEGMENT}`;
    const sourceLinks = links.filter((f) => f.source === node.id).length;
    const targetLinks = links.filter((f) => f.target === node.id).length;
    node.allLinksCount = sourceLinks + targetLinks;
   // node.linkFormulaCount = Math.sqrt((targetLinks + 1) * (sourceLinks + 1));
    node.linkCount =  Math.sqrt((targetLinks + 1) * (sourceLinks + 1));
    acc.push(node);
    return acc;
  }, [])


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

  //config.setSubModules(SUBMODULES.map((m) => m.id))

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
  const allLinks = [];

  const getOppositeIds = (leaves) => {
    // set of parameters which belong to this submodule OR segment
    const parameterSet = leaves.map((m) => m.data.id);
    // filter links to nodes which aren't this submodule
    const matchingLinks = resultEdges.filter((f) => parameterSet.includes(f.source) || parameterSet.includes(f.target))
      .reduce((acc, entry) => {
        if(parameterSet.includes(entry.source) && parameterSet.includes(entry.target)){
           acc.push({ id: entry.source, direction: "both"});
           acc.push({id: entry.target, direction: "both"})
        } else if (parameterSet.includes(entry.source)){
          acc.push({id: entry.target, direction: entry.direction})
        } else {
          acc.push({id: entry.source, direction: entry.direction})
        }
        return acc;
      }, [])
    return [...new Set(matchingLinks.map((m) => m.id))]
      .map((m) => m = {id:m, direction: matchingLinks.some((s) => s.direction === "both") ? "both" : "out"});

  }

  const hasMatching = (newId, array, direction) => {
    const matchingEntry = array.find((f) => f.id === newId);
    if(matchingEntry) {
      if (matchingEntry.direction !== direction) {
        matchingEntry.direction = "both";
        return true
      }
    }
    return false;
  }
  const getOppositeData = (leaves, subModule) => {
    // set of parameters which belong to this submodule OR segment
    const parameterSet = leaves.map((m) => m.data.id);
    // filter links to only include those belonging to this submodule OR SEGMENT
    return resultEdges.filter((f) => parameterSet.includes(f.source) || parameterSet.includes(f.target))
      .reduce((acc, entry) => {
        if (parameterSet.includes(entry.source) && !parameterSet.includes(entry.target)){
          // direction = out;
          const matching = hasMatching(entry.target,acc,"out");
          if(!matching){
            const targetNode = config.parameterData.nodes.find((f) => f.id === entry.target);
            acc.push({id: entry.target, type: "target", subModule: targetNode.subModule, segment: targetNode.segment})
          }
         } else if (parameterSet.includes(entry.target) && !parameterSet.includes(entry.source)){
          // direction = in;
          const matching = hasMatching(entry.source,acc,"in");
          if(!matching) {
            const sourceNode = config.parameterData.nodes.find((f) => f.id === entry.source);
            acc.push({id: entry.source, type: "source", subModule: sourceNode.subModule, segment: sourceNode.segment})
          }
        } else {
          const matchingSource = hasMatching(entry.source, acc, entry.direction);
          if(!matchingSource){
            acc.push({id: entry.source, type: "source", subModule: "current", segment: "current"});
          }
          const matchingTarget = hasMatching(entry.target, acc, entry.direction);
          if(!matchingTarget){
            acc.push({id: entry.target, type: "target", subModule: "current", segment: "current"});
          }
        }
        return acc;
      },[])

  }

  const getOppositeNodes = (oppositeIds) => oppositeIds.reduce((acc, entry) => {
    const matchingNode = config.parameterData.nodes.find((f) => f.id === entry);
    acc.push({
      subModule: matchingNode.subModule,
      segment: matchingNode.segment,
      parameter: matchingNode.id
    })
    return acc;
  },[])

  const addToDirectionGroup = (group, oppositeIdAndDirection) =>  group.forEach((s) => {
    oppositeIdAndDirection.push({
      id: s[0],
      direction: s[1].some((s) => s.direction === "both") ? "both" : "out"
    })
  });

  const getDirectionLinks = (linkVar, oppositeData) =>  [...new Set(oppositeData.map((m) => m[linkVar]))]
    .map((m) => {
      const allLinkDirections = [...new Set(oppositeData.filter((f) => f[linkVar] === m)
        .map((m) => m.type))];
      return {id: m, type: allLinkDirections.length === 1 ? allLinkDirections[0] :"both"}
    })
  const getDirection = (linkId, oppositeIdAndDirection) => oppositeIdAndDirection.find((f) => f.id === linkId)?.direction || "none"

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
        const oppositeData = getOppositeData(m.leaves());
        const outsideLinkData = oppositeData.filter((f) => f.subModule !== "current");
        const subModuleLinks = getDirectionLinks("subModule",outsideLinkData);
        const segmentLinks = getDirectionLinks("segment",outsideLinkData);
        const parameterLinks = getDirectionLinks("id",outsideLinkData);
        m.data.links = [
          ...subModuleLinks,
          ...segmentLinks,
          ...parameterLinks
        ];
        m.data.linkCount = oppositeData.length;
        //const oppositeIdAndDirection = getOppositeIds(m.leaves())

       // const oppositeIds = oppositeIdAndDirection.map((m) => m.id)
        //    .filter((f) => !config.parameterData.nodes.some((s) => s.id === f && s.subModule === m.data.id));
       // const oppositeNodes = getOppositeNodes(oppositeIds);
       // const subModuleGroup = Array.from(d3.group(oppositeNodes, (g) => g.subModule));
       // const subModuleSet = subModuleGroup.map((m) => m[0]);

        //addToDirectionGroup(subModuleGroup,oppositeIdAndDirection);
       // const segmentGroup = Array.from(d3.group(oppositeNodes, (g) => g.segment));
       // const segmentSet = segmentGroup.map((m) => m[0]);
        //addToDirectionGroup(segmentGroup,oppositeIdAndDirection);
        // submodule -> submodule, submodule -> segment, segment -> parameter
        //const subModuleLinks = [...oppositeIds, ...subModuleSet, ...segmentSet].map(d => ({ source: m.data.id, target: d, direction: getDirection(d,oppositeIdAndDirection) }));
        //allLinks.push(...subModuleLinks);
       // m.data.linkCount = subModuleLinks.length;
      } else if(m.depth === 2){
        m.data.parameterCount = m.children.length;
        segmentNames.add(m.data.id);
        const oppositeData = getOppositeData(m.leaves());
        const outsideLinkData = oppositeData.filter((f) => f.subModule !== "current");
        const subModuleLinks = getDirectionLinks("subModule",outsideLinkData);
        const segmentLinks = getDirectionLinks("segment",outsideLinkData);
        const parameterLinks = getDirectionLinks("id",outsideLinkData);
        m.data.links = [
          ...subModuleLinks,
          ...segmentLinks,
          ...parameterLinks
        ];
        m.data.linkCount = oppositeData.length;
        //const oppositeIdAndDirection = getOppositeIds(m.leaves());
        //const oppositeIds = oppositeIdAndDirection.map((m) => m.id)
        //const oppositeNodes = getOppositeNodes(oppositeIds)
        //  .filter((f) => f.segment !== m.id);
        //const segmentGroup = Array.from(d3.group(oppositeNodes, (g) => g.segment));
        //const segmentSet = segmentGroup.map((m) => m[0]);
        //addToDirectionGroup(segmentGroup,oppositeIdAndDirection);
        // segment -> segment, segment -> parameter
        //const segmentLinks = [...oppositeIds,  ...segmentSet].map(d => ({ source: m.data.id, target: d, direction: getDirection(d,oppositeIdAndDirection) }));
        //allLinks.push(...segmentLinks);
        //m.data.linkCount = segmentLinks.length;
      } else if (m.depth === 3){
        const oppositeData = getOppositeData(m.leaves());
        const outsideLinkData = oppositeData.filter((f) => f.subModule !== "current");
        const subModuleLinks = getDirectionLinks("subModule",outsideLinkData);
        const segmentLinks = getDirectionLinks("segment",outsideLinkData);
        const parameterLinks = getDirectionLinks("id",outsideLinkData);
        m.data.links = [
          ...subModuleLinks,
          ...segmentLinks,
          ...parameterLinks
        ];
        m.data.linkCount = oppositeData.length;
      }
    })
  const subModuleNodes = nodesCopy.descendants().filter((f) => f.depth === 1);
  const segmentNodes = nodesCopy.descendants().filter((f) => f.depth === 2);
  segmentNodes.map((m) => m.group = m.subModule);
  config.setHierarchyData({subModuleNodes, segmentNodes, allLinks, segmentNames: Array.from(segmentNames), subModuleNames: Array.from(subModuleNames)})
  function hierarchyToJSON(node) {
    return {
      ...node.data, // your original data fields
      children: node.children?.map(hierarchyToJSON)
    };
  }
  console.log(hierarchyToJSON(subModuleNodes[0].parent))

  debugger;
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
    const {parameterData, hierarchyData} = convertedData;

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
      })

      // call the tree
      VariableTree(treeData);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}
async function getData() {
  try {
    // const params = {
    //   method: "GET",
    //   mode: "cors",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    // };
    config.setInitialLoadComplete(true);
    console.log('call get data')

    console.log('Base URL:', import.meta.env.BASE_URL);
    console.log('Current URL:', window.location.href);


    //const [response1, response2] = await Promise.all([fetch("/api/nodes", params), fetch("/api/edges", params)]);
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
 getConvertedData();
 // getData();
}
