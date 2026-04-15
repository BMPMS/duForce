import * as d3 from "d3";
import Graph from "graphology";
import Fuse from 'fuse.js'
import { config } from "./config";
import { drawTree, getUrlId, remToPx, resetNodeHighlight } from "./tree";
import {
  LINK_ARROW_COLOR,
  LINK_COLOR,
  MESSAGES,
  TOOLTIP_KEYS,
  MACRO_MESO_RADII,
  SIMULATION_TICK_TIME,
  NODE_RADIUS_RANGE,
  RADIUS_COLLIDE_MULTIPLIER,
  LINK_FORCE_STRENGTH,
  LABEL_FONT_BASE_REM
} from "./constants";
import { dijkstra } from "graphology-shortest-path";

let zoom = undefined;
let showEle;
let expandedAll = true;

const getLinkPath = (d) => {
  // Create a temporary SVG path in memory
  const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  // Construct a straight line between source and target
  tempPath.setAttribute("d", `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`);

  const totalLength = tempPath.getTotalLength();
  const start = tempPath.getPointAtLength(d.source.radius + 2);
  const end = tempPath.getPointAtLength(totalLength - (d.target.radius + 2));

  return `M${start.x},${start.y}L${end.x},${end.y}`;
}

const drawChartLinks = (svg, chartLinks) => {
  // functions for defining link attributes
  const checkLinkSelected = (link) => {
    if(config.currentLayout === "default" && config.graphDataType === "parameter"){
      return config.selectedNodeNames.includes(getSourceId(link)) &&
        config.selectedNodeNames.includes(getTargetId(link))
    }
    return true;
  }

  const getLinkAlpha = (link, linkLength) => {
    if(linkLength < 100) return 0.9;
    if(linkLength <= 2000 ) return 0.75;
    const linkOpacity =  0.5;
    if(expandedAll || config.currentLayout !== "default" || config.graphDataType !== "parameter") return linkOpacity;
    if(checkLinkSelected(link)) return linkOpacity;
    return 0.1;
  }

  // append chartLinks to linksGroup and define attributes
  const linksGroup = svg.select(".linkGroup")
    .selectAll(".linksGroup")
    .data(chartLinks, (d) => `${CSS.escape(d.source.id)}-${CSS.escape(d.target.id)}-${config.graphDataType}`)
    .join((group) => {
      const enter = group.append("g").attr("class", "linksGroup");
      enter.append("path").attr("class", "allLinkPaths linkPath");
      return enter;
    });

  const highlightPath = config.graphDataType === "parameter" && config.nearestNeighbourOrigin !== ""
  && config.currentLayout === "default" ? "Highlight" : "";

  // visible link
  linksGroup
    .select(".linkPath")
    .style("display","block")
    .attr("opacity",1)
    .attr("pointer-events", "none")
    .attr("stroke-opacity", (d) => getLinkAlpha(d,chartLinks.length))
    .attr("stroke-width", config.graphDataType === "parameter" ? 1.25 : 1.25)
    .attr("stroke", LINK_COLOR)
    .attr("fill","none")
    .attr("d", getLinkPath)
    .attr("marker-start",(d) => checkLinkSelected(d) &&  d.direction === "both"  ? `url(#arrowPathStart${highlightPath})` : "")
    .attr("marker-end",(d) => checkLinkSelected(d)  ? `url(#arrowPathEnd${highlightPath})` : "")


  // adding arrows after link and standard link are rendered

}
const getZoomCalculations = (currentNodes) => {

  const [xExtent0, xExtent1] = d3.extent(currentNodes, (d) => d.fx || d.x);
  // using === undefined here as it's valid when the extent = 0;
  if(xExtent0 === undefined || xExtent1 === undefined) return {translateX: 0, translateY: 0, fitToScale: 1};
  const [yExtent0, yExtent1] = d3.extent(currentNodes, (d) => d.fy || d.y);
  if(yExtent0 === undefined || yExtent1 === undefined) return {translateX: 0, translateY: 0, fitToScale: 1};
  let xWidth = xExtent1 - xExtent0 + (currentNodes.length === 1 ? 250 : 100);
  let yWidth = yExtent1 - yExtent0 + (currentNodes.length === 1 ? 250 : 100);
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const translateX = -(xExtent0 + xExtent1) / 2;
  const translateY = -(yExtent0 + yExtent1) / 2 + (config.currentLayout === "nearestNeighbour" ? 30 : 0);
  const fitToScale = 0.95 / Math.max(xWidth / screenWidth, yWidth / screenHeight);
  return {translateX, translateY, fitToScale};
};

export const zoomToFit = (baseSvg,currentNodes, transitionTime) => {

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const {translateX, translateY, fitToScale} = getZoomCalculations(currentNodes === "all" ? showEle.nodes : currentNodes);
  baseSvg
    .interrupt()
    .transition()
    .duration(transitionTime)
    .call(
      zoom.transform,
      d3.zoomIdentity
        .scale(1)
        .translate(screenWidth / 2, screenHeight / 2)
        .scale(fitToScale)
        .translate(translateX,  translateY)
    );
}

const resetMenuVisibility = () => {
  expandedAll = config.graphDataType !== "parameter" || config.selectedNodeNames.length === (config.showParameters ? config.totalNodeCount : config.noParameterNodeCount);
  let buttonPosition = 2.9;
  const menuVisible = d3.select("#hideInfo").style("display") === "block";
  d3.select("unselectAll").style("display","none");
  d3.select("#collapsibleMenuContainer").style("display","none");
  let searchTabContainerHeight = menuVisible ? "auto" : "4rem";
  d3.select(".CTA").style("display","none");
  d3.select("#tooltipCount").text("");
  d3.select("#downloadNNData").style("display","none");
  d3.select("#hide-single-button").style("display","block");
  d3.selectAll("#search-input").attr("placeholder","Search for variables");
  d3.select("#shortestPathEndSearch").style("display","none");
  if(config.graphDataType === "parameter") {
    d3.select("#collapsibleMenuToggle").style("display","block");
    d3.select("#infoMessage")
      .style("visibility", config.currentLayout === "default" ? "hidden" : "visible");
    // think about where to set the initial position to hidden on load...
    d3.select("#layout-button").style("display","block");
    d3.select("#nnDegreeDiv").style("display",config.nearestNeighbourOrigin ? "block" : "none")
    if(config.currentLayout === "default"){
      const allNodeLength = config.showParameters ? config.totalNodeCount : config.noParameterNodeCount;
      d3.select("#unselectAll").style("display",menuVisible && allNodeLength > 0? "block" : "none");
      d3.select("#collapsibleMenuContainer").style("display",menuVisible ? "block" : "none");
    }
    if (config.nearestNeighbourOrigin !== ""){
      buttonPosition = 5.2;
      d3.select("#downloadNNData").style("display",config.notDefaultSelectedLinks.length > 0 ? "block": "none");
      if(!menuVisible){
        searchTabContainerHeight = "6.5rem";
      }
      if(config.currentLayout === "nearestNeighbour"){
        // searchTabContainerHeight = "4rem";
        d3.select("#collapsibleMenuToggle").style("display","none");
        d3.selectAll("#search-input")
          .attr("placeholder","Search for origin node");
        d3.select("#hide-single-button").style("display","none");
        d3.select(".CTA").style("display","block");
      }
    }  else if (config.currentLayout === "shortestPath"){
      d3.select("#collapsibleMenuToggle").style("display","none");
      buttonPosition = 5.2;
      searchTabContainerHeight = "6.5rem";
      d3.selectAll("#search-input")
        .attr("placeholder","Search for start node");
      d3.select("#shortestPathEndSearch").style("display","block");
      d3.select("#hide-single-button").style("display","none");
      if(config.shortestPathStart !== "" && config.shortestPathEnd !== ""){
        d3.select(".CTA").style("display","block");
      }
    }
  } else {
    searchTabContainerHeight = "4rem";
    d3.select("#infoMessage").style("visibility","hidden");
    d3.select("#layout-button").style("display","none");
    d3.select("#nnDegreeDiv").style("display", "none");
  }
  d3.selectAll(".otherButton").style("top",`${buttonPosition}rem`);
  d3.selectAll(".viewButton").style("top",`${buttonPosition + 0.2}rem`);
  d3.select("#resetButton").style("top",`${buttonPosition + 0.8}rem`);
  d3.select("#search-tab-container").style("height", searchTabContainerHeight);
  d3.selectAll(".nnLabelGroup").attr("display",config.currentLayout === "nearestNeighbour" ? "block" : "none")
  d3.select("#resetButton").style("display",expandedAll ? "none" : "block");

}

