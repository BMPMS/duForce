import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as d3 from "d3";
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';

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
      const matchingPrevious = acc.find((f) => f.id === segmentId);
      // filtering out duplicates for the demo
      if(!matchingPrevious) {
        acc.push( {
          id: segmentId,
          subModule: parent,
          parent,
          NAME: entrySplit[1],
          type: "tier2",
        });
      } else {
        const previousEntry = `id: ${matchingPrevious.id}, subModule: ${matchingPrevious.subModule}, parent: ${matchingPrevious.parent}, NAME: ${matchingPrevious.NAME}`;
        console.error(`id: ${segmentId} with submodule ${parent}, name ${entrySplit[1]} is being filtered out as this segmentId has been used previously with a different Segment Name.  Previous entry is ${previousEntry}`)
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
    link.source = link[sourceIdVar];
    link.target = link[targetIdVar];
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
    node.linkCount = Math.sqrt(2 * (sourceLinks + targetLinks))
    acc.push(node);
    return acc;
  }, [])


  return {nodes, links};

}
const setHierarchyData = (nodesCopy, resultEdges,parameterData) => {
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
        if(!acc.some((s) => s.target === entry.target && s.source === entry.source)){
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
        if(!acc.some((s) => s.source === entry.target && s.target === entry.source)){
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
    const matchingTarget = parameterData.nodes.find((s) => s.id === link.target);
    if(!matchingTarget){
      debugger;
    }
    const target = matchingTarget[linkVar];
    const matchingLink = acc.find((s) => s.source === currentId && s.target === target)
    if(matchingLink) {
      matchingLink.count += 1;
      if(matchingLink.direction !== link.direction){
        matchingLink.direction = "both";
      }
    } else {
      if(currentId !== target){
        acc.push({
          source: currentId,
          target: target,
          direction: link.direction,
          count: 1
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

  function hierarchyToJSON(node) {
    return {
      ...node.data, // your original data fields
      children: node.children?.map(hierarchyToJSON)
    };
  }

  return {
    'hierarchyData': hierarchyToJSON(subModuleNodes[0].parent),
    'parameterData': parameterData,
    'mmLinks': mmLinks,
    'segmentSubmoduleMapper': segmentSubmoduleMapper
  }

}
 async function getData() {
  try {

    console.log('call get data')
    //console.log('Base URL:', import.meta.env.BASE_URL);
   // console.log('Current URL:', window.location.href);

    const __dirname = dirname(fileURLToPath(import.meta.url));

    const [response1, response2] = await Promise.all([
      readFile(join(__dirname, '../assets/nodes.json'), 'utf8').then(JSON.parse),
      readFile(join(__dirname, '../assets/edges.json'), 'utf8').then(JSON.parse)
    ]);


    const resultNodes =  response1;
    let resultEdges =  response2;
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
      resultEdges = resultEdges.reduce((acc, entry) => {
        acc.push({
          UsesVariable: entry.UsesVariable.replace(/ /g, "_"),
          Variable: entry.Variable.replace(/ /g, "_")
        })
        return acc;
      },[])
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SUBMODULE");
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SEGMENT");
      // selected node names stored in global array (default all selected)
     // get hierarchy from node names

      const parameterData = generateParameterData(resultNodesTrunc,resultEdges);
      // get hierarchy from node names
      const treeData = getHierarchy(resultNodesTrunc);
      // copy hierarchy data
      const nodesCopy = treeData.copy();
      // set hierarchy
      const convertedData =  setHierarchyData(nodesCopy, resultEdges,parameterData);
      // call the tree
      //VariableTree(treeData);
      return convertedData;
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}


// Adjust this import to wherever your function actually lives

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  try {
    console.log('Starting data conversion...');

    // Generate data
    const formattedData = await getData();


    // Basic validation
    if (!formattedData) {
      throw new Error('getFormattedData() returned no data');
    }

    if (
      typeof formattedData !== 'object' &&
      !Array.isArray(formattedData)
    ) {
      throw new Error('Unexpected output format');
    }

    const outputPath = path.resolve(
      __dirname,
      '../assets/convertedData.json'
    );

    const backupPath = path.resolve(
      __dirname,
      '../assets_backup/convertedData-backup.json'
    );

    const tempPath = `${outputPath}.tmp`;

    // Ensure JSON can be serialised
    const json = JSON.stringify(formattedData, null, 2);

    // Create backup only if source file exists
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, backupPath);
      console.log('Backup created');
    }

    // Write temp file first
    fs.writeFileSync(tempPath, json, 'utf8');

    // Replace original atomically
    fs.renameSync(tempPath, outputPath);

    console.log('Conversion complete');
    console.log(`Updated: ${outputPath}`);
  } catch (error) {
    console.error('\nConversion failed');
    console.error(error);

    process.exit(1);
  }
}

run();