export default async function ForceGraph(
  {
    nodes, // an iterable of node objects (typically [{id}, …])
    links, // an iterable of link objects (typically [{source, target}, …])
  },
  {
    containerSelector, // id or class selector of DIV to render the graph in
    initial = true,
    width, // outer width, in pixels
    height, // outer height, in pixels
    subModuleColors, // name, fill,
    nearestNeighbour,
    nnViewChange = false

  } = {}
) {

  expandedAll = config.graphDataType !== "parameter" || config.selectedNodeNames.length === (config.showParameters ? config.totalNodeCount : config.noParameterNodeCount);
  if(nearestNeighbour){
    positionNearestNeighbours(true);
  }

  if (!nodes) return;
  const windowBaseUrl = window.location.href.split("?")[0];
  resetMenuVisibility(width);
  // data for charts
  showEle = { nodes, links};
  const nodeRadiusScale = config.graphDataType === "parameter" ?
    d3.scaleSqrt()
        .domain([0, d3.max(nodes, (d) => d.linkCount)])
        .range(NODE_RADIUS_RANGE)
        .clamp(true)
    : d3.scaleOrdinal()
      .domain(["tier1","tier2","tier3"])
      .range(MACRO_MESO_RADII);

    // add additional node variables
  showEle.nodes = showEle.nodes.reduce((acc, node) => {
    if(!node.id){
      node.id = node.data.id;
      node.type = node.data.type;
    }
    const subModule = node.subModule ? node.subModule : node.data.subModule;
    const matchingSubmodule = subModuleColors.find((f) => f.name === subModule);
    if(!matchingSubmodule){
      console.error('PROBLEM WITH MATCHING SUBMODULE - should not happen!!!!')
    }
    node.name = node.NAME || node.data?.NAME;
    node.color = matchingSubmodule.fill;
    node.radiusVar = config.graphDataType === "parameter" ? node.linkCount : node.type || node.data?.type;
    node.radius = (node.isParameter || node.data?.isParameter && config.graphDataType === "parameter") ?  NODE_RADIUS_RANGE[0] : nodeRadiusScale(node.radiusVar);
    node.group = node.subModule || node.data.subModule;
    acc.push(node);
    return acc;
  }, [])


  // select or define non data-appended elements
  let baseSvg = d3.select(containerSelector).select("svg");
  let tooltip = d3.select(".tooltip");
  let tooltipExtra = d3.select(".tooltipExtra");
  if (baseSvg.node() === null) {
    baseSvg = d3.select(containerSelector).append("svg").attr("class","baseSvg").attr("width", width).attr("height", height);
    const actualSvg = baseSvg.append("g").attr("class", "chartGroup")
    actualSvg.append("g").attr("class", "nnGroup")
    actualSvg.append("g").attr("class", "linkGroup");
    actualSvg.append("g").attr("class", "nodeGroup");
    const defs = actualSvg.append("defs");
    defs.append("marker").attr("class", "markerGroupStart")
      .append("svg:path").attr("class", "markerPathStart");
    defs.append("marker").attr("class", "markerGroupEnd")
      .append("svg:path").attr("class", "markerPathEnd");
    defs.append("marker").attr("class", "markerGroupStartHighlight")
      .append("svg:path").attr("class", "markerPathStartHighlight");
    defs.append("marker").attr("class", "markerGroupEndHighlight")
      .append("svg:path").attr("class", "markerPathEndHighlight");
  }
  tooltip.style("visibility","hidden");
  tooltipExtra.style("visibility","hidden");

  // graphology component (used for NN and SP)
  const graph = initGraphologyGraph(showEle.nodes, showEle.links);

  const xWeight = width > height ? 0.7 : 1;
  const yWeight = width > height ? 1 : 0.7;



  const getSubModulePositions = () => {


    const submoduleLeaves = config.hierarchyData.subModuleNodes.map((m) =>  ({name: m.id || m.data?.id,value: d3.sum(m.leaves(), (s) => s.data.linkCount)}));
    const leafHierarchy = d3.hierarchy({name: 'root', children: submoduleLeaves})
      .sum((s) => s.value);
    const tree = d3.treemap()
      .size([width,height]);
    tree(leafHierarchy);
    const submoduleRects = leafHierarchy.descendants()
      .filter((f) => f.depth > 0)
      .map((m) => ({x: m.x0 + (m.x1 - m.x0)/2, y: m.y0 + (m.y1 - m.y0)/2, id: m.data.name}));

    return submoduleRects
      .reduce((acc, entry) => {
        acc[entry.id] = {x: entry.x, y: entry.y}
        return acc;
      },{});
  }

  const submodulePositions = getSubModulePositions();

  const simulation = d3
    .forceSimulation()
    .force("charge", d3.forceManyBody().strength(config.graphDataType !== "parameter"  ? 0 : -300))
    .force("link", d3.forceLink().id((d) => d.id).strength((link) => {
      const isParameter = link.source.data?.isParameter || link.target.data?.isParameter;
      if(config.graphDataType !== "parameter" || isParameter){
        return 0
      } // default from https://d3js.org/d3-force/link as distance doesn't matter here
      // return 0
      return LINK_FORCE_STRENGTH
    }))
    .force("x", d3.forceX((d) => config.graphDataType === "parameter" ? submodulePositions[d.subModule].x :width/2).strength( config.graphDataType !== "parameter"  ? xWeight * 0.04 : xWeight * 0.15))
    .force("y", d3.forceY((d) => config.graphDataType === "parameter" ? submodulePositions[d.subModule].y :width/2).strength( config.graphDataType !== "parameter"  ? yWeight * 0.04 :yWeight * 0.15))
    .force("collide", d3.forceCollide() // change segment when ready
      .radius((d) => d.radius * (config.graphDataType === "parameter" ? RADIUS_COLLIDE_MULTIPLIER : 4))
      .strength(1)
      .iterations(30)
    ) // change segment when ready
    .force("cluster", forceCluster()) // cluster all nodes belonging to the same submodule.

  simulation.stop();

  const svg = d3.select(".chartGroup");

  // arrow marker attributes
  svg.select(".markerGroupStart")
    .attr("id", "arrowPathStart")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 3)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto");

  svg.select(".markerPathStart")
    .attr("fill", LINK_ARROW_COLOR)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", "M9,-4L1,0L9,4") // M9,-4L1,0L9,4 (start)

  svg.select(".markerGroupEnd")
    .attr("id", "arrowPathEnd")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto");

  svg.select(".markerPathEnd")
    .attr("fill", LINK_ARROW_COLOR)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", "M1, -4L9,0L1,4") // M9,-4L1,0L9,4 (start)

  svg.select(".markerGroupStartHighlight")
    .attr("id", "arrowPathStartHighlight")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 3)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto");

  svg.select(".markerPathStartHighlight")
    .attr("fill", "white")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", "M9,-4L1,0L9,4") // M9,-4L1,0L9,4 (start)

  svg.select(".markerGroupEndHighlight")
    .attr("id", "arrowPathEndHighlight")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("orient", "auto");

  svg.select(".markerPathEndHighlight")
    .attr("fill", "white")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("d", "M1, -4L9,0L1,4") // M9,-4L1,0L9,4 (start)

  // zoom and zoom functions
  let currentZoomLevel = 1;

  // node visibility can depend on zoom level
  const getNodeLabelDisplay = (d) => {
    expandedAll = config.selectedNodeNames.length === (config.showParameters ? config.totalNodeCount : config.noParameterNodeCount);
    if(config.graphDataType !== "parameter") return "block";
    if(config.nearestNeighbourOrigin !== "" && config.selectedNodeNames.includes(d.NAME)) return "block";
    if(config.currentLayout === "shortestPath") return "block";
    if(!expandedAll && config.currentLayout === "default" && config.selectedNodeNames.includes(d.NAME)) return "block"
    return "none";
  }

  const minAsPx = remToPx(LABEL_FONT_BASE_REM);

  function getNodeLabelDy  (d)  {
    if(config.graphDataType !== "parameter")  {
      const fontSize =  d.radius < minAsPx ? minAsPx : d.radius;
      return d.radius + fontSize;
    }
    if(config.currentLayout === "nearestNeighbour" && d.id === config.nearestNeighbourOrigin) return d.radius + remToPx(0.4);
    if(config.graphDataType === "parameter" && config.currentLayout === "default" && config.nearestNeighbourOrigin !== "") return d.radius + remToPx(0.6);

    return d.radius + remToPx(0.5);
  }

  function getNodeLabelSize (d)  {

    if(config.graphDataType !== "parameter"){
      return d.radius < minAsPx ? minAsPx : d.radius;
    }
    // if(config.graphDataType !== "parameter") return `${(LABEL_FONT_BASE_REM + 0.2)/currentZoomLevel}em`;
    if(config.currentLayout === "nearestNeighbour" && d.id === config.nearestNeighbourOrigin) return `${LABEL_FONT_BASE_REM}rem`
    if(config.graphDataType === "parameter" && config.currentLayout === "default" && config.nearestNeighbourOrigin !== "") return `${LABEL_FONT_BASE_REM + 0.2}rem`;
    return `${LABEL_FONT_BASE_REM}rem`
  }

   zoom = d3.zoom()
     .on("zoom", (event) => {
      const { x, y, k } = event.transform;
      currentZoomLevel = k;
      svg.attr("transform", `translate(${x},${y}) scale(${k})`);
      svg.selectAll(".nodeLabel")
        .attr("dy",getNodeLabelDy)
        .attr("font-size",getNodeLabelSize)
    });

  baseSvg.call(zoom).on("dblclick.zoom", null);


  const performZoomAction  =  (
    currentNodes,
    transitionTime,
    zoomAction) =>  {
    if (zoomAction === 'zoomIn') {
      baseSvg.interrupt().transition().duration(transitionTime).call(zoom.scaleBy, 2);
    }
    if (zoomAction === 'zoomOut') {
      baseSvg.interrupt().transition().duration(transitionTime).call(zoom.scaleBy, 0.5);
    }
    if (zoomAction === 'zoomFit') {
      zoomToFit(baseSvg, currentNodes, transitionTime);
    }
  };
  const resetDefaultNodes = () => {
    // uses positions recorded from initial default build to reset the positions
    const previousPositions = config.defaultNodePositions;
    showEle.nodes.map((m) => {
      const previousNode = previousPositions[m.id];
      if(previousNode){
        m.fx = previousNode.x;
        m.fy = previousNode.y;
        m.x = previousNode.x;
        m.y = previousNode.y;
      }
    })

    simulation.nodes(showEle.nodes).force("link").links(showEle.links);
    simulation.alphaTarget(0.1).restart();
    simulation.tick(1);
    simulation.stop();
    showEle.nodes.map((m) => {
        m.fx = undefined;
        m.fy = undefined;
    })
  }
  // radio buttons on toolbar if NN
  const activateTooltipToggle = () => {
    d3.selectAll(".directionToggle")
      .on("change", (event) => {
        config.setTooltipRadio(event.currentTarget.value);
        if(event.currentTarget.value !== "both"){
          const filteredListToShow = config.notDefaultSelectedNodeNames.filter((f) => f.direction === event.currentTarget.value);
          const tooltipContent = getTooltipTable(filteredListToShow,{});
          tooltip.html(`${tooltipContent.join("")}`)
          const nodeNames = filteredListToShow.map((m) => m.name).concat(config.nearestNeighbourOrigin);
          svg.selectAll(".nodeOpacityCircle")
            .attr("opacity", (d) =>  nodeNames.includes(d.NAME) ? 1 : 0.2);
          svg.selectAll(".allLinkPaths")
          .attr("opacity",(f) => nodeNames.includes(f.source.NAME)  && nodeNames.includes(f.target.NAME) ? 1 : 0)
        } else {
          svg.selectAll(".allLinkPaths")
            .attr("opacity",1);
          resetNodeHighlight();
          const tooltipContent = getTooltipTable(config.notDefaultSelectedNodeNames,{});
          tooltip.html(`${tooltipContent.join("")}`)
        }
        activateTooltipToggle();
      })
  }

  if (!initial &&  config.graphDataType === "parameter" && Object.keys(config.defaultNodePositions).length > 0) {
    // not initial load OR positioning currently saved
    // for default, reset positions and re-run the simulation
    resetDefaultNodes();
    updatePositions(true);

  } else {
    // initial build OR macro meso OR NN view OR shortest path view
    // set links
    simulation.nodes(showEle.nodes).force("link").links(showEle.links);
    // restart simulation
    simulation.alphaTarget(0.1).restart();
     // stop at calculated tick time (from previous dev)
    simulation.tick(SIMULATION_TICK_TIME);
    // stop simulation
    simulation.stop();
    if (config.graphDataType === "parameter" && config.currentLayout === "default") {
      // store positions for next time
      const defaultNodePositions = showEle.nodes.reduce((acc, node) => {
        acc[node.id] = { x: node.x, y: node.y };
        return acc
      }, {})
       // save node positions
      config.setDefaultNodePositions(defaultNodePositions);
      console.log(defaultNodePositions)
    }
    updatePositions(true );
  }

  let searchNodes = showEle.nodes;
  if(!config.showParameters){
    searchNodes = searchNodes.filter((f) => !(f.isParameter));
  }

  // Update search box with searchable items
  updateSearch(searchNodes, graph, "");
  updateSearch(searchNodes, graph, "-sp-end");
  // updateButtons
  updateButtons(graph);

  // nearest neighbour functions
  function getNeighbours (nameArray, direction, nnDepth, previousNNNodes,allNodes) {
    return  nameArray.reduce((acc, origin) => {
    const neighbourLinks = showEle.links
      .filter((f) => (direction === "outbound" ? getSourceId(f) : getTargetId(f)) === origin);
      neighbourLinks.forEach((d) => {
      const source = getSourceId(d);
      const target = getTargetId(d);
      const oppositeNode = source === origin ? target : source;
      if(!allNodes.includes(oppositeNode) && !acc.some((s) => s.node === oppositeNode)){
        if(!config.showParameters && (d.source.isParameter || d.target.isParameter)){
          // don't add link as it includes a parameter
        } else {
          acc.push({
            source, target, direction,depth: nnDepth, node: oppositeNode
          })
        }
      }
    })
     return acc;
    }, [])}

  function getNearestNeighbourLinks  ()  {
    const depth1OutboundLinks = getNeighbours([config.nearestNeighbourOrigin], "outbound",1,[],[]);
    const depth1InboundLinks = getNeighbours([config.nearestNeighbourOrigin],"inbound",1,[],[]);
    const depth1Links = depth1OutboundLinks.concat(depth1InboundLinks);
    if(config.nearestNeighbourDegree > 1 && depth1Links.length > 0){
      const allNodes = [config.nearestNeighbourOrigin].concat(depth1Links.map((m) => m.node));
      const depth1NodeNames = depth1Links.map((m) => m.node)

      const depth2OutboundLinks = getNeighbours(depth1OutboundLinks.map((m) => m.node),"outbound",2,depth1NodeNames,allNodes);
      const depth2InboundLinks = getNeighbours( depth1InboundLinks.map((m) => m.node),"inbound",2,depth1NodeNames,allNodes);
      const depth2Links = depth2OutboundLinks.concat(depth2InboundLinks);
      if(config.nearestNeighbourDegree > 2 && depth2Links.length > 0){
        const allNodes = depth1NodeNames.concat(depth2Links.map((m) => m.node));
        const depth2NodeNames = depth2Links.map((m) => m.node);
        const depth3OutboundLinks = getNeighbours(depth2OutboundLinks.map((m) => m.node),"outbound",3,depth2NodeNames,allNodes);
        const depth3InboundLinks = getNeighbours( depth2InboundLinks.map((m) => m.node),"inbound",3,depth2NodeNames,allNodes);
        const depth3Links = depth3OutboundLinks.concat(depth3InboundLinks);
        return depth1Links.concat(depth2Links).concat(depth3Links);
      }
      return depth1Links.concat(depth2Links);
    }
    return depth1Links
  }

  const generateSymmetricNNArray = (nnLinkData) => {
    // get title array for NN label titles
    const arr = [];
    for (let i = config.nearestNeighbourDegree; i > 0; i--) {
      const type = nnLinkData.some((f) => f.depth === i && f.direction === "inbound") ? "driver" : ""
      arr.push({type,level: i});
    }
    arr.push({type: "root", level: 0});
    for (let i = 1; i <= config.nearestNeighbourDegree; i++) {
      const type = nnLinkData.some((f) => f.depth === i && f.direction === "outbound") ? "outcome" : ""
      if(nnLinkData.find((f) => f.depth === i && f.direction === "outbound")){
        arr.push({type,level: i});
      }
    }
    return arr;
  }

  function renderNNLevelLabels (svg,nnData,linkCount) {

    // render (or unrenders) the level titles
    const nnWidth = 1500;
    const nnHeight = Math.max(300,linkCount * 3);

    svg.selectAll(".nnLabelGroup")
      .attr("display","block");
    // need to add arrows
    const nnLabelGroup = svg.select(".nnGroup")
      .selectAll(".nnLabelGroup")
      .data(nnData)
      .join((group) => {
        const enter = group.append("g").attr("class", "nnLabelGroup");
        enter.append("text").attr("class", "nnLabelType");
        enter.append("text").attr("class", "nnLabelLevel");
        return enter;
      });

    nnLabelGroup.attr("transform",(d,i) => `translate(${i * nnWidth},${-remToPx(8)})`)

    nnLabelGroup.select(".nnLabelType")
      .attr("x", nnWidth/2)
      .attr("y",0)
      .attr("font-size","1rem")
      .attr("text-anchor", "middle")
      .attr("fill","white")
      .text((d) => d.type.toUpperCase());

    nnLabelGroup.select(".nnLabelLevel")
      .attr("x", nnWidth/2)
      .attr("y","1em")
      .attr("font-size","0.7rem")
      .attr("text-anchor", "middle")
      .attr("fill","white")
      .text((d) => `${d.type === "" ? "" : d.level > 0 ? `Level ${d.level}`: ""}`);

    return {nnWidth, nnHeight};
  }
  function positionNearestNeighbours(nodeClick) {

    // duplicating here for call from tree.
    const svg = d3.select(".chartGroup");
    const baseSvg = d3.select(".baseSvg");

    // reset links and nodes
    config.setNotDefaultSelectedLinks([]);
    config.setNotDefaultSelectedNodeNames([]);
    // render titles
     // get the links
    const nnLinks = getNearestNeighbourLinks();

    const {nnWidth, nnHeight} = renderNNLevelLabels(svg,nodeClick ? [] : generateSymmetricNNArray(nnLinks),nnLinks.length);

    const getNNHierarchy = (parentId, id, direction, rootLink) =>  d3
      .stratify()
      .parentId((d) => d[parentId])
      .id((d) => d[id])(
        rootLink.concat(
          nnLinks.filter((f) => f.direction === direction)
        )
      )

    // using d3.tree() to build the positions for inbound and outbound nodes
    // so first step is to build the data for these 2 trees
    const radiusMultiple = 2.4;
    const inboundRootLink = [{ target: "", source: config.nearestNeighbourOrigin }];
    const inboundHierarchy = getNNHierarchy("target","source","inbound",inboundRootLink);

    const outboundRootLink = [{ source: "", target: config.nearestNeighbourOrigin }];
    const outboundHierarchy = getNNHierarchy("source","target","outbound",outboundRootLink);
    // calculate the maximum column radius for each depth direction
    const radiusByDepthDirection = nnLinks.reduce((acc, link) => {
      const depthDirection = `${link.depth}-${link.direction}`;
      if(!acc[depthDirection]){acc[depthDirection] = 0}
      const matchingNode = showEle.nodes.find((f) => f.NAME === link[link.direction === "outbound" ? "source" : "target"]);
      acc[depthDirection] += (matchingNode.radius * radiusMultiple);
      return acc;
    },{})

    const maxColumnRadius = nnLinks.length === 0 ? 0 : d3.max(Object.values(radiusByDepthDirection));

    const getNNTree = (hierarchy, treeWidth) =>  d3
      .tree()
      .size([nnHeight * 0.9, treeWidth])(hierarchy)
      .descendants()
      .filter((f) => f.depth > 0)

    const getNNLinks = (node) => {
      const nnLinkIds = node.descendants().map((m) => m.id);
      node.ancestors().forEach((d) => {
        if(!nnLinkIds.some((s) => s === d.id)){
          nnLinkIds.push(d.id)
        }
      });
      return nnLinkIds;
    }
    const maxInDepth = d3.max(inboundHierarchy, (d) => d.depth);
    const maxOutDepth = d3.max(outboundHierarchy, (d) => d.depth);
    const shiftRight = (config.nearestNeighbourDegree + 0.5) * nnWidth;

    // use new data and tree definition to build the data
    const getAllNodePositions = () => {
      const centralNodes = [{
        name: config.nearestNeighbourOrigin,
        x: shiftRight,
        y: 0,
        direction: "center",
        depth: 0,
        nnLinkIds: getNNLinks(inboundHierarchy).concat(getNNLinks(outboundHierarchy))
      }];
      const inboundNodes = getNNTree(inboundHierarchy, nnWidth * maxInDepth).reduce((acc, node) => {
        acc.push({
          name: node.id,
          x: -node.y + shiftRight,
          y: node.x,
          direction: "in",
          depth: node.depth,
          nnLinkIds: getNNLinks(node)
        });
        return acc;
      }, []);
      const outboundNodes = getNNTree(outboundHierarchy,nnWidth * maxOutDepth).reduce((acc, node) => {
        acc.push({
          name: node.id,
          x: node.y + shiftRight,
          y: node.x,
          direction: "out",
          depth: node.depth,
          nnLinkIds: getNNLinks(node)
        });
        return acc;
      }, []);
      const allNodes = centralNodes.concat(inboundNodes).concat(outboundNodes);
      return allNodes.reduce((acc, node) => {
        const matchingNode = showEle.nodes.find((f) => f.NAME === node.name);
         if(matchingNode){
           const filterParameter = !config.showParameters && matchingNode.isParameter;
           if(!filterParameter){
             node.radius = matchingNode.radius;
             acc.push(node);
           }
        }
        return acc;
      },[])
    }

    // get node positions using the custom trees
    const allNNNodes = getAllNodePositions();
    const nodesByColumn = Array.from(d3.group(allNNNodes, (g) => `${g.direction}-${g.depth}`));
    // use generated trees to get the height and stack the nodes vertically
    const groupsWithHeightInRange = nodesByColumn.filter((f) => f[1].length > 1 && d3.sum(f[1], (s) => s.radius * radiusMultiple) < height);
    groupsWithHeightInRange.forEach((group) => {
      let currentY = 0;
      group[1].forEach((node) => {
        node.y = currentY + node.radius;
        currentY += (node.radius *radiusMultiple);
      })
    })

    if(maxColumnRadius > height){
      // if there are too many nodes to stack vertically, apply a quick simulation which moves them around
      // so they don't collide
      const ySimulation = d3.forceSimulation()
        .alphaDecay(0.1)
        .force('x', d3.forceX((d) => d.x).strength(0.3))
        .force('y', d3.forceY((d) => d.y).strength(0.6))
        .force('collide', d3.forceCollide().radius((d) => d.radius * (radiusMultiple/2)).strength(0.6));
      ySimulation.stop();
      ySimulation.nodes(allNNNodes);
      ySimulation.tick(300);
    }

    // set the links and nodes
    config.setNotDefaultSelectedLinks(nnLinks);
    config.setNotDefaultSelectedNodeNames(allNNNodes);
    if(config.currentLayout === "default"){
      // if from default view, set's selectedNodeNames
      config.setSelectedNodeNames(allNNNodes.map((m) => m.name));
    }
    // duplicating here for from tree call
    const windowBaseUrl = window.location.href.split("?")[0];
    const nnUrl = `${windowBaseUrl}?${config.currentLayout === "default" ? "NND" :"NNV"}=${getUrlId(config.nearestNeighbourOrigin)}:${config.nearestNeighbourDegree}`;
    history.replaceState(null, '', nnUrl);
    resetMenuVisibility();
    if(config.currentLayout === "default" ){
      resetNodeHighlight()
      svg.selectAll(".nodeBackgroundCircle")
        .classed("pulseNN", (d) =>  config.nearestNeighbourOrigin === d.id)
      const nnChartLinks = showEle.links.filter((f) => config.notDefaultSelectedLinks
        .some((s) => s.source === getSourceId(f) && s.target === getTargetId(f)))
      drawChartLinks(svg, nnChartLinks);
      zoomToFit(baseSvg,showEle.nodes.filter((f) => config.selectedNodeNames.includes(f.NAME)),300)
      const currentNode = showEle.nodes.find((f) => f.id === config.nearestNeighbourOrigin)
      updateTooltip(currentNode,false);
      d3.select(".animation-container").style("display", "none");
      svg.selectAll(".nodeLabel").style("display", getNodeLabelDisplay);
    } else {
      updatePositions(true,nodeClick);
    }
  }

  function allShortestPaths(graph, start, end) {
    const dist = new Map();
    const predecessors = new Map();
    const pq = [[0, start]];

    graph.forEachNode(node => {
      dist.set(node, Infinity);
      predecessors.set(node, new Set());
    });
    dist.set(start, 0);

    while (pq.length > 0) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();

      if (d > dist.get(u)) continue;

      graph.forEachOutNeighbor(u, (v, attr) => {
        const newDist = dist.get(u) + (attr.weight ?? 1);

        if (newDist < dist.get(v)) {
          dist.set(v, newDist);
          predecessors.set(v, new Set([u]));
          pq.push([newDist, v]);
        } else if (newDist === dist.get(v)) {
          predecessors.get(v).add(u);
        }
      });
    }

    // Reconstruct all paths by walking predecessors back from end
    function reconstruct(node) {
      if (node === start) return [[start]];
      return [...predecessors.get(node)]
        .flatMap(pred => reconstruct(pred).map(path => [...path, node]));
    }

    return reconstruct(end);
  }

  // shortest path functions
  function positionShortestPath (graph) {
    // clear data
    config.setNotDefaultSelectedNodeNames([]);
    config.setNotDefaultSelectedLinks([]);
    // search for connections between the two nodes
    const connectedNodes = dijkstra.bidirectional(graph, config.shortestPathStart, config.shortestPathEnd);
    const allPaths = allShortestPaths(graph,config.shortestPathStart,config.shortestPathEnd);
    let pathLength = 0;
    const allNodes = [];
    if(allPaths.length > 0){
      // if results build the links
      const connectedLinks = allPaths.reduce((acc, pathNodes) => {
        pathLength = pathNodes.length; // paths should all be the same length
        pathNodes.forEach((nodeId, index) => {
          const position = index === 0 ? "start" : index === pathLength - 1 ?"end" :"middle";
          if(!allNodes.some((s) => s.nodeId === nodeId)){
            allNodes.push({nodeId,position, positionIndex: index});
          }
          if(index > 0){
            const previousConnection = pathNodes[index - 1];
            const matchingLink = showEle.links.find((f) => getSourceId(f) === previousConnection && getTargetId(f) === nodeId);
            if(matchingLink){
              acc.push({
                source:previousConnection,
                target: nodeId,
                node: previousConnection,
                depth: 1,
                direction:"outbound"
              })
            }
          }
        })
        return acc;
      },[])
      // now build the nodes
      let nodeGap = NODE_RADIUS_RANGE[1] * 6;
      const nodeStart = -(pathLength * nodeGap)/2;

      const connectedChartNodes = allNodes.reduce((acc, node, index) => {
        const matchingNode = showEle.nodes.find((f) => f.NAME === node.nodeId);
        if(index === 0){
          nodeGap -= matchingNode.radius
        }
        const newNode = {
          name: matchingNode.id,
          id: matchingNode.id,
          fx: nodeStart + (nodeGap * node.positionIndex),
          direction: "out",
          radius: matchingNode.radius
        };
        if(node.position !== "middle"){
          newNode.fy = 0;
        }
        acc.push(newNode);
      return acc
      },[]);

      const ySimulation = d3.forceSimulation()
        .alphaDecay(0.1)
        .force('link',d3.forceLink().id((d) => d.id))
        .force('x', d3.forceX((d) => d.fx).strength(0.3))
        .force('y', d3.forceY(0).strength(0.6))
        .force('collide', d3.forceCollide().radius(nodeGap/4).strength(0.6));

      ySimulation.stop();
      ySimulation.nodes(connectedChartNodes);
      ySimulation.force('link').links(connectedLinks)
      ySimulation.tick(300);
      ySimulation.stop();


      // set the data
      config.setNotDefaultSelectedLinks(connectedLinks);
      config.setNotDefaultSelectedNodeNames(connectedChartNodes);
      config.setShortestPathString(`Shortest Path: ${config.shortestPathStart} -> ${config.shortestPathEnd}`)
      const spUrl = `${windowBaseUrl}?SP=${getUrlId(config.shortestPathStart)}:${getUrlId(config.shortestPathEnd)}`;
      history.replaceState(null, '', spUrl);
      d3.select("#infoMessage").text("");
    } else {
      // no connections, clear data
      d3.select("#infoMessage").text(MESSAGES.noSP);
      config.setNotDefaultSelectedLinks([]);
      config.setNotDefaultSelectedNodeNames([]);
      config.setShortestPathString("");
      history.replaceState(null, '', windowBaseUrl);
    }
    resetMenuVisibility();
    updatePositions(true);
  }

  // node click
  function clickNode (nodeName,origin, graph){
    // reset background circle and infoMessage
    d3.select("#infoMessage").style("visibility","hidden");
    if(origin === "search" && config.graphDataType !== "parameter"){
      showEle.nodes.map((m) => m.clicked = false);
      const matchingNode = config.parameterData.nodes.find((f) => f.NAME === nodeName);
      if(!config.expandedMacroMesoNodes.some((s) => s === matchingNode.subModule)){
        config.setMacroMesoUrlExtras(config.macroMesoUrlExtras.concat(matchingNode.subModule));
      }
      if(!config.expandedMacroMesoNodes.some((s) => s === matchingNode.segment)){
        config.setMacroMesoUrlExtras(config.macroMesoUrlExtras.concat(matchingNode.segment));
      }
      if(!config.expandedMacroMesoNodes.some((s) => s === nodeName)){
        config.setMacroMesoUrlExtras(config.macroMesoUrlExtras.concat(nodeName));
      }
      updatePositions(true);
      resetMenuVisibility();
    } else if(origin === "search" && config.currentLayout === "nearestNeighbour"){
      // layout NN search
      config.setNearestNeighbourOrigin(nodeName);
      positionNearestNeighbours(false);
    } else if (config.currentLayout === "shortestPath") {
      // layout SP search
      if(origin === "search"){
        config.setShortestPathStart(nodeName);
      } else {
        config.setShortestPathEnd(nodeName);
      }
      resetMenuVisibility();
      if(config.shortestPathStart !== "" && config.shortestPathEnd !== ""){
        config.setShortestPathString("");
        positionShortestPath(graph);
      }
    } else if (config.currentLayout === "default" ) {
      config.setShortestPathString("");
      // whether from search box or node name
      // required behaviour is NN degree 1
      config.setNearestNeighbourOrigin(nodeName);
      config.setSelectedNodeNames([]);
      d3.select("#search-input").property("value",nodeName)
      positionNearestNeighbours(true);
    }
    // otherwise do nothing - no current click action for submodule or segment
  }
  function selectSpatiallyEvenLinks(
    links,
    nodes,
    subsetSize,
    topN = 30,
    spatialBufferRatio = 0.5
  ) {
    const gridSize = 10;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // --- 1. Identify top N nodes by linkCount ---
    const topNodes = [...nodes]
      .sort((a, b) => (b.linkCount || 0) - (a.linkCount || 0))
      .slice(0, topN);

    const topNodeIds = new Set(topNodes.map(n => n.id));

    const totalTopLinks = topNodes.reduce(
      (sum, n) => sum + (n.linkCount || 0),
      0
    );

    // --- 2. Compute quotas for top nodes ---
    const nodeQuota = new Map();
    const nodeUsed = new Map();

    topNodes.forEach(n => {
      const quota =
        totalTopLinks > 0
          ? (subsetSize * (n.linkCount || 0)) / totalTopLinks
          : 0;

      nodeQuota.set(n.id, quota);
      nodeUsed.set(n.id, 0);
    });

    // --- 3. Spatial buckets ---
    const grid = new Map();

    links.forEach(link => {
      const source = nodeMap.get(link.source.id);
      if (!source) return;

      const cellX = Math.floor(source.x / gridSize);
      const cellY = Math.floor(source.y / gridSize);
      const key = `${cellX},${cellY}`;

      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(link);
    });

    const bucketKeys = Array.from(grid.keys());
    const selected = new Set();

    // --- 4. First pass: satisfy top-node quotas with even distribution ---
    let topNodeSelectionCount = 0;
    for (let key of bucketKeys) {
      const bucket = grid.get(key);

      for (let i = bucket.length - 1; i >= 0; i--) {
        if (topNodeSelectionCount >= subsetSize * (1 - spatialBufferRatio)) break; // Stop when we've selected enough top nodes

        const link = bucket[i];
        const sId = link.source.id;
        const tId = link.target.id;

        if (topNodeIds.has(sId)) {
          // Ensure link is distributed around the node
          const sourceNode = nodeMap.get(sId);
          if (sourceNode) {
            // Find the quadrant where the target is located
            const targetNode = nodeMap.get(tId);

            if (targetNode) {
              const dx = targetNode.x - sourceNode.x;
              const dy = targetNode.y - sourceNode.y;

              // Determine the quadrant of the target node
              let quadrant = '';
              if (dx >= 0 && dy >= 0) quadrant = 'top-right';
              else if (dx < 0 && dy >= 0) quadrant = 'top-left';
              else if (dx >= 0 && dy < 0) quadrant = 'bottom-right';
              else if (dx < 0 && dy < 0) quadrant = 'bottom-left';

              // If we don't already have a link from that quadrant, select it
              if (!nodeUsed.has(quadrant)) {
                nodeUsed.set(quadrant, []);
              }

              // Ensure only one link from each quadrant per node
              if (!nodeUsed.get(quadrant).includes(tId)) {
                selected.add(link);
                nodeUsed.get(quadrant).push(tId);
                topNodeSelectionCount++;
                bucket.splice(i, 1);
              }
            }
          }
        }
      }
    }
    // --- 5. Fill remaining slots with spatially distributed links ---
    while (selected.size < subsetSize && bucketKeys.length > 0) {
      for (let i = bucketKeys.length - 1; i >= 0; i--) {
        const bucket = grid.get(bucketKeys[i]);

        if (bucket.length > 0) {
          selected.add(bucket.pop());
        }

        if (bucket.length === 0) {
          bucketKeys.splice(i, 1);
        }

        if (selected.size >= subsetSize) break;
      }
    }

    return Array.from(selected);
  }


  // Update coordinates of all nodes + links based on current config settings
  function updatePositions(zoomToBounds, fromNearestNeighbourDefaultNodeClick, afterDrag) {

    // redraw tree if needed
    if(config.graphDataType === "parameter" && config.currentLayout === "default"){
      drawTree();
    }
    // function used on node mouseover to populate tooltip + @ end of updatePositions
    const getTooltipNode = () => {
      const singleNode = config.selectedNodeNames.length === 1;
      // passing in single node if only one selected - undefined otherwise as unused
      return  singleNode ? showEle.nodes.find((f) => f.NAME === config.selectedNodeNames[0]) : undefined;
    }

    // set chartNodes
    let chartNodes = showEle.nodes;

    if(config.graphDataType === "parameter"){
      chartNodes = showEle.nodes.reduce((acc, node) => {
        if(config.showParameters || !node.isParameter){
          acc.push(node);
        }
        return acc;
      },[])
    }

    if(config.currentLayout !== "default" && config.graphDataType === "parameter"){
      // if layout is NN or SP map nodes from notDefaultSelectedNodeNames
      const validNN = config.currentLayout === "nearestNeighbour" && config.nearestNeighbourOrigin !== "";
      const validSP = config.currentLayout === "shortestPath" && (config.shortestPathStart !== "" && config.shortestPathEnd !== "");
      if(validNN || validSP){
        showEle.nodes.map((m) => m.direction = undefined);
        chartNodes = showEle.nodes.reduce((acc,node) => {
          const matchingNode = config.notDefaultSelectedNodeNames.find((f) => f.name === node.NAME);
          if(matchingNode){
            node.x = matchingNode.x;
            node.y = matchingNode.y;
            node.nnLinkIds = matchingNode.nnLinkIds;
            acc.push(node);
          }
          return acc;
        },[]);
      } else {
        chartNodes = [];
      }
    }

    if(config.tooltipRadio !== "none"  && config.nearestNeighbourOrigin !== ""){
      // for NN searches (default + nearestNeighbour layout) radio appears @ top of tooltip
      // apply filters if needed
      if(config.tooltipRadio === "both"){
        config.setSelectedNodeNames(config.notDefaultSelectedNodeNames.map((m) => m.name));
      } else if (config.tooltipRadio === "in"){
        const filteredNodeNames = config.notDefaultSelectedNodeNames
          .filter((f) => f.direction === "in" || f.direction === "center")
          .map((m) => m.name);
        config.setSelectedNodeNames(filteredNodeNames);
      } else {
        const filteredNodeNames = config.notDefaultSelectedNodeNames
          .filter((f) => f.direction === "out" || f.direction === "center")
          .map((m) => m.name);
        config.setSelectedNodeNames(filteredNodeNames);
      }
    }
    // now get the links
    let chartLinks = showEle.links;
    expandedAll = config.selectedNodeNames.length === (config.showParameters ? config.totalNodeCount : config.noParameterNodeCount);

    // filter if NN or not expandedAll
    if(fromNearestNeighbourDefaultNodeClick ||  config.tooltipRadio !== "none"
    || (config.graphDataType === "parameter" && config.nearestNeighbourOrigin !== "")){
      chartLinks = showEle.links.filter((f) => config.notDefaultSelectedLinks
        .some((s) => s.source === getSourceId(f) && s.target === getTargetId(f)));
      simulation.nodes(chartNodes).force("link").links(chartLinks);
      simulation.alphaTarget(1).restart();
    } else if (config.graphDataType === "parameter" && config.currentLayout === "shortestPath" && config.notDefaultSelectedLinks.length > 0){
      console.log('working')
      chartLinks = config.notDefaultSelectedLinks;
    } else if (chartNodes.length !== (config.showParameters ? config.totalNodeCount : config.noParameterNodeCount)){
       chartLinks = showEle.links.filter((f) =>
         chartNodes.some((s) => s.NAME === getSourceId(f)) &&
         chartNodes.some((s) => s.NAME === getTargetId(f)));
    } else if (!expandedAll && config.graphDataType === "parameter" && config.currentLayout === "default"){
      chartLinks = showEle.links.filter((f) => config.selectedNodeNames.includes(getSourceId(f))
        && config.selectedNodeNames.includes(getTargetId(f)));
    } else if (chartLinks.length > 4000){
      chartLinks = selectSpatiallyEvenLinks(showEle.links,chartNodes,4000);
      const allNodeNamesLength = config.showParameters ? config.totalNodeCount : config.noParameterNodeCount;
      if(config.graphDataType === "parameter" && config.currentLayout === "default" && allNodeNamesLength === config.selectedNodeNames.length){
        config.setVisibleVariableLinks(chartLinks);
      }
    }

    if(config.graphDataType !== "parameter" && !afterDrag) {
      // reset urlString if needed
      let urlString = `${windowBaseUrl}?${config.graphDataType === "submodule" ? "QV" : "MV"}=`;
      config.expandedMacroMesoNodes.forEach((nodeId) => {
        urlString += `${getUrlId(nodeId)}_`
      })
      config.macroMesoUrlExtras.forEach((nodeId) => {
        if(!config.expandedMacroMesoNodes.some((s) => s === nodeId)){
          urlString += `${getUrlId(nodeId)}_`
        }
      })

      let newUrlString = "";
      if (window.location.href.includes("?view=variable")) {
        // don't change
      } else {
        if (urlString.split("?")[1] === "QV=" || urlString === "MV=") {
          // clearing URL string if nothing expanded
          newUrlString = windowBaseUrl;
        } else {
          // resetting URL string
          newUrlString = urlString;
        }
      }
      history.replaceState(null, '', newUrlString);

      // stop simulation
      simulation.stop();

      const {segmentNames, subModuleNames, subModuleNodes, mmLinks} = config.hierarchyData;
      // next section will only apply if macroMesoUrlExtras (populated on load in main.js) has entries
      // for each entry a simulation re-run is performed - seems illogical but this feature was
      // added at the end of dev and the key thing here is to make sure node positions are maintained
      // within submodule + segment groups and don't overlap

      // find submodules
      const expandedSubmodules = config.macroMesoUrlExtras.filter((f) => subModuleNames.includes(f));
      // for each submodule
      expandedSubmodules.forEach((submodule) => {
        // fetch node from data
        const submoduleNode = subModuleNodes.find((f) => f.data.id === submodule);
        if(submoduleNode){
          // simulate a click and re-run simulation
          clickMacroMeso(submoduleNode);
        }
      })
      // find segments
      const expandedSegments = config.macroMesoUrlExtras.filter((f) => segmentNames.includes(f));
      expandedSegments.forEach((segment) => {
        // for each segment
        // fetch submodule from current simulation (for position)
        const segmentNode = showEle.nodes.find((f) => f.data?.id || f.id === segment);
        if(segmentNode){
          // simulate a click and re-run simulation
          clickMacroMeso(segmentNode);
        }
      })

      const clickParameter = (parameterNode) => {
        if(!parameterNode) return;
        // if node exist - 'click it' and reset url string
        parameterNode.clicked = true;
        config.setMMClickedVariable(parameterNode.id);
      }

      const clickSegment = (segmentNode) => {
        if(segmentNode){
          clickMacroMeso(segmentNode);
          const parameterNode = showEle.nodes.find((f) => f.id === parameterClickId);
          clickParameter(parameterNode, false)
        }
      }
      // as well as expanded submodules/segments one parameter at a time can be highlighted and populate url
      let parameterClickId = config.macroMesoUrlExtras.find((f) => !subModuleNames.includes(f) && !segmentNames.includes(f));
      if(parameterClickId){
        // convert to valid id
        parameterClickId = parameterClickId.replace(/~/g,'');
        const parameterNode = showEle.nodes.find((f) => f.id === parameterClickId)
        if(parameterNode){
            clickParameter(parameterNode, true)
        } else {
          // node currently not expanded
          const dataNode = config.parameterData.nodes.find((f) => f.NAME.toLowerCase() === parameterClickId.toLowerCase());
          const segmentNode = showEle.nodes.find((f) => f.id === `segment-${dataNode.SEGMENT}`);
          if(segmentNode){
            clickSegment(segmentNode)
          } else {
            const subModuleNode = showEle.nodes.find((f) => f.id === `submodule-${dataNode.SUBMODULE}`);
            if(subModuleNode){
              clickMacroMeso(subModuleNode);
              const segmentNode = showEle.nodes.find((f) => f.id === `segment-${dataNode.SEGMENT}`);
              clickSegment(segmentNode)
            }
          }
        }
      }
    chartNodes = showEle.nodes;

    const visibleNodeIds = showEle.nodes.map((m) => m.id);

    if(config.clickedMMVariable !== ""){
      if(!visibleNodeIds.includes(config.clickedMMVariable)){
        config.setMMClickedVariable("");
      } else {
        const clickedNode = showEle.nodes.find((f) => f.id === config.clickedMMVariable);
        clickedNode.clicked = true;
        d3.select(`#search-input`).property("value", config.clickedMMVariable);

      }
    }
    chartLinks =  mmLinks
      .filter((f) => visibleNodeIds.includes(getSourceId(f)) && visibleNodeIds.includes(getTargetId(f)))
      .map(f => ({ ...f }));

    const hasTier3 = showEle.nodes.some((s) => s.type === 'tier3');

    if(hasTier3){
      config.parameterData.links
        .filter((f) => visibleNodeIds.includes(getSourceId(f)) && visibleNodeIds.includes(getTargetId(f)))
        .forEach((link) => chartLinks.push(({ ...link })));
    }
    // re-run simulation
    simulation.nodes([]).force("link").links([])
    simulation.nodes(showEle.nodes).force("link").links(chartLinks);
    simulation.alphaTarget(1).restart();
    // stop at calculated tick time (from previous dev)
    simulation.tick(SIMULATION_TICK_TIME);
    simulation.stop();
      // after all that, reset setQuildMesoUrlExtras
      config.setMacroMesoUrlExtras([]);
    }

    drawChartLinks(svg, chartLinks);

    const dragged = (event, node) => {
      if(config.graphDataType === "parameter" && config.currentLayout !== "default") return;
      // resetting data for affected nodes only rather than running updatePositions again
      // because render time was so much faster
      // reset node data
      // filter and position nodes
      svg.selectAll(".nodesGroup")
        .attr("transform",  (d) => {
          if(d.id === node.id) return `translate(${event.x},${event.y})`
          return  `translate(${d.fx | d.x},${d.fy | d.y})`;
        });

      // reset link data
     svg.selectAll(".linkPath")
        .each((d) => {
          if(d.source.id === node.id){
            d.source.x = event.x;
            d.source.y = event.y;
          } else if(d.target.id === node.id) {
            d.target.x = event.x;
            d.target.y = event.y;
          }
        })
       .attr("d", getLinkPath)
    }

    const dragended = (event, node) => {
      if(config.graphDataType === "parameter" && config.currentLayout !== "default") return;
      node.x = event.x;
      node.y = event.y;
      if(config.graphDataType === "parameter"){
        const newPositions = config.defaultNodePositions;
        newPositions[node.id] = {x: node.x, y: node.y}
        config.setDefaultNodePositions(newPositions)
      }
    }



    function macroOrMesoHighlight  (d)  {
      // highlight adjoining links and nodes when in config.graphDataType === "submodule" (Macro) or "segment" (meso)
      const currentNodeId = d.id;

      // tone down links, nodes and remove paths
      svg.selectAll(".allLinkPaths").style("display", "none");
      svg.selectAll(".nodesGroup").attr("opacity",(d) => d.id === currentNodeId ? 1 : 0.2);

      svg.selectAll(".allLinkPaths")
        .filter((f) => f.source.id === currentNodeId || f.target.id === currentNodeId)
        // after filter, highlight adjoining links and nodes
        .each((d,i,objects) => {
          const opposite = d.source.id === currentNodeId ? d.target.id : d.source.id;

          const nodesGroup = svg.selectAll(".nodesGroup")
            .filter((f) =>  f.id === opposite);

           nodesGroup.attr("opacity",1);
           nodesGroup.selectAll(".nodeLabel").style("display", "block")
          d3.select(objects[i])
            .style("display","block");
        })
    }

    const allNodeMouseout = () => {
      svg.selectAll(".nodesGroup").attr("opacity",1);
      svg.selectAll(".nodeLabel").style("display", getNodeLabelDisplay);
      svg.selectAll(".allLinkPaths").style("display","block");
    }

    function getNewMacroMesoNode (nodeId, x,y, type)  {
        // used when resetting from URL click and in clickMacroMeso
        const descendant = config.expandedTreeData.descendants().find((f) => f.data.id === nodeId);
        const matchingSubModule = subModuleColors.find((f) => f.name === descendant.data.subModule);
        if(!matchingSubModule){
          console.error(`no matching submodule for ${descendant.data.subModule} - shouldn't happen!`)
        }
        let filteredChildren = descendant.children
        if(type === "tier2" && !config.showParameters){
          filteredChildren = descendant.children.filter((f) => !f.isParameter)
        }
        return {
          id: descendant.data.id,
          name: descendant.data.NAME,
          DISPLAY_NAME: descendant.data.DISPLAY_NAME,
          radius: nodeRadiusScale(descendant.data.type),
          color: matchingSubModule.fill,
          children: filteredChildren
            ? filteredChildren.map((m) => m.data.id)
            : [],
          parameterCount: descendant.data.parameterCount,
          radiusVar: filteredChildren ? descendant.leaves().length : 0,
          group: descendant.data.type === "tier3" ? descendant.data.parent : descendant.data.subModule,
          parent: descendant.parent.data.id,
          subModule: descendant.data.subModule,
          type,
          x,
          y
        };
    }
    function clickMacroMeso (d) {
      if((d.children) && d.type !== "tier3"){
        const childIds = d.children.length === 0 ? [] : typeof d.children[0] !== "object" ? d.children : d.children.map((m) => m.data.id);
        childIds.forEach((child) => {
          const currentType = d.type || d.data.type
          const newType = currentType === "tier1" ? "tier2" : "tier3";
          if(newType === "tier3" && !config.showParameters){
            const childNode = config.parameterData.nodes.find((f) => f.id === child);
            if(childNode && !childNode.isParameter){
              showEle.nodes.push(getNewMacroMesoNode(child, d.x, d.y, newType));
            }
          } else {
            showEle.nodes.push(getNewMacroMesoNode(child, d.x, d.y, newType));
          }
        })
        config.setExpandedMacroMesoNodes(config.expandedMacroMesoNodes.concat(d.id));
        showEle.nodes = showEle.nodes.filter((f) => f.id !== d.id);
      }
    }

    const isNormalClick = (event) =>
      !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey);

     // append chartNodes to nodesGroup and define attributes
    const nodesGroup = svg.select(".nodeGroup")
      .selectAll(".nodesGroup")
      .data(chartNodes, (d) => d.id + config.graphDataType)
      .join((group) => {
        const enter = group.append("g").attr("class", "nodesGroup");
        enter.append("circle").attr("class", "nodeOpacityCircle nodeBackgroundCircle");
        enter.append("circle").attr("class", "nodeOpacityCircle nodeCircle");
        enter.append("text").attr("class", "nodeLabel");
        return enter;
      });

    nodesGroup
      .attr("opacity",1)
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .on("mouseover",(event,d) => {
        tooltip.style("visibility", "hidden");
        if(config.graphDataType !== "parameter"){
          // for submodule + segment
          if(!showEle.nodes.find((f) => f.clicked)){
            // highlighted if nothing clicked
            macroOrMesoHighlight(d);
          }
          let tooltipNode = {
            NAME: d.data?.NAME || d.name,
            DISPLAY_NAME: d.data?.DISPLAY_NAME || d.DISPLAY_NAME,
            COLOR: d.color,
            parameterCount: d.data?.parameterCount || d.parameterCount
          }
          const hierarchyType = d.type || d.data.type;
          if(hierarchyType === "tier2"){
            tooltipNode["SUBMODULE_NAME"] = config.hierarchyData.segmentSubmoduleMapper[d.subModule || d.group];
          }
          if(hierarchyType === "tier3"){
            tooltipNode["SUBMODULE_NAME"] = config.hierarchyData.segmentSubmoduleMapper[d.subModule];
            tooltipNode["SEGMENT_NAME"] = config.hierarchyData.segmentSubmoduleMapper[d.group];
          }
          updateTooltip(tooltipNode,true);
          const tooltipStart = d.type === "tier3" ? "highlight" : "expand";
          showTooltipExtra(event.x + 10, event.y,`CLICK to ${tooltipStart}<br>SHIFT + CLICK to collapse`,false)
        } else {
          updateTooltip(d, true);
          if(config.currentLayout === "nearestNeighbour"){
            // slightly different behaviour for NN
            svg.selectAll(".allLinkPaths")
              .style("display","none");
            svg.selectAll(".allLinkPaths")
              .filter((f) => d.nnLinkIds.includes(f.source.id) && d.nnLinkIds.includes(f.target.id))
              .style("display","block");

            svg.selectAll(".nodesGroup")
              .attr("opacity",0.2)
              .filter((f) =>  d.nnLinkIds.includes(f.id))
              .attr("opacity",1);
          }
        }
      })
      .on("mouseout", () => {
        expandedAll = config.selectedNodeNames.length === (config.showParameters ? config.totalNodeCount : config.noParameterNodeCount);
        d3.select(".tooltipExtra").style("visibility","hidden");
          if(config.graphDataType === "parameter"){
            allNodeMouseout();
          if(expandedAll && config.currentLayout === "default"){
            tooltip.style("visibility", "hidden");
          } else {
            const tooltipNode = getTooltipNode();
            updateTooltip(tooltipNode, false);
          }
        } else {
            tooltip.style("visibility", "hidden");
            if(!showEle.nodes.find((f) => f.clicked)) {
              allNodeMouseout();
            }
       }
      })
      .on("click", (event, d) => {
        if (event.defaultPrevented) return; // dragged
        // no click action in shortest path or nearest neighbour view
        if(config.graphDataType === "parameter" && config.currentLayout !== "default") return;
        if(config.currentLayout === "default" && config.graphDataType === "parameter"){
          allNodeMouseout();
          // default click (NN 1 search but staying in this layout)
          d3.select(event.currentTarget).raise();
          config.setNearestNeighbourDegree(1);
          clickNode(d.NAME, "node", graph)
        }
        // do nothing on click if NN or SP layout
        // add segment when ready
        if(config.graphDataType !== "parameter"){
          d3.select(`#search-input`).property("value","")
          d3.select(".tooltipExtra").style("visibility","hidden");
          allNodeMouseout();
          if (isNormalClick(event)) {
            // if no shift/alt/command
            if(d.children && d.type !== "tier3"){
              showEle.nodes.map((m) => m.clicked = false);
              // for tier1 + tier2 nodes - EXPAND
              d3.select(".animation-container").style("display", "flex");
              setTimeout(() => {
                clickMacroMeso(d);
                updatePositions(true);
              }, 0); // or 16 for ~1 frame delay at 60fps
            } else {
              // for tier3 nodes
              if(d.clicked){
                // if clicked - reset so not clicked and remove from expandedMacroMesoNodes list
                d.clicked = false;
                config.setMMClickedVariable("");
                config.setExpandedMacroMesoNodes(config.expandedMacroMesoNodes.filter((f) => f !==d.id))
              } else {
                // if not clicked - highlight, show label, click, add to expandedMacroMesoNodes list + Url string
                macroOrMesoHighlight(d);
                d3.selectAll(".nodeLabel").style("display", (l) => l.id === d.id ? "block" : getNodeLabelDisplay(l))
                d.clicked = true;
                config.setMMClickedVariable(d.id);
                config.setExpandedMacroMesoNodes(config.expandedMacroMesoNodes.concat(d.id))
                let urlString = `${windowBaseUrl}?${config.graphDataType === "submodule" ? "QV" : "MV"}=${getUrlId(d.id)}`;
                history.replaceState(null, '', urlString);
                d3.select(`#search-input`).property("value",d.id);
              }
            }
          } else if (d.type === "tier3") {
            // shift/alt/command click + tier 3
            //delete all depth 2 with my parent
            showEle.nodes = showEle.nodes.filter((f) => (f.parent?.id || f.parent) !== d.parent);
            // add parent if depth 1 = delete all
            showEle.nodes.push(getNewMacroMesoNode(d.parent, d.x, d.y, "tier2"));
            config.setExpandedMacroMesoNodes(config.expandedMacroMesoNodes.filter((f) => f !== d.parent));
            d3.select(".animation-container").style("display", "flex");
            setTimeout(() => {
              updatePositions(true);
            }, 0); // or 16 for ~1 frame delay at 60fps
          } else if (d.data?.type === "tier2" || d.type === "tier2") {
            // shift/alt/command click + tier 2
            // add submodule parent
            if(!d.subModule){
              d.subModule = d.data.subModule;
            }
            // delete all with matching subModule
            showEle.nodes = showEle.nodes.filter((f) => (f.subModule || f.data?.subModule) !== d.subModule);
            showEle.nodes.push(getNewMacroMesoNode(d.subModule, d.x, d.y, "tier1"));
            config.setExpandedMacroMesoNodes(config.expandedMacroMesoNodes.filter((f) => f !== d.subModule));
            d3.select(".animation-container").style("display", "flex");
            setTimeout(() => {
              updatePositions(true);
            }, 0); // or 16 for ~1 frame delay at 60fps
          }
          // can't do collapse tier1 (or submodule) nodes
        }
      })

    // used in animation when NN flickering
    nodesGroup
      .select(".nodeBackgroundCircle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => d.color)
      .attr("stroke", "white")
      .attr("stroke-width", 0)
      .attr("stroke-opacity", 0.7)

    svg.selectAll(".nodeBackgroundCircle")
      .classed("pulseNN", (d) => config.nearestNeighbourOrigin === "" ? false : config.nearestNeighbourOrigin === d.id)


    const getNodeStrokeWidth = (node) => {
      if(config.graphDataType === "parameter") return 0;
      const hierarchyType = node.type || node.data.type;
      return hierarchyType === "tier3" ? 0 : 1;
    }
    nodesGroup
      .select(".nodeCircle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) =>  d.color)
      .attr("stroke", "white")
      .attr("stroke-width", getNodeStrokeWidth)

    nodesGroup.call(d3.drag()
        .on("drag", dragged)
        .on("end",dragended));

    nodesGroup
      .select(".nodeLabel")
      .attr("pointer-events","none")
      .style("display", getNodeLabelDisplay)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("dy",getNodeLabelDy)
      .attr("font-size",getNodeLabelSize)
      .text((d) => (d.NAME || d.data?.NAME || d.name));

    resetMenuVisibility();

    if(config.graphDataType === "parameter" && config.currentLayout === "nearestNeighbour"){
      if(config.nearestNeighbourOrigin !== ""){
        d3.select("#resetButton").style("display","block");
      }
    }
    if(config.graphDataType === "parameter" && config.currentLayout === "shortestPath"){
      if(config.shortestPathStart !== "" && config.shortestPathEnd !== ""){
        d3.select("#resetButton").style("display","block");
      }
    }

    if(config.graphDataType === "submodule"){
      const nonSubmoduleNodes = showEle.nodes.some((s) => s.type !== "tier1");
      if(nonSubmoduleNodes){
        d3.select("#resetButton").style("display","block");
      }
    }
    if(config.graphDataType === "segment"){
      const nonSegmentNodes = showEle.nodes.some((s) => s.type !== "tier2");
      if(nonSegmentNodes){
        d3.select("#resetButton").style("display","block");
      }
    }
    // if request, zoom to bounds of current data
    if(zoomToBounds){
      let zoomNodes = chartNodes;
      if(!expandedAll && config.currentLayout === "default"){
        zoomNodes = zoomNodes.filter((f) => config.selectedNodeNames.includes(f.id));
      }
      performZoomAction(zoomNodes,initial ? 0 : 400,"zoomFit")
    }

    const tooltipNode = getTooltipNode();
    // cancel loader
    d3.select(".animation-container").style("display", "none");
    if(config.graphDataType === "parameter"){
      // update tooltip if parameter
      updateTooltip(tooltipNode, false);
    }

    if(expandedAll && config.graphDataType ==="parameter" && config.clickedMMVariable !== ""){
      config.setNearestNeighbourOrigin(config.clickedMMVariable);
      config.setMMClickedVariable("");
      // default mode by valid NN - simulate clickNode
      clickNode(config.nearestNeighbourOrigin,"node",graph);
    }


    // NNV URL string - simulate click to layout NN on menu - timeout delay needed
    if(config.nearestNeighbourOrigin !== "" && config.nnUrlView){
      config.setCurrentLayout("default");
      setTimeout(() => {
        d3.select("#nearestNeighbour")
          .dispatch("click");
        d3.select('#nnDegree').property('value', config.nearestNeighbourDegree);
        config.setNNUrlView(false);
      },0)
    }
    // SP URL string - simulate click to layout SP - timeout delay needed
    if(config.shortestPathStart !== "" && config.shortestPathEnd !== "" && config.currentLayout === "default"){
      config.setCurrentLayout("default");
      setTimeout(() => {
        d3.select("#shortestPath").dispatch("click");
      },0)
    }

    // if a parameter/tier3 node is clicked - highlight and show label - timeout delay needed
    if(config.graphDataType !== "parameter" && showEle.nodes.some((s) => s.clicked)){
      // for url retrieval, checking if clicked and changing appearance after all nodes have rendered
      const clickedNode = showEle.nodes.find((s) => s.clicked);
      macroOrMesoHighlight(clickedNode);
      setTimeout(() => {
        svg.selectAll(".nodeLabel").style("display", (l) => l.id === clickedNode.id ? "block" : getNodeLabelDisplay(l))
      },0)
    }
    if(nnViewChange){
      positionNearestNeighbours(true)
    }
    resetNodeHighlight();

  }
  // simulation functions
  function centroid(nodes) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const d of nodes) {
      let k = d.radius ** 4;
      x += d.x * k
      y += d.y * k;
      z += k;
    }
    return { x: x / z, y: y / z };
  }


  function forceCluster() {
    //const strength =  config.graphDataType === "parameter" ? 0.3 : 0.6 ;
    const strength = config.graphDataType === "parameter" ? 0.2 : 0.4
    const parentStrength = 0.05;
    let nodes;
    function force(alpha) {

       if(config.graphDataType === "parameter"){
         const centroids = d3.rollup(nodes, centroid, (r) =>   r.subModule );
         for (const d of nodes) {
           const l = alpha * strength;
           const { x: cx, y: cy } = centroids.get(d.subModule);
           d.vx -= (d.x - cx) * l;
           d.vy -= (d.y - cy) * l;
         }
       } else {
         // Calculate centroids for each group
         const groupCentroids = d3.rollup(nodes, centroid, (r) => r.group);

         // Calculate centroids for each parent group
         const parentCentroids = d3.rollup(nodes, centroid, (r) => r.subModule);

         for (const d of nodes) {
           const l = alpha * strength;
           const pl = alpha * parentStrength;

           // Force toward group centroid (strong)
           const { x: cx, y: cy } = groupCentroids.get(d.group);
           d.vx -= (d.x - cx) * l;
           d.vy -= (d.y - cy) * l;

           // Force toward parent group centroid (weak)
           const { x: pcx, y: pcy } = parentCentroids.get(d.subModule);
           d.vx -= (d.x - pcx) * pl;
           d.vy -= (d.y - pcy) * pl;
         }
       }


    }
    force.initialize = (_) => (nodes = _);

    return force;
  }

  function getTooltipTable (listToShow) {
    let content = [];
    const nnNode = showEle.nodes.find((f) => f.NAME === config.nearestNeighbourOrigin);
    if(nnNode) {

      content = [`<div class="tooltipTableContents" style="white-space: nowrap; text-overflow: ellipsis; background-color :${nnNode.color}">${nnNode.NAME.toUpperCase()}${nnNode["DISPLAY_NAME"] ? " - " : ""}${nnNode["DISPLAY_NAME"] || ""}</div>
            <div id="directionToggle">
             <label><input type="radio" class="directionToggle" name="directionToggle" value="both" ${config.tooltipRadio === "both" ? "checked" : ""}>both</label>
             <label><input type="radio" class="directionToggle" name="directionToggle" value="in" ${config.tooltipRadio === "in" ? "checked" : ""}>only &larr;</label>
             <label><input type="radio" class="directionToggle" name="directionToggle" value="out" ${config.tooltipRadio === "out" ? "checked" : ""}>only &rarr;</label>
           </div>`]
      listToShow = listToShow.filter((f) => f.name !== config.nearestNeighbourOrigin);
    } else if(config.shortestPathString !== ""){
      content = [`<div class="tooltipTableContents" style="white-space: nowrap; text-overflow: ellipsis; ">${config.shortestPathString}</div>`]
    }
    if(listToShow.length > 0){
      if(!listToShow.some((s) => s.direction === undefined) && config.currentLayout === "default"){
        if(config.tooltipRadio === "none"){
          config.setTooltipRadio("both");
        }
      } else {
        config.setTooltipRadio("none");
      }
      d3.select(".tooltip").style("padding","0.05rem")
      const shortestPathHeader = config.nearestNeighbourOrigin === "" ? "" : `<th style='width:5%;'></th>`;
      const nearestNeighbourHeader =  `<th style='width:5%;'></th>`;
      const tableStart = `<table style='overflow-y: auto; overflow-x: hidden; font-size: 0.7rem; table-layout: fixed;  width: 100%;'>
        <thead><tr>
          ${config.graphDataType === "parameter" ? "<th style='width:30%; color: black;'>SEGMENT</th>" : ""}
          <th style='width:35%; color: black;'>NAME</th>
          <th style='width:30%; color: black;'>DISPLAY NAME</th>
          ${shortestPathHeader}
          ${nearestNeighbourHeader}
       </tr></thead><tbody>`
      content.push(tableStart);
      let nodeRows = []
      listToShow.forEach((d) => {
        let directionUnicode = "";
        if(d.direction && d.direction !== "centre"){
          directionUnicode = d.direction === "in" ? ` (&larr;)` :
            d.direction === "both" ? ` (&harr;)` : ` (&rarr;)`
        }
        const nodeName = typeof  d === "string" ? d : d.name;
        const matchingNode = showEle.nodes.find((f) => f.NAME === nodeName);
        if(matchingNode){
          const directLink = config.notDefaultSelectedLinks.some((s) => (s.source === matchingNode.NAME && s.target === config.nearestNeighbourOrigin) || (s.target === matchingNode.NAME && s.source === config.nearestNeighbourOrigin));
          let shortestPathCell = "";
          if(directLink){
            shortestPathCell = "<td class='tableCell'></td>"
          } else if (config.nearestNeighbourOrigin !== ""){
            shortestPathCell =  `<td class='shortestPathLink tableCell' id='${CSS.escape(matchingNode.NAME)}' style='width:5%; cursor:pointer;'><i class='fas fa-wave-square'></i></td>`
          }
          const nearestNeighbourCell =  `<td class='nearestNeighbourLink' id='${CSS.escape(matchingNode.NAME)}' style='width:5%; cursor:pointer;'><i class='fas fa-house-user'></i></td>`
          nodeRows.push({row: `<tr id="${CSS.escape(matchingNode.NAME)}">
            ${config.graphDataType === "parameter" ? `<td  style='pointer-events: none; background-color:${matchingNode.color}; color: white; width:30%;'>${matchingNode.SEGMENT_NAME}</td>`: ""}
            <td class="tableCell" id='${CSS.escape(matchingNode.NAME)}' style="width:35%;">${directionUnicode} ${nodeName}</td>
            <td class="tableCell" id='${CSS.escape(matchingNode.NAME)}' style="width:35%;">${matchingNode["DISPLAY_NAME"] || ""}</td>
            ${shortestPathCell} ${nearestNeighbourCell}
            </tr>`, subModule: matchingNode.SUBMODULE_NAME, name: matchingNode.NAME}); // tooltip title
        }
      })
      nodeRows = nodeRows.sort((a,b) => d3.ascending(a.subModule, b.subModule) || d3.ascending(a.name, b.name));
      content = content.concat(nodeRows.map((m) => m.row));
      const tableEnd = "</tbody></table>";
      content.push(tableEnd);
    }
    return content
  }

  // Function to update tooltip content inside a DIV
  function updateTooltip(d, mouseover) {

    let contentStr = "";
    let listToShow = config.currentLayout === "default" ? config.selectedNodeNames : config.notDefaultSelectedNodeNames;
    if(config.currentLayout === "default" && config.selectedNodeNames.length === config.notDefaultSelectedNodeNames.length || config.tooltipRadio !== "none"){
      // using notDefaultSelectedNodeNames as this is from a NN search
      listToShow = config.notDefaultSelectedNodeNames;
    }
    // repeating declaration for tree NN
    expandedAll = config.selectedNodeNames.length === (config.showParameters ? config.totalNodeCount : config.noParameterNodeCount);
    if(mouseover){
      d3.select("#downloadNNData").style("display","none");
      config.setTooltipRadio("none");
      tooltip.style("padding","0.4rem");
      let content = [];
      if(!d || !d.NAME) return;
      content.push(`<div style="pointer-events: none; background-color: ${d.color || d.COLOR} "><p style='text-align: center' >${d.NAME}</p></div>`); // tooltip title
      const datum = showEle.nodes.find(node => node.NAME === d.NAME) || d;

      TOOLTIP_KEYS.forEach(key => {
        if(datum[key] && datum[key] !== ""){
          content.push(`<div><b>${key.replace(/_/g, ' ')}: </b><span>${datum[key].replace(/_/g, ' ')}</span></div>`);
        }
      })
      if(d["parameterCount"]){
        content.push(`<div><b>Node Count: </b><span>${d.parameterCount}</span></div>`)
      }
      content.map((d) => (contentStr += d));
    } else if (!expandedAll || (config.currentLayout !== "default" && config.graphDataType === "parameter")) {
      let content = getTooltipTable(listToShow);
      contentStr = !content || !content.length ? "" : content.join("");
    }

    let tooltipVisibility = "visible";
    if(config.graphDataType !== "parameter") tooltipVisibility = "hidden";
    if(listToShow.length === 0) tooltipVisibility = "hidden";
    if(config.currentLayout === "shortestPath" && (config.shortestPathStart === "" || config.shortestPathEnd === "")) tooltipVisibility = "hidden";
    if(config.currentLayout === "default" && expandedAll && !mouseover) tooltipVisibility = "hidden";
    if(mouseover) tooltipVisibility = "visible";

    d3.select("#tooltipCount")
      .text(tooltipVisibility === "visible" && !mouseover? `${listToShow.length} node${listToShow.length > 1 ? "s" : ""} selected` : "")
    if(config.currentLayout === "nearestNeighbour" && !mouseover) tooltipVisibility = "hidden";

    tooltip
      .html(`${contentStr}`)
      .style("top", "1.2rem")
      .style("left", "1rem")
      .style("visibility", tooltipVisibility);

    activateTooltipToggle();

    d3.selectAll(".shortestPathLink")
      .on("mouseover", (event) => {
        showTooltipExtra(event.x, event.y, `click to see Shortest Path from ${config.nearestNeighbourOrigin} to ${event.currentTarget.id}`)
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", (event) => {
        tooltipExtra.style("visibility","hidden");
        config.setShortestPathStart(config.nearestNeighbourOrigin);
        config.setShortestPathEnd(event.currentTarget.id)
        config.setCurrentLayout("shortestPath")
        config.setNearestNeighbourOrigin("");
        d3.select('#shortestPathEndSearch').style("display","block");
        d3.select("#search-input-sp-end").property("value",config.shortestPathEnd);
        d3.select("#nnDegreeDiv").style("display","none");
        d3.select("#infoMessage").text("");
        d3.selectAll("#search-input")
          .property("value",config.shortestPathStart);
        d3.selectAll(".dropdown-item").style("color", (d, i, objects) => {
          return config.currentLayout === objects[i].id ? "white" : "#808080";
        })
        resetMenuVisibility(width);
        positionShortestPath(graph);
      })

    d3.selectAll(".nearestNeighbourLink")
      .on("mouseover", (event) => {
        showTooltipExtra(event.x, event.y, `click to reset Nearest Neighbour to ${event.currentTarget.id}`)
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", (event) => {
        const rowId = event.currentTarget.id;
        const matchingNode = showEle.nodes.find((f) => CSS.escape(f.NAME) === rowId);
        tooltipExtra.style("visibility","hidden");
        config.setShortestPathStart("");
        config.setShortestPathEnd("")
        config.setCurrentLayout("default")
        config.setNearestNeighbourOrigin(matchingNode.id);
        d3.select('#shortestPathEndSearch').style("display","none");
        d3.select("#nnDegreeDiv").style("display","none");
        d3.select("#infoMessage").text("");
        d3.selectAll("#search-input")
          .property("value",config.shortestPathStart);
        d3.selectAll(".dropdown-item").style("color", (d, i, objects) => {
          return config.currentLayout === objects[i].id ? "white" : "#808080";
        })
        resetMenuVisibility(width);
        positionNearestNeighbours(true);
      })

    d3.selectAll(".tableCell")
      .style("cursor","pointer")
      .on("mouseover", (event) => {
        d3.selectAll(".tableCell").style("background-color","black");
        const rowId = event.currentTarget.id;
        if(!rowId)return;
        const matchingNode = showEle.nodes.find((f) => CSS.escape(f.NAME) === rowId);

        d3.selectAll(`#${rowId}`)
          .style("background-color","#484848");
        let tooltipText = matchingNode["DISPLAY NAME"];
        if(!tooltipText || tooltipText.length === 0){
          tooltipText = rowId.replace(/\\/g, '');
        }
        if(matchingNode["Parameter Explanation"]){
          tooltipText += `<br>${matchingNode["Parameter Explanation"]}`
        }
        if(tooltipText.length > 0){
          showTooltipExtra(event.x, event.y, tooltipText)
        }
      })
      .on("mouseout", () => {
        d3.selectAll(".tableCell").style("background-color","black");
        d3.selectAll(".nearestNeighbourLink").style("background-color","black");
        tooltipExtra.style("visibility","hidden");
      })

    d3.select("#downloadNNData").style("display",config.notDefaultSelectedLinks.length > 0 ? "block": "none");

  }
  //////////////////////////////////////////////////////////////////////////////

  const measureWidth = (text, fontSize) => {
    const context = document.createElement("canvas").getContext("2d");
    context.font = `${fontSize}px Arial`;
    return context.measureText(text).width;
  }
  function showTooltipExtra  (x, y,textContent, centreContent = true) {
    let tooltipLeft = x + 10;
    let tooltipTop = y;
    if(centreContent){
      const textSize = remToPx(0.5);
      const textWidth = measureWidth(textContent,textSize);
      tooltipLeft = x - (textWidth/2);
      if((x + textWidth) > width){
        tooltipLeft = x - textWidth;
      }
      if((x - textWidth) < 0){
        tooltipLeft = x;
      }
      tooltipTop = y + (textSize * 2);
      if((tooltipTop + (textSize * 2)) > height){
        tooltipTop = y - (textSize * 4);
      }
    }

    tooltipExtra.style("left", `${tooltipLeft}px`)
      .style("font-size", "0.5rem")
      .style("top",`${tooltipTop}px`)
      .style("visibility", "visible")
      .html(textContent)

  }

  const switchLayouts = (graph) => {
    renderNNLevelLabels(svg,[])
    d3.select("#search-input").property("value","");
    svg.selectAll(".nodeLabel").style("display",getNodeLabelDisplay);
    config.setTooltipRadio("none");
    if(!(config.currentLayout === "default" && config.nearestNeighbourOrigin !== "")){
      // clear url unless moving to default from NN with a current NN
      history.replaceState(null, '', windowBaseUrl);
    }
    if(config.currentLayout === "default"){
      let fromValidNN = false;
      if(config.nearestNeighbourOrigin !== ""){
        fromValidNN = true;
        config.setSelectedNodeNames(config.showParameters ? config.allNodeNames : config.noParameterAllNodeNames)
       } else if(config.shortestPathStart === "" || config.shortestPathEnd === ""){
        config.setSelectedNodeNames([]);
      }
      config.setShortestPathStart("");
      config.setShortestPathEnd("");
      d3.select('#shortestPathEndSearch').style("display","none");
      if(config.selectedNodeNames.length === 0 ){
        const allNodeNames = config.showParameters ? config.allNodeNames : config.noParameterAllNodeNames;
        config.setSelectedNodeNames(allNodeNames);
        config.setNotDefaultSelectedNodeNames([]);
        config.setNotDefaultSelectedLinks([]);
      }
      resetDefaultNodes();
      resetMenuVisibility();
      updatePositions(true,fromValidNN);
    } else {
      if(config.currentLayout === "nearestNeighbour"){
        updateViewButton(true);
        config.setShortestPathString("");
        d3.select("#infoMessage").text(MESSAGES.NN);
        config.setShortestPathStart("");
        config.setShortestPathEnd("");
        if(config.nearestNeighbourOrigin !== ""){
          d3.select("#infoMessage").text("")
          positionNearestNeighbours(false);
        } else {
          updatePositions(true);
        }
        d3.selectAll("#search-input")
          .property("value",config.nearestNeighbourOrigin);
      }
      if(config.currentLayout === "shortestPath"){
        updateViewButton(true);
        config.setShortestPathString("");
        if(config.nearestNeighbourOrigin !== ""){
          config.setShortestPathStart(config.nearestNeighbourOrigin)
        }
        config.setNearestNeighbourOrigin("");
        d3.select("#infoMessage").text(MESSAGES.SP);
        if(config.shortestPathStart !== "" && config.shortestPathEnd !== ""){
          d3.select("#infoMessage").text("");
          positionShortestPath(graph);
        } else {
          updatePositions(true);
        }
        d3.select("#search-input-sp-end").property("value",config.shortestPathEnd);
        d3.selectAll("#search-input")
          .property("value",config.shortestPathStart);
      }
      resetMenuVisibility();
    }
    d3.selectAll(".dropdown-item").style("color", (d, i, objects) => {
      return config.currentLayout === objects[i].id ? "white" : "#808080";
    })
    resetMenuVisibility();
  }

  const updateViewButton = (isHide) => {
    d3.select("#hideInfo").style("display",isHide ? "none" : "block");
    d3.select("#showInfo").style("display",isHide ? "block" : "none");
    d3.select("#collapsibleMenuContainer").style("display",isHide ? "none" : "block");
    d3.select("#unselectAll").style("display",isHide ? "none" : "block");
    d3.select("#search-tab-container").style("height",isHide ? "4rem" :"auto");
    if(!isHide){
      drawTree();
    }
  }

  function updateButtons(graph) {

    d3.selectAll(".viewButton")
      .on("click", (event) => {
        const buttonId = event.currentTarget.id;
        const isHide = buttonId === "hideInfo";
        updateViewButton(isHide);
      })

    d3.select("#resetButton")
      .on("click",(event) => {
        d3.select("#search-input").property("value","");
        d3.select("#search-input-sp-end").property("value","");
        renderNNLevelLabels(svg,[])
        svg.selectAll(".nodeBackgroundCircle").classed("pulseNN",false);
        if(config.graphDataType === "parameter"){
          if(config.currentLayout === "default"){
            d3.select(".animation-container").style("display", "flex");
            config.setShortestPathString("");
            expandedAll = true;
            performZoomAction(showEle.nodes,400,"zoomFit");
            d3.select(event.currentTarget).style("display","none");
            const allNodeNames = config.showParameters ? config.allNodeNames : config.noParameterAllNodeNames;
            config.setSelectedNodeNames(allNodeNames);
            config.setNotDefaultSelectedLinks([]);
            config.setNotDefaultSelectedNodeNames([]);
            config.setNearestNeighbourOrigin("");
            config.setShortestPathStart("");
            config.setShortestPathEnd("");
            config.setTooltipRadio("none");
            d3.select(".tooltip").style("visibility","hidden");
            setTimeout(() => {
              resetMenuVisibility();
              drawTree();
              resetNodeHighlight();
              resetDefaultNodes();
              updatePositions(true)
              drawChartLinks(svg, config.visibleVariableLinks);
            }, 0); // or 16 for ~1 frame delay at 60fps
          } else if (config.currentLayout === "nearestNeighbour"){
            config.setNearestNeighbourOrigin("");
            config.setNotDefaultSelectedLinks([]);
            d3.select("#infoMessage").text(MESSAGES.NN);
            config.setNotDefaultSelectedNodeNames([]);
            updatePositions(false,false);
          } else if (config.currentLayout === "shortestPath"){
            config.setShortestPathStart("");
            config.setShortestPathEnd("");
            d3.select("#search-input").property("value","");
            d3.select("#search-input-sp-end").property("value","");
            d3.select("#infoMessage").text(MESSAGES.SP);
            config.setNotDefaultSelectedNodeNames([]);
            config.setNotDefaultSelectedLinks([]);
            updatePositions(false,false);
          }
        } else {
          location.reload();
        }
      });

    const unselectButton =  d3.select("#unselectAll");

    unselectButton
      .style("cursor","pointer")
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, "unselect all nodes")
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", () => {
        config.setSelectedNodeNames([]);
        resetMenuVisibility();
        unselectButton.style("display","none");
        resetNodeHighlight();
      })

    const helpInfoButton = d3.select("#helpInfo");

    helpInfoButton
      .on("mouseover mousemove", (event) => {
        d3.select(event.currentTarget).style("color","#A0A0A0");
        const infoPanelVisible = d3.select("#helpInformationPanel").style("visibility") === "visible";
        showTooltipExtra(event.x, event.y, `click to ${infoPanelVisible ? "hide" : "show"} help panel`)
      })
      .on("mouseout", () => {
        helpInfoButton.style("color","white");
        tooltipExtra.style("visibility","hidden");
      })

      .on("click", () => {
          const panel = document.getElementById('helpInformationPanel');
          const overlay = document.getElementById('helpModalOverlay');
          const buttonPanel = document.getElementById('helpInfoButtonContainer');

          panel.classList.add('active');
          overlay.classList.add('active');
          buttonPanel.classList.add('active');
      })

    const helpInfoPanel = document.getElementById('helpInformationPanel');
    const helpInfoOverlay = document.getElementById('helpModalOverlay');
    const helpInfoButtonPanel = document.getElementById('helpInfoButtonContainer');
    const helpInfoCloseButton = document.getElementById('helpInfoCloseButton');

    function closeModal() {
      helpInfoPanel.classList.remove('active');
      helpInfoOverlay.classList.remove('active');
      helpInfoButtonPanel.classList.remove('active');
    }

    // Open modal (you can call this from a button or event)
    // Example: openModal();

    // Close modal on overlay click
    helpInfoOverlay.addEventListener('click', closeModal);
    helpInfoCloseButton.addEventListener('click', closeModal);

    const downloadImageButton = d3.select("#downloadImage");

    downloadImageButton
      .style("cursor","pointer")
      .on("mouseover mousemove", (event) => {
        d3.select(event.currentTarget).style("color","#A0A0A0");
        showTooltipExtra(event.x, event.y, "click to download chart as an image")
      })
      .on("mouseout", () => {
        downloadImageButton.style("color","white");
        tooltipExtra.style("visibility","hidden");
      })


    const hideSingleButton = d3.select("#hide-single-button");

    hideSingleButton.style("color", config.showSingleNodes ?  "#808080" : "white")
      .style("cursor","pointer")
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, config.showSingleNodes ? "hide single nodes" : "show single nodes")
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", () => {
        config.setShowSingleNodes(!config.showSingleNodes);
        hideSingleButton.style("color", config.showSingleNodes ?  "#808080" : "white");
        updatePositions(false);
      });


    const layoutButton = d3.select("#layout-button");

    layoutButton
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, "toggle layouts")
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })

    const degreeSlider =   d3.select("#nnDegree");

    // Listen for 'input' event to capture real-time changes
    degreeSlider.on("input", function() {
      d3.select(".animation-container").style("display", "flex");
      config.setNearestNeighbourDegree(this.value);
      d3.select("#nnDegreeValue").html(this.value);
      if(config.nearestNeighbourOrigin !== ""){
        setTimeout(() => {
          positionNearestNeighbours(false);
        }, 0); // or 16 for ~1 frame delay at 60fps
      }
    });

    d3.selectAll(".zoom-button")
      .on("mouseover mousemove", (event) => {
        showTooltipExtra(event.x, event.y, event.currentTarget.id.replace(/-/g,' '))
      })
      .on("mouseout", () => {
        tooltipExtra.style("visibility","hidden");
      })
      .on("click", (event) => {
        const buttonId = event.currentTarget.id;
        if(buttonId === "zoom-in"){
          performZoomAction(showEle.nodes, 500,"zoomIn")
        } else if(buttonId === "zoom-out"){
          performZoomAction(showEle.nodes, 500,"zoomOut")
        } else{
          performZoomAction(showEle.nodes, 500,"zoomFit")
        }
      })
    const layoutOptions = d3.selectAll(".dropdown-item")

    layoutOptions.style("color", (d, i, objects) => {
      return config.currentLayout === objects[i].id ? "white" : "#808080";
    })
      .on("click", (event) => {
        // clear nearly new and move default -> selected if moving from nn or sp
        const newLayout = event.currentTarget.id;
        if(newLayout === config.currentLayout) return;
        if(newLayout === "default" ){
          if(expandedAll && config.notDefaultSelectedNodeNames.length > 0){
            config.setSelectedNodeNames([]);
          }
          // replacing selectedNodeNames if coming from SP or NN
          config.setSelectedNodeNames(config.notDefaultSelectedNodeNames.map((m) => m.name));
        }
        config.setCurrentLayout(newLayout);
        d3.select(".animation-container").style("display", "flex");
        setTimeout(() => {
          switchLayouts(graph);
        }, 0); // or 16 for ~1 frame delay at 60fps

    });
  }
  function updateSearch(variableData, graph, extraIdString) {

    const searchInput = d3.select(`#search-input${extraIdString}`);
    const suggestionsContainer = document.getElementById(`suggestions-container${extraIdString}`);

    // Function to filter suggestions based on user input
    const  filterSuggestions = (input) => {
      let filteredNodes = config.parameterData.nodes;
      if(!config.showParameters){
        filteredNodes = filteredNodes.filter((f) => !f.isParameter);
      }
      const fuseData = config.graphDataType === "parameter" ? variableData : filteredNodes;
      const fuseOptions = {keys:  ["NAME", "DISPLAY_NAME","DEFINITION"], threshold:0.4};

      const fuse = new Fuse(fuseData, fuseOptions);
      const result = fuse.search(input);


      // from Chat GPT (with some help)
      // If you want exact matches to come at the very top, you can filter first for exact matches
      const exactMatches = result.filter(m => m.item.NAME.toLowerCase().startsWith(input.toLowerCase()));
      const nonExactMatches = result.filter(m => !m.item.NAME.startsWith(input))
       // .sort((a,b) => a.item.NAME.toLowerCase().localeCompare(b.item.NAME.toLowerCase()));
      // Combine exact matches with non-exact matches
      const finalResults = [...exactMatches, ...nonExactMatches];
      return finalResults.map((m) => m.item);
    }

    // Function to update the suggestions dropdown
    const updateSuggestions = (input) => {
      // clear clicked variable history
      config.setMMClickedVariable("");
      const filteredSuggestions = filterSuggestions(input);
      suggestionsContainer.innerHTML = "";
      // cheat as only just realised the old code was creating a suggestion each time - bad practice!
      d3.selectAll(".suggestion").remove();

      filteredSuggestions.forEach((item) => {
        const suggestionElement = document.createElement("div");
        suggestionElement.classList.add("suggestion");
        suggestionElement.textContent = item.DEFINITION ? `${item.NAME} - ${item.DEFINITION}` : item.NAME;
        suggestionElement.addEventListener("click", () => {

          searchInput.node().value = item.NAME;
          suggestionsContainer.style.display = "none";
          if (showEle.nodes.find((n) => n.NAME === item.NAME) || config.graphDataType !== "parameter") {
              clickNode(item.NAME, `search${extraIdString}`, graph);
          } else {
            if(config.graphDataType === "parameter" && config.currentLayout !== "default" && item.NAME === ""){
              config.setNotDefaultSelectedLinks([]);
              config.setNotDefaultSelectedNodeNames([]);
              updatePositions(false);
            }
          }
        });
        suggestionsContainer.appendChild(suggestionElement);
      });

      if (filteredSuggestions.length > 0) {
        suggestionsContainer.style.display = "block";
        if(config.graphDataType !== "parameter"){
          showEle.nodes.map((m) => m.clicked = false);
          config.setShowSingleNodes(true);
          svg.selectAll(".nodesGroup").attr("opacity",1);
           updatePositions(true);
        }
      } else {
        suggestionsContainer.style.display = "none";
      }
    }

    // Event listener for input changes
    searchInput.on("input", () => {
      simulation.stop();
      const inputValue = searchInput.node().value;
      updateSuggestions(inputValue);

    });
  }
}

const initGraphologyGraph = (nodes, links) => {
  // Initialize a new Graphology graph and add all nodes and edges to it
  // This will be used for shortest path and finding neighbours later
  const graph = new Graph();

  for (let i = 0; i < nodes.length; i++) {
    if (!graph.hasNode(nodes[i].id)) graph.addNode(nodes[i].id);
  }

  for (let i = 0; i < links.length; i++) {
    let srcId = getSourceId(links[i]);
    let targetId = getTargetId(links[i]);
    if (graph.hasNode(srcId) && graph.hasNode(targetId)) {
      if (!graph.hasEdge(srcId, targetId)) {
        graph.addEdge(srcId, targetId);
      }
    }
  }

  return graph;
}
function getSourceId(d) {
  return d.source && (d.source.id ? d.source.id : d.source);
}
function getTargetId(d) {
  return d.target && (d.target.id ? d.target.id : d.target);
}
