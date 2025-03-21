import * as PIXI from "pixi.js";
//import { Cull } from "@pixi-essentials/cull";
import { Viewport } from "pixi-viewport";
import * as d3 from "d3";
import { bfsFromNode } from "graphology-traversal";
import { dijkstra } from "graphology-shortest-path";
import Graph from "graphology";
import VariableTree from "./tree.js";

export default async function ForceGraph(
  {
    nodes, // an iterable of node objects (typically [{id}, …])
    links, // an iterable of link objects (typically [{source, target}, …])
  },
  {
    containerSelector, // id or class selector of DIV to render the graph in
    nodeId = "id", // given d in nodes, returns a unique identifier (string)
    sourceId = "source", // given d in links, returns a uinique source node identifier (string)
    targetId = "target", // given d in links, returns a uinique target node identifier (string)
    nodeGroup, // given d in nodes, returns an (ordinal) value for color
    nodeGroups, // an array of ordinal values representing the node groups
    nodeRadius,
    nodeTitle, // given d in nodes, a title string
    nodeFill = "0xFFFFFF", // node stroke fill (if not using a group color encoding)
    nodeStroke = "0xFFFFFF", // node stroke color
    nodeStrokeWidth = 4, // node stroke width, in pixels
    nodeFillOpacity = 1, // node stroke opacity
    nodeStrokeOpacity = 1, // node stroke opacity
    nodeMinSize = 6, // node radius, in pixels
    linkStroke = "0xFFFFFF", // link stroke color
    linkStrokeOpacity = 0.7, // link stroke opacity
    linkStrokeWidth = 1.5, // given d in links, returns a stroke width in pixels
    //labelVisibility = "hidden",
    labelColor = "white",
    labelScale = 2, // the font size of labels are pegged to the node radius. if labelScale = 1, the font size is the same number of pixels as the radius. Increase labelScale to increase font size.
    colors = d3.schemeTableau10, // an array of color strings, for the node groups
    width = 640, // outer width, in pixels
    height = 400, // outer height, in pixels
    tooltipStyles = {
      width: "300px",
      height: "auto",
      padding: "10px",
      "background-color": "white",
      border: "1px solid black",
      "z-index": 10,
    },
  } = {}
) {
  console.log("received data", nodes, links);

  const THRESHOLD = 0; // FOR TESTING PURPOSES ONLY TO REDUCE GRAPH SIZE BY FILTERING SUBMODULES

  let scrollY = 0; // Variable tree scroll location
  let nodeDegrees = {}; // an object to store each node degree (number of connections that a node has to other nodes in the network)
  let nodeCollapsedState = {}; // an object to store flag values to determine an expand or collapse action on a node
  let singleNodeIDs = []; // an array to store the names of nodes with no connections to other nodes
  let prevNodes = []; // Stores coordinates of parent nodes before expansion happens, to use as new starting positions of child nodes
  let TOOLTIP_KEYS = ['NAME', "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"] 

  // Click helper states
  let clickedNodes = []; // an array to store the names of clicked nodes
  let clickCount = 0;
  let timer;

  // View states
  let searched = false; // if node is searched for from the searchbox or tree, searched=true
  let clickedSP = false; // if two nodes are clicked to reveal the shortest path (SP) results between them, clickedSP=true
  let clickedNN = false; // if a node has been clicked to reveal its nearest neighbor (NN), clickedNN=true
  let expandedAll = true; // if full graph (all children nodes visible), expandedAll=true

  // Button activation states
  // Note: there are different consequences for a VIEW state and BUTTON ACTIVATION state, so these variables are separated)
  let showArrows = false; // if edge directions are shown on graph, showArrows=true
  let showNeighbors = true; // if user is allowed to mouseover node to begin search for OUTWARD-BOUND ONLY neighbours 2 degrees away, showNeighours=true
  let showShortestPath = false; // if user is allowed to click on any node to begin SP search, showShortestPath = true (this flag helps to differentiate from click-to-drag event)
  let showSingleNodes = true; // to show/hide on screen nodes with no connections
  let DEGREE = 1 // nearest neighbour search degree, eg. 1 degree means only direct target nodes are detected.
  let RESET_OPTION = 'Whole' // Quilt, Middle, Whole

  // Set up accessors to enable a cleaner way of accessing data attributes
  const N = d3.map(nodes, (d) => d[nodeId]).map(intern);
  const LS = d3.map(links, (d) => d[sourceId]).map(intern);
  const LT = d3.map(links, (d) => d[targetId]).map(intern);

  // Replace the input nodes and links with mutable objects for the simulation
  nodes = d3.map(nodes, (d, i) => ({ id: N[i], ...d, type: "tier3" })); // tier3 indicates theses are VARIABLE nodes
  links = d3.map(links, (_, i) => ({
    source: LS[i],
    target: LT[i],
  }));

  // Create the submodule nodes
  const SUBMODULES = [...new Set(nodes.filter((d) => d.SUBMODULE > THRESHOLD).map((d) => d.SUBMODULE))]
    .filter((d) => d)
    .map((d) => {
      // Note: the prefix submodule- is necessary here because variables may have the same ID number as a submoulde or segment node
      nodeDegrees["submodule-" + d] = 0;
      nodeCollapsedState[d] = expandedAll ? 1 : 0;
      const node = nodes.find((n) => n.SUBMODULE === d);
      return {
        id: "submodule-" + d,
        NAME: node ? node.SUBMODULE_NAME.split(",")[0] : "", // Note: There wouldn't be a need to split by comma if submodule names with the same submodule ID are all unique. I assume only the first name in the string is the label to be presented
        SUBMODULE_NAME: node ? node.SUBMODULE_NAME.split(",")[0] : "",
        SUBMODULE: d,
        type: "tier1", // tier1 indicates these are SUBMODULE nodes
      };
    });

  // Create the segment nodes for each submodule node
  const SEGMENTS = [...new Set(nodes.filter((d) => d.SUBMODULE > THRESHOLD).map((d) => d.SUBMODULE + "_" + d.SEGMENT))]
    .filter((d) => d !== "null_null")
    .map((d) => {
      nodeDegrees["segment-" + d] = 0;
      nodeCollapsedState[d] = expandedAll ? 0 : 1;
      const node = nodes.find((n) => n.SUBMODULE === +d.split("_")[0] && n.SEGMENT === +d.split("_")[1]);
      return {
        id: "segment-" + d,
        NAME: node ? node.SEGMENT_NAME.split(",")[0] : "",
        SUBMODULE_NAME: node ? node.SUBMODULE_NAME.split(",")[0] : "",
        SUBMODULE: +d.split("_")[0],
        SEGMENT_NAME: node ? node.SEGMENT_NAME.split(",")[0] : "",
        SEGMENT: +d.split("_")[1],
        type: "tier2", // tier2 indicates these are SEGMENT nodes
      };
    });

  for (let i = 0; i < nodes.length; i++) {
    nodeDegrees[nodes[i].id] = 0;
  }

  // if (expandedAll === false) {
  //   nodes = nodes.concat(SEGMENTS);
  // }

  for (let i = 0; i < links.length; i++) {
    let link = links[i];
    const srcNode = nodes.find((n) => n.id === link.source);
    const targetNode = nodes.find((n) => n.id === link.target);
    // Sizes of the nodes weighted by the number of links going INTO that node.
    //nodeDegrees[link.source]++;
    nodeDegrees[link.target]++;
    nodeDegrees["segment-" + targetNode["SUBMODULE"] + "_" + targetNode["SEGMENT"]]++;
    nodeDegrees["submodule-" + targetNode["SUBMODULE"]]++;
    // For easier access in expand/collapse function....
    link.sourceSegment = srcNode["SEGMENT"];
    link.targetSegment = targetNode["SEGMENT"];
    link.sourceSubmodule = srcNode["SUBMODULE"];
    link.targetSubmodule = targetNode["SUBMODULE"];
  }

  // All VARIABLE NODES AND THE LINKS BETWEEN THEM (fully expanded graph, no segment or submodule nodes)
  let origEle = filterElements(nodes, links, true, "SUBMODULE", THRESHOLD);
  // If expandedAll=false, only SEGMENT nodes to render on screen on page load initially
  let showEle = filterElements(nodes.concat(SEGMENTS), links, expandedAll, "SUBMODULE", THRESHOLD);
  // Save an original copy of all variable nodes and the links between them. Necessary to enable accuracy of expand / collapse feature
  let origNodes = [...origEle.nodes];
  let origLinks = [...origEle.links];
  let allNodes = [...origEle.nodes, ...SEGMENTS, ...SUBMODULES];

  const nodeRadiusScale = d3
    .scaleSqrt()
    .domain(nodeRadius ? d3.extent(nodes, nodeRadius) : [0, d3.max(Object.values(nodeDegrees))])
    .range([nodeMinSize, nodeMinSize * 5])
    .clamp(true);

  /////////////////// Set up initial  DOM elements on screen ///////////////////
  // Create a container for tooltip that is only visible on mouseover of a node
  const tooltip = d3.select(containerSelector).append("div").attr("class", "tooltip").style("position", "absolute").style("visibility", "hidden");

  for (const prop in tooltipStyles) {
    tooltip.style(prop, tooltipStyles[prop]);
  }

  // Create a container to show / track clicked node selection to find shortest path
  const message = d3.select(containerSelector).append("div").attr("class", "message");

  message.append("h2").attr("class", "clickedNodes-1");

  message.append("h2").attr("class", "clickedNodes-2");

  message.append("h3").attr("class", "shortestPath-status").style("color", "white");
  // Reset message for both SP and NN search
  message
    .append("h3")
    .attr("class", "clickedNodes-reset")
    .attr("text-decoration", "underline")
    .attr("pointer-events", "auto")
    .style("cursor", "pointer")
    .style("color", "white")
    .html("RESET")
    .on("click", function () {
      reset();
    });
  //////////////////////////////////////////////////////////////////////////////

  ////////////////////////// INITIALIZE APPLICATION ////////////////////////////
  // Retrive graph state to render initially
  if (window.location.href.includes("?state=%")) {
    let showNodesIDs = window.location.href.split("?state=%")[1].split("-");
    showNodesIDs[0] = showNodesIDs[0].slice(2);
    showNodesIDs[showNodesIDs.length - 1] = showNodesIDs[showNodesIDs.length - 1].slice(0, -3);

    showEle.nodes = allNodes.filter((node) => showNode(showNodesIDs, node.NAME.toString()));
    showEle.links = origLinks.filter((link) => showLink(showNodesIDs, link));

    for (let i = 0; i < showEle.nodes.length; i++) {
      addLinksBwSubmoduleAndOthers(showEle.nodes[i]);
      addLinksBwSegmentAndOthers(showEle.nodes[i]);
      addLinksBwVarAndOthers(showEle.nodes[i]);
    }

    // PRECAUTIONARY ACTION: ENSURE THAT ONLY LINKS WITH CORRESPONDING SOURCE AND TARGET NODES ON SCREEN ARE RENDERED
    const nodeIDs = showEle.nodes.map((node) => node.id);
    let linksToAdd = [];
    for (let i = 0; i < showEle.links.length; i++) {
      if (showLink(nodeIDs, showEle.links[i])) {
        linksToAdd.push(showEle.links[i]);
      }
    }
    showEle.links = linksToAdd;
    SUBMODULES.map((d) => {
      nodeCollapsedState[d.SUBMODULE] = 1;
    });
    SEGMENTS.map((d) => {
      nodeCollapsedState[d.SEGMENT] = 0;
    });
  }

  // Initialize simulation
  const simulation = d3
    .forceSimulation()
    .force(
      "link",
      d3.forceLink().id((d) => d.id)
    )
    .force(
      "x",
      d3.forceX((d) => d.x)
    )
    .force(
      "y",
      d3.forceY((d) => d.y)
    )
    .force(
      "collide",
      d3
        .forceCollide()
        .radius((d) => (d.type === "tier1" || d.type === "tier2" ? d.radius * 2 : d.radius))
        .iterations(3)
    )
    .force("cluster", forceCluster().strength(0.45)) // cluster all nodes belonging to the same submodule.

  simulation.stop();

  // Create PIXI application
  const app = new PIXI.Application({
    width,
    height,
    resolution: 2,
    transparent: true,
    antialias: true,
    autoDensity: true,
    autoStart: true,
  });

  // Add the view to the DOM
  document.querySelector(containerSelector).appendChild(app.view);

  // create PIXI viewport
  const viewport = new Viewport({
    screenWidth: width,
    screenHeight: height,
    worldWidth: width,
    worldHeight: height,
    events: app.renderer.events,
  });
  // Enable interaction of the canvas
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  // Interactivity with the canvas itself
  const dragEnd = () => {
    app.stage.off("pointermove");
    viewport.pause = false;
  };
  app.stage.on("pointerup", dragEnd);
  app.stage.on("pointerupoutside", dragEnd);

  app.stage.addChild(viewport);

  // // Manual rendering
  // let renderRequestId = undefined;
  // const requestRender = () => {
  //   if (renderRequestId) {
  //     return;
  //   }
  //   renderRequestId = window.requestAnimationFrame(() => {
  //     app.render();
  //     renderRequestId = undefined;
  //   });
  // };

  viewport.drag().pinch().wheel().decelerate().clampZoom({ minScale: 0.2, maxScale: 5 });
  // To shift the graph to the middle of the screen, because d3 force simulation naturally renders graph with start position at (0,0)
  viewport.center = new PIXI.Point(0, 0);

  const circleGraphics = new PIXI.Graphics();
  circleGraphics.beginFill(nodeFill);
  circleGraphics.lineStyle(nodeStrokeWidth, nodeStroke, nodeStrokeOpacity);
  circleGraphics.drawCircle(0, 0, 44);
  const circleTexture = app.renderer.generateTexture(circleGraphics, {
    resolution: 2,
  });

  const triangle = new PIXI.Graphics();
  let triangleWidth = 12;
  triangle.beginFill(0xffffff, 1);
  triangle.lineStyle(0, 0xffffff, 1);
  triangle.moveTo(-triangleWidth, 0);
  triangle.lineTo(triangleWidth, triangleWidth);
  triangle.lineTo(triangleWidth, -triangleWidth);
  triangle.endFill();
  const triangleTexture = app.renderer.generateTexture(triangle, {
    resolution: 2,
  });

  const linksLayer = new PIXI.Container();
  viewport.addChild(linksLayer);
  const nodesLayer = new PIXI.Container();
  viewport.addChild(nodesLayer);
  const labelsLayer = new PIXI.Container();
  viewport.addChild(labelsLayer);

  // To store state/data of Pixi.JS graphics
  let nodeDataToNodeGfx = new WeakMap();
  let nodeGfxToNodeData = new WeakMap();
  let nodeDataToLabelGfx = new WeakMap();
  let labelGfxToNodeData = new WeakMap();
  let linkDataToLinkGfx = new WeakMap();
  let linkGfxToLinkData = new WeakMap();

  update(true);

  // Initialize a panel of buttons to configure initial graph state and handle future interaction with graph
  createButtons();

  /////////////////////// SIMULATION-RELATED FUNCTIONS /////////////////////////
  function update(initial) {
    // PRECAUTIONARY ACTION: REMOVE DUPLICATE LINKS
    const uniqueLinks = [];
    const uniqueLinksSet = new Set();
    for (let i = 0; i < showEle.links.length; i++) {
      let link = showEle.links[i];
      if (Object.keys(link).length === 0) continue;
      const linkStr = `${getSourceId(link)}-${getTargetId(link)}`;
      if (!uniqueLinksSet.has(linkStr) && getSourceId(link) !== getTargetId(link)) {
        uniqueLinksSet.add(linkStr);
        uniqueLinks.push(link);
      }
    }
    showEle.links = uniqueLinks;

    // Set up accessors to enable a cleaner way of accessing attributes of each node and edge
    const T = nodeTitle === undefined ? d3.map(showEle.nodes, (d) => d.NAME).map(intern) : d3.map(showEle.nodes, nodeTitle).map(intern);
    const G = nodeGroup == null ? null : d3.map(showEle.nodes, nodeGroup).map(intern);
    const W = typeof linkStrokeWidth !== "function" ? null : d3.map(showEle.links, linkStrokeWidth);
    const L = typeof linkStroke !== "function" ? null : d3.map(showEle.links, linkStroke);
    if (G && nodeGroups === undefined) nodeGroups = d3.sort(G);
    const color = nodeGroup == null ? null : d3.scaleOrdinal(nodeGroups, colors);

    for (let i = 0; i < showEle.nodes.length; i++) {
      let node = showEle.nodes[i];
      node.linkCnt = nodeDegrees[node.id] || 0;
      node.color = G ? color(G[i]) : nodeFill;
      node.radius = nodeRadiusScale(node.linkCnt);

      if (prevNodes.length > 0) {
        let centroid = prevNodes.find((n) => n.id === node.SUBMODULE + "_" + node.SEGMENT) || prevNodes.find((n) => n.id === node.SUBMODULE);
        if (centroid && !node.x && !node.y) {
          node.x = centroid.x;
          node.y = centroid.y;
        }
      }
    }

    for (let i = 0; i < showEle.links.length; i++) {
      let link = showEle.links[i];
      link.linkStroke = L ? L[i] : linkStroke;
      link.linkStrokeWidth = W ? W[i] : linkStrokeWidth;
    }
    console.log("elements on screen", showEle);
    // Stores graph in a Graphology object just for the shortest path and nearest neighbour calculations
    const graph = initGraphologyGraph(showEle.nodes, showEle.links);

    const updateVisibility = () => {
      // Purpose of culling is to only render 'in-screen' objects for performance optimization
      // const cull = new Cull();
      // cull.addAll(nodesLayer.children);
      // cull.addAll(labelsLayer.children);
      // cull.addAll(linksLayer.children);
      // cull.cull(app.renderer.screen);

      const zoom = viewport.scale.x;
      const zoomSteps = [1, 2, 3, Infinity];
      const zoomStep = zoomSteps.findIndex((zoomStep) => zoom <= zoomStep);

      for (let i = 0; i < showEle.nodes.length; i++) {
        const labelGfx = nodeDataToLabelGfx.get(showEle.nodes[i]);
        labelGfx.visible = showEle.nodes[i].type === "tier1" || showEle.nodes[i].type === "tier2" ? 1 : zoomStep >= 3;
      }
    };

    const moveNode = (nodeData, point) => {
      nodeData.fx = point.x;
      nodeData.fy = point.y;
      //simulation.alphaTarget(0.1).restart();
      updatePositions();
    };

    const dragNode = (nodeData) => {
      viewport.pause = true;
      app.stage.on("pointermove", function (event) {
        moveNode(nodeData, viewport.toWorld(event.global));
      });
    };

    const dblclickNode = (dd) => {
      console.log("double click on node");
      // No collapse/expand action taken if screen is at shortest path view or searched node view
      if (dd.type === "tier1" || (nodeCollapsedState[dd.SUBMODULE + "_" + dd.SEGMENT] === 1 && nodeCollapsedState[dd.SUBMODULE] === 0)) {
        console.log("expand");
        expandableAction(dd);
      } else {
        console.log("collapse");
        collapsibleAction(dd);
      }
    };

    /*
     * Create a map of node data and the node graphics.
     * - Create a node container to hold the grahics
     * - Create circle, border and text Sprites using the created texture
     * - Add the sprites to the container
     * - Add event listeners to the container to handle interactions
     */
    let nodeDataGfxPairs = [];
    for (let i = 0; i < allNodes.length; i++) {
      let nodeData = allNodes[i];
      let nodeGfx = nodeDataToNodeGfx.get(nodeData);
      let labelGfx = nodeDataToLabelGfx.get(nodeData);

      // If the node is collapsed into parent, remove it from the node and label group container
      if (showEle.nodes.findIndex((n) => n.id === nodeData.id) === -1) {
        if (nodeGfx) {
          nodesLayer.removeChild(nodeGfx);
        }
        if (labelGfx) {
          labelsLayer.removeChild(labelGfx);
        }
      } else {
        // If node is to be rendered, check if the container storing that node exists already. If not, create each node and label container.
        if (!nodeGfx) {
          nodeGfx = new PIXI.Container();
          nodeGfx.name = nodeData.id;
          nodeGfx.cursor = "pointer";
          nodeGfx.hitArea = new PIXI.Circle(0, 0, nodeData.radius + 2);
          nodeGfx.eventMode = "static";
          nodeGfx.visible = showNode(singleNodeIDs, nodeData.id) ? false : true;

          // Because the click event still gets triggered after mouse is released from a node drag (pointerup event), create 2 types of pointerdown events to prevent interference
          nodeGfx.on("pointerdown", function (event) {
            //if (searched) return;
            clickCount++;
            const node = nodeGfxToNodeData.get(event.currentTarget);
            if (clickCount === 1) {
              // Different types of click actions based on button activated
              if (showShortestPath) {
                timer = setTimeout(function () {
                  clickNodeForShortestPath(node, graph);
                  clickCount = 0;
                }, 300);
              } else if (showNeighbors) {
                timer = setTimeout(function () {
                  clickedNodes = [node]
                  clickNodeForNearestNeighbor(node, graph);
                  clickCount = 0;
                }, 300);
              } else {
                dragNode(node);
                // reset the clickCount if the time between first and second click exceeds 300ms.
                timer = setTimeout(function () {
                  clickCount = 0;
                }, 300);
              }
              // disable expand/collapse feature if either nearest neighbour or shortest path button is activated
            } else if (clickCount === 2 && !showShortestPath && !showNeighbors) {
              clearTimeout(timer);
              dblclickNode(node);
              clickCount = 0;
            }
          });
          nodeGfx.on("mouseover", (event) => updateTooltip(nodeGfxToNodeData.get(event.currentTarget)));
          nodeGfx.on("mouseout", () => tooltip.style("visibility", "hidden"));

          const circle = new PIXI.Sprite(circleTexture);
          circle.name = "CIRCLE";
          circle.x = -nodeData.radius;
          circle.y = -nodeData.radius;
          circle.tint = nodeData.color;
          circle.alpha = nodeFillOpacity;
          circle.width = nodeData.radius * 2;
          circle.height = nodeData.radius * 2;

          nodeGfx.addChild(circle);
          nodesLayer.addChild(nodeGfx);
        }

        if (!labelGfx) {
          labelGfx = new PIXI.Container();
          labelGfx.visible = nodeData.type === "tier1" || nodeData.type === "tier2" ? true : false;

          const textStyle = new PIXI.TextStyle({
            fontFamily: "Lato",
            fontSize: nodeData.radius * labelScale,
            align: "left",
            fill: labelColor,
            stroke: "black",
            strokeThickness: 6,
          });

          const label = new PIXI.Text(nodeData.NAME, textStyle);
          label.name = "LABEL";

          // position label to the right of node
          //label.x = nodeData.radius + 3;
          //label.y = -nodeData.radius * 1.05;

          // position label at the middle of node
          const textMetrics = PIXI.TextMetrics.measureText(nodeData.NAME, textStyle)
          label.x = -textMetrics.width/4
          label.y = 3

          // adjust node position on a per node basis
          //label.x = nodeData.type === "tier1" ? -textMetrics.width/4 : nodeData.radius + 3
          //label.y = nodeData.type === "tier1" ? -textMetrics.height/4 : -nodeData.radius * 1.05

          label.resolution = 2;
          label.scale.set(0.5);

          labelGfx.addChild(label);
          labelsLayer.addChild(labelGfx);
        }

        nodeDataGfxPairs.push([nodeData, nodeGfx, labelGfx]);
      }
    }

    /*
     * Create a map of link data and the link graphics.
     * - Create a link container to hold the grahics
     * - Create line Sprite and add it to the container
     */
    linksLayer.removeChildren();

    let linkDataGfxPairs = [];
    for (let i = 0; i < showEle.links.length; i++) {
      let linkData = showEle.links[i];
      const lineSize = linkData.linkStrokeWidth;
      const sourceNodeData = showEle.nodes.find((n) => n.id === getTargetId(linkData));

      const linkGfx = new PIXI.Container();
      linkGfx.name = getSourceId(linkData) + "-" + getTargetId(linkData);
      linkGfx.pivot.set(0, lineSize / 2);
      linkGfx.alpha = showEle.links.length > 200 ? 0.3 : linkStrokeOpacity;

      const line = new PIXI.Sprite(PIXI.Texture.WHITE);
      line.name = "LINE";
      line.x = sourceNodeData ? sourceNodeData.radius : 0;
      line.y = -lineSize / 2;
      line.height = lineSize;

      linkGfx.addChild(line);

      const arrow = new PIXI.Sprite(triangleTexture);
      arrow.name = "ARROW";
      arrow.x = sourceNodeData ? sourceNodeData.radius : 0;
      arrow.y = -3;
      arrow.width = 6;
      arrow.height = 6;
      arrow.alpha = showArrows ? 1 : 0;
      linkGfx.addChild(arrow);

      linksLayer.addChild(linkGfx);

      linkDataGfxPairs.push([linkData, linkGfx]);
    }

    // Create lookup tables
    nodeDataToNodeGfx = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [nodeData, nodeGfx]));
    nodeGfxToNodeData = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [nodeGfx, nodeData]));
    nodeDataToLabelGfx = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [nodeData, labelGfx]));
    labelGfxToNodeData = new WeakMap(nodeDataGfxPairs.map(([nodeData, nodeGfx, labelGfx]) => [labelGfx, nodeData]));
    linkDataToLinkGfx = new WeakMap(linkDataGfxPairs.map(([linkData, linkGfx]) => [linkData, linkGfx]));
    linkGfxToLinkData = new WeakMap(linkDataGfxPairs.map(([linkData, linkGfx]) => [linkGfx, linkData]));

    simulation.nodes(showEle.nodes).force("link").links(showEle.links);

    // Reheat the force layout only for the new graph state after collapse/expand, prevent unnecessary movment of elements on screen
    if (!initial) {
      console.log("reheat graph");
      // Note: don't set such a high charge as new nodes seem to get pushed far away from their original position
      // distanceMin is the minimum distance between nodes over which this force is considered. Helps to void an infinitely-strong force if two nodes are exactly coincident
    //  simulation.force(
     //   "charge",
    //    d3
    //      .forceManyBody()
    //      .strength(expandedAll ? -100 : -150)
    //      .distanceMin(100)
    //  );

      simulation.stop();
      simulation.nodes([]).force("link").links([]);

      simulation.nodes(showEle.nodes).force("link").links(showEle.links);
      simulation.alphaTarget(0.1).restart();
      simulation.tick(Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())));
    //  simulation
     //   .alphaTarget(0.2)
     //   .alphaDecay(expandedAll ? 0.5 : 0.3) // increase alphaDecay value to cool down a graph more quickly
     //   .restart();

      //simulation.on("tick", () => updatePositions());
      updatePositions();
    } else {
      console.log("run static graph layout");
      simulation.force("charge", d3.forceManyBody().strength(expandedAll ? -100 : -250));
      // Static force layout
      // Run the simulation to its end, then draw.
      simulation.alphaTarget(0.1).restart();

      simulation.tick(Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())));

      updatePositions();
    }

    prevNodes = showEle.nodes
    .filter((d) => d.type === "tier1" || d.type === "tier2")
    .map((node) => {
      return {
        x: node.x,
        y: node.y,
        id: node.type === "tier1" ? node.SUBMODULE : node.SUBMODULE + "_" + node.SEGMENT,
      };
    });

    viewport.on("zoomed-end", () => {
      if (viewport.dirty) {
        if (clickedSP || searched || clickedNN) return;
        updateVisibility();
        //requestRender();
        viewport.dirty = false;
      }
    });

    // app.view.addEventListener("wheel", (event) => {
    //   event.preventDefault();
    // });

    // Update tree based on new graph state
    VariableTree(showEle.nodes, THRESHOLD);

    // Update search box with searchable items
    updateSearch(showEle.nodes, showShortestPath, graph);

    // Restore the scroll position, prevents the Variable Tree from jumping to the top on click to expand/collapse
    // For the future? help to scroll Variable Tee to the submdule after expand or collapse
    document.querySelector(".viewport").scrollTo(0, scrollY);

    // Used to update graph based on tree interaction
    d3.selectAll(".list-label-2").on("click", function (event, d) {
      if (clickedSP || searched || clickedNN) return;
      event.preventDefault();
      event.stopPropagation();
      scrollY = document.querySelector(".viewport").scrollTop; // Save the current scroll position

      let dd = d.data;
      dd.SUBMODULE = +dd.id.split("-")[1].split("_")[0];
      dd.SEGMENT = +dd.id.split("-")[1].split("_")[1];

      if (d3.select(this).select(".arrow").text() !== "▼ ") {
        console.log("expand segment to variable nodes", dd.type);
        expandableAction(dd);
      } else {
        console.log("collapse variable nodes to segment");
        dd.type = "tier3";
        collapsibleAction(dd);
      }

      const childList = d3.select(d3.select(this).node().parentNode).select("ul");
      if (childList.size()) {
        const expanded = childList.style("display") !== "none";
        d3.select(this)
          .select(".arrow")
          .text(expanded ? "▶ " : "▼ ");
      }
    });

    d3.selectAll(".list-label-1").on("click", function (event, d) {
      if (clickedSP || searched || clickedNN) return;
      event.preventDefault();
      event.stopPropagation();
      scrollY = document.querySelector(".viewport").scrollTop; // Save the current scroll position

      let dd = d.data;
      dd.SUBMODULE = +dd.id.split("-")[1].split("_")[0];

      if (d3.select(this).select(".arrow").text() !== "▼ ") {
        console.log("expand submodule to segments", dd.type);
        expandableAction(dd);
      } else {
        console.log("collapse segments to submodules");
        dd.type = "tier2";
        collapsibleAction(dd);
      }

      const childList = d3.select(d3.select(this).node().parentNode).select("ul");
      if (childList.size()) {
        const expanded = childList.style("display") !== "none";
        d3.select(this)
          .select(".arrow")
          .text(expanded ? "▶ " : "▼ ");
      }
    });

    d3.selectAll(".list-label-3 input").on("change", function (event, d) {
      event.preventDefault();
      event.stopPropagation();
      const checkedNodes = checkboxValues(d3.select("#view"));
      console.log("checkbox click", checkedNodes);
      if (checkedNodes.length === 0) return reset();

      // Clicking on checkboxes only show nearest neigbours of the checked nodes if corresponding button is activated
      // Checkboxes can be clicked one after the other, the highlighted connections simply accumulates on screen
      let connectedNodes = [];
      if (showNeighbors) {
        connectedNodes = findNeighbours(graph, checkedNodes, DEGREE);
      }
      // Clicking on checkboxes only show shortest path between two checked nodes if corresponding button is activated
      if (showShortestPath) {
        clickedNodesFeedback(checkedNodes);
        connectedNodes = findShortestPath(graph, checkedNodes);
        // Disable further clicking of checkboxes if two nodes have already been clicked. Reset graph to enable click again.
        if (checkedNodes.length === 2) {
          clickedSP = true;
          document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => (checkbox.disabled = true));
        }
      }
      // Clicking on a checkbox conducts a node search, similar to searchbox query
      // Nodes can be searched one after the other, the viewport zoom moves to the next node
      if (!showNeighbors && !showShortestPath) {
        const nodeName = checkedNodes[checkedNodes.length - 1];

        const node = showEle.nodes.find((n) => n.NAME === nodeName);
        zoomToNode(node);
        highlightNode(node.NAME);
      }
      if (connectedNodes && connectedNodes.length > 0) {
        highlightConnections(connectedNodes);
      }
    });

    // Update coordinates of all PIXI elements on screen based on force simulation calculations
    function updatePositions() {

      for (let i = 0; i < showEle.nodes.length; i++) {
        let node = showEle.nodes[i];
        const nodeGfx = nodeDataToNodeGfx.get(node);
        const labelGfx = nodeDataToLabelGfx.get(node);

        nodeGfx.x = node.x;
        nodeGfx.y = node.y;
        labelGfx.x = node.x;
        labelGfx.y = node.y;
      }

      for (let i = 0; i < showEle.links.length; i++) {
        let link = showEle.links[i];
        const sourceNodeData = showEle.nodes.find((n) => n.id === getTargetId(link));
        const targetNodeData = showEle.nodes.find((n) => n.id === getSourceId(link));
        const linkGfx = linkDataToLinkGfx.get(link);

        linkGfx.x = sourceNodeData.x;
        linkGfx.y = sourceNodeData.y;
        linkGfx.rotation = Math.atan2(targetNodeData.y - sourceNodeData.y, targetNodeData.x - sourceNodeData.x);

        const line = linkGfx.getChildByName("LINE");
        const lineLength = Math.max(Math.sqrt((targetNodeData.x - sourceNodeData.x) ** 2 + (targetNodeData.y - sourceNodeData.y) ** 2) - sourceNodeData.radius - targetNodeData.radius, 0);
        line.width = lineLength;
      }
      //requestRender();
    }
  }

  function centroid(nodes) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const d of nodes) {
      let k = nodeRadiusScale(d.linkCnt) ** 2;
      x += d.x * k;
      y += d.y * k;
      z += k;
    }
    return { x: x / z, y: y / z };
  }

  function forceCluster() {
    var strength = 0.8;
    let nodes;
    function force(alpha) {
      const centroids = d3.rollup(nodes, centroid, nodeGroup);
      const l = alpha * strength;
      for (const d of nodes) {
        //if (d.type !== "tier1" && d.type !== "tier2") {
        const { x: cx, y: cy } = centroids.get(d.SUBMODULE);
        d.vx -= (d.x - cx) * l;
        d.vy -= (d.y - cy) * l;
        //}
      }
    }
    force.initialize = (_) => (nodes = _);
    force.strength = function (_) {
      return arguments.length ? ((strength = +_), force) : strength;
    };
    return force;
  }
  //////////////////////////////////////////////////////////////////////////////

  /////////////////////// INTERACTION-RELATED FUNCTIONS ////////////////////////
  function clickNodeForShortestPath(dd, graph)  {
    if (clickedNodes.length < 2) {
      if (clickedNodes.indexOf(dd.id) === -1) {
        // if the same node is not already clicked, add to array
        clickedNodes.push(dd.id);
      } else {
        clickedNodes.splice(dd.id, 1); // remove a clicked node if the same node is clicked again
      }
    }
    clickedNodesFeedback(clickedNodes); // render clicked node(s) name on screen to let the user know they have engaged with the circle
    // Only proceed with finding shortest path between 2 different clicked nodes
    if (clickedNodes.length === 2) {
      const connectedNodes = findShortestPath(graph, clickedNodes);
      clickedSP = true; // Flag to prevent any action that should not happen during shortest path view
      if (connectedNodes) {
        console.log("highlight connections");
        // Only proceed with showing the nodes and paths that constitute the shortest path if it exist
        highlightConnections(connectedNodes);
      } else {
        // Provide feedback to user that no shortest path exist between the 2 nodes
        d3.select(".shortestPath-status").html("No shortest path found. Would you like to try again?");
      }
      // disable tree interaction to prevent interference with current shortest path view
      document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => (checkbox.disabled = true));
    }
  };

  function clickNodeForNearestNeighbor(dd, graph) {
    updateTooltip(dd); // show tooltip on mouseover any node

    const connectedNodes = findNeighbours(graph, [dd], DEGREE);
    highlightConnections(connectedNodes);
    message.style("visibility", "visible"); // Show RESET message
    clickedNN = true;
  };

  // This function is used to filter input data before initial graph render.
  function filterElements(nodes, links, expandedAll, criteria, value, type) {
    let nodesShow = nodes.filter((d) => d[criteria] > value);

    if (expandedAll) {
      nodesShow = nodesShow.filter((d) => d.type !== "tier1" && d.type !== "tier2");
    }

    const showNodesIDs = nodesShow.map((d) => d.id);
    const linksShow = links.filter((d) => showLink(showNodesIDs, d));

    // only render the submodule and segment nodes initially if expandedAll=false
    if (expandedAll === false) {
      const nodesFiltered = nodesShow.filter((d) => type === 'Quilt' ? d.type === "tier1" : d.type === "tier2");
      const linksFiltered = []

      // find connections between the segment nodes
      linksShow.forEach((d) => {
        if(type === 'Quilt') {
          const linksIDs = linksFiltered.map((link) => link.sourceSubmodule + "_" + link.targetSubmodule);
          const id = d.sourceSubmodule + "_" + d.targetSubmodule;
          if (linksIDs.indexOf(id) === -1 && d.sourceSubmodule !== null && d.targetSubmodule !== null) {
            linksFiltered.push({
              source: "submodule-" + d.sourceSubmodule,
              target: "submodule-" + d.targetSubmodule,
              sourceSegment: d.sourceSubmodule,
              targetSegment: d.targetSubmodule,
              sourceSubmodule: d.sourceSubmodule,
              targetSubmodule: d.targetSubmodule,
              type: "tier1",
            });
          }  
        } else {
          const linksIDs = linksFiltered.map((link) => link.sourceSubmodule + "_" + link.sourceSegment + "_" + link.targetSubmodule + "_" + link.targetSegment);
          const id = d.sourceSubmodule + "_" + d.sourceSegment + "_" + d.targetSubmodule + "_" + d.targetSegment;
          if (linksIDs.indexOf(id) === -1 && d.sourceSubmodule !== null && d.sourceSegment !== null && d.targetSubmodule !== null && d.targetSegment !== null) {
            linksFiltered.push({
              source: "segment-" + d.sourceSubmodule + "_" + d.sourceSegment,
              target: "segment-" + d.targetSubmodule + "_" + d.targetSegment,
              sourceSegment: d.sourceSegment,
              targetSegment: d.targetSegment,
              sourceSubmodule: d.sourceSubmodule,
              targetSubmodule: d.targetSubmodule,
              type: "tier2",
            });
          }
        }      
      });

      return { nodes: nodesFiltered, links: linksFiltered };
    }

    return { nodes: nodesShow, links: linksShow };
  }

  // Variable or segment nodes that are children of the same submodule and submodule-segment pair (including the clicked node), will be called VARSEG nodes from now on.
  function collapsibleAction(d) {
    if (d.type === "tier1") return; // submodule nodes can no longer be collapsed further

    // dblclick on a segment node to collapse ALL segment nodes into their submodule (parent node)
    if (d.type === "tier2") {
      const sub_ID = "submodule-" + d["SUBMODULE"];

      // Remove the clicked segment node
      showEle.nodes = showEle.nodes.filter((node) => node.SUBMODULE !== d["SUBMODULE"]);

      // Remove any links of the same submodule as clicked segment node
      showEle.links = showEle.links.filter((link) => link.source.SUBMODULE !== d["SUBMODULE"] && link.target.SUBMODULE !== d["SUBMODULE"]);

      // Add the submodule node
      const submoduleNode = SUBMODULES.find((n) => n.id === sub_ID);
      showEle.nodes.push(submoduleNode);

      // Add links from a submodule to either variables/segments/submodules
      addLinksBwSubmoduleAndOthers(d);

      nodeCollapsedState[d["SUBMODULE"]] = 0;
    }

    // dblclick on a VARSEG node to collapse ALL variables into their segment (parent node)
    if (d.type === "tier3") {
      const nodesToRemove = origNodes.filter((node) => node["SUBMODULE"] === d["SUBMODULE"] && node["SEGMENT"] === d["SEGMENT"]).map((node) => node.id);

      // Links involving VARSEG nodes (remove them all first and add new links later on). This only contain links between variables.
      const nodeIDs = showEle.nodes.map((node) => node.id);
      let linksToRemove = [];
      showEle.links.forEach((link) => {
        if (nodesToRemove.indexOf(getSourceId(link)) !== -1) {
          linksToRemove.push(link);
        }
        if (nodesToRemove.indexOf(getTargetId(link)) !== -1) {
          linksToRemove.push(link);
        }
        if (nodeIDs.indexOf(getSourceId(link)) === -1) {
          linksToRemove.push(link);
        }
        if (nodeIDs.indexOf(getTargetId(link)) === -1) {
          linksToRemove.push(link);
        }
      });

      showEle.nodes = showEle.nodes.filter((node) => nodesToRemove.indexOf(node.id) === -1);
      showEle.links = showEle.links.filter((link) => linksToRemove.indexOf(link) === -1);

      // Links between VARSEG nodes and other same/diff colored nodes
      const linksFromSegmentToOther = origLinks.filter((link) => link.sourceSubmodule === d["SUBMODULE"] && link.sourceSegment === d["SEGMENT"]);
      const linksFromOtherToSegment = origLinks.filter((link) => link.targetSubmodule === d["SUBMODULE"] && link.targetSegment === d["SEGMENT"]);

      const sub_seg_ID = "segment-" + d.SUBMODULE + "_" + d.SEGMENT;

      // Add the segment node
      const segmentNode = SEGMENTS.find((n) => n.id === sub_seg_ID);
      showEle.nodes.push(segmentNode);

      // As source nodes may be expanded/collapsed we have to check before adding the link
      linksFromOtherToSegment.forEach((link) => {
        const src_sub_seg_ID = "segment-" + link.sourceSubmodule + "_" + link.sourceSegment;
        const src_sub_ID = "submodule-" + link.sourceSubmodule;
        const src_ID = getSourceId(link);

        let newLink = {};
        // Source node is a variable (Note: this can be of the same/diff color)
        if (showEle.nodes.findIndex((n) => n.id === src_ID) !== -1) {
          newLink = {
            source: src_ID,
            target: sub_seg_ID,
          };
          // If variable source node from same/diff submodule doesn't exist on screen, change the link to that of between a source segment and target segment
        } else if (showEle.nodes.findIndex((n) => n.id === src_sub_seg_ID) !== -1) {
          newLink = {
            source: src_sub_seg_ID,
            target: sub_seg_ID,
          };
          // If ths segment source node doesn't exist on screen, change the link to that of between a source submodule and target segment
        } else if (showEle.nodes.findIndex((n) => n.id === src_sub_ID) !== -1) {
          newLink = {
            source: src_sub_ID,
            target: sub_seg_ID,
          };
        }
        showEle.links.push(newLink);
      });

      // As target nodes may be expanded/collapsed we have to check before adding the link
      linksFromSegmentToOther.forEach((link) => {
        const target_sub_seg_ID = "segment-" + link.targetSubmodule + "_" + link.targetSegment;
        const target_sub_ID = "submodule-" + link.targetSubmodule;
        const target_ID = getTargetId(link);

        let newLink = {};
        if (showEle.nodes.findIndex((n) => n.id === target_ID) !== -1) {
          newLink = {
            source: sub_seg_ID,
            target: target_ID,
          };
        } else if (showEle.nodes.findIndex((n) => n.id === target_sub_seg_ID) !== -1) {
          newLink = {
            source: sub_seg_ID,
            target: target_sub_seg_ID,
          };
        } else if (showEle.nodes.findIndex((n) => n.id === target_sub_ID) !== -1) {
          newLink = {
            source: sub_seg_ID,
            target: target_sub_ID,
          };
        }
        showEle.links.push(newLink);
      });
      nodeCollapsedState[d["SUBMODULE"] + "_" + d["SEGMENT"]] = 1; // flag to indicate that segment node is in collapsed state
      nodeCollapsedState[d["SUBMODULE"]] = 1;
    }

    updateURL(showEle.nodes.map((node) => node.NAME).join("-"));
    update(); // re-render graph with updated array of nodes and links
  }

  function addLinksBwSubmoduleAndOthers(d) {
    const sub_ID = "submodule-" + d["SUBMODULE"];

    // Links between submodule and other same/diff colored nodes
    const linksFromSubmoduleToOther = origLinks.filter((link) => link.sourceSubmodule === d["SUBMODULE"]);
    const linksFromOtherToSubmodule = origLinks.filter((link) => link.targetSubmodule === d["SUBMODULE"]);

    // As source nodes may be expanded/collapsed we have to check before adding the link
    linksFromOtherToSubmodule.forEach((link) => {
      const src_sub_seg_ID = "segment-" + link.sourceSubmodule + "_" + link.sourceSegment;
      const src_sub_ID = "submodule-" + link.sourceSubmodule;
      const src_ID = getSourceId(link);

      let newLink = {};
      // Source node is a variable (Note: this can be of the same/diff color)
      if (showEle.nodes.findIndex((n) => n.id === src_ID) !== -1) {
        newLink = {
          source: src_ID,
          target: sub_ID,
        };
        // If variable source node from same/diff submodule doesn't exist on screen, change the link to that of between a segment source and submodule
      } else if (showEle.nodes.findIndex((n) => n.id === src_sub_seg_ID) !== -1) {
        newLink = {
          source: src_sub_seg_ID,
          target: sub_ID,
        };
        // If segment source node doesn't exist on screen, change the link to that of between a submodule source and submodule
      } else if (showEle.nodes.findIndex((n) => n.id === src_sub_ID) !== -1) {
        newLink = {
          source: src_sub_ID,
          target: sub_ID,
        };
      }
      showEle.links.push(newLink);
    });

    linksFromSubmoduleToOther.forEach((link) => {
      const target_sub_seg_ID = "segment-" + link.targetSubmodule + "_" + link.targetSegment;
      const target_sub_ID = "submodule-" + link.targetSubmodule;
      const target_ID = getTargetId(link);

      let newLink = {};
      if (showEle.nodes.findIndex((n) => n.id === target_ID) !== -1) {
        newLink = {
          source: sub_ID,
          target: target_ID,
        };
      } else if (showEle.nodes.findIndex((n) => n.id === target_sub_seg_ID) !== -1) {
        newLink = {
          source: sub_ID,
          target: target_sub_seg_ID,
        };
      } else if (showEle.nodes.findIndex((n) => n.id === target_sub_ID) !== -1) {
        newLink = {
          source: sub_ID,
          target: target_sub_ID,
        };
      }
      showEle.links.push(newLink);
    });
  }

  function expandableAction(d) {
    if (d.type === "tier3") return; // variables can no longer be expanded further

    // dblclick on SUBMODULE node to expand into it's segment nodes
    if (d.type === "tier1") {
      nodeCollapsedState[d["SUBMODULE"]] = 0; // flag to indicate that submodule node is no longer in collapsed state

      // Only segment nodes of submodule is added to screen
      const nodesToAdd = SEGMENTS.filter((node) => node.SUBMODULE === d["SUBMODULE"]);
      nodesToAdd.forEach((node) => {
        nodeCollapsedState[node["SUBMODULE"] + "_" + node["SEGMENT"]] = 1;
      });
      showEle.nodes = showEle.nodes.concat(nodesToAdd);

      // Remove the submodule node
      showEle.nodes = showEle.nodes.filter((node) => node.id !== "submodule-" + d["SUBMODULE"]);

      // Remove the links connected to the submodule
      showEle.links = showEle.links.filter((link) => getSourceId(link) !== "submodule-" + d["SUBMODULE"] && getTargetId(link) !== "submodule-" + d["SUBMODULE"]);

      // Add links from expanded segments to either variables/segments/submodules
      addLinksBwSegmentAndOthers(d);
    }

    // dblclick on a SEGMENT node to expand into it's variable nodes
    if (d.type === "tier2") {
      const nodeId = d.id; // clicked node

      nodeCollapsedState[d["SUBMODULE"] + "_" + d["SEGMENT"]] = 0; // flag to indicate that segment node is no longer in collapsed state

      // Remove the segment node and submodule node
      showEle.nodes = showEle.nodes.filter((node) => node.id !== nodeId && node.id !== "submodule-" + d["SUBMODULE"]);

      // Remove any links where the clicked node is a source/target node, because new links will be drawn from each VARSEG node to their respective source/target node.
      showEle.links = showEle.links.filter((link) => getSourceId(link) !== nodeId && getTargetId(link) !== nodeId);

      // Variable nodes that are children of the same submodule and segment pair
      const nodesToAdd = origNodes.filter((node) => node["SUBMODULE"] === d["SUBMODULE"] && node["SEGMENT"] === d["SEGMENT"] && node.type !== "tier1" && node.type !== "tier2");

      // Links between VARSEG nodes
      const linksFromVarToVarSameMod = origLinks.filter((link) => link.sourceSubmodule === d["SUBMODULE"] && link.targetSubmodule === d["SUBMODULE"] && link.targetSegment === d["SEGMENT"] && link.sourceSegment === d["SEGMENT"]);
      const linksToAdd = linksFromVarToVarSameMod; // these links can be safely added to the links array becasue the VARSEG nodes will be rendered on screen

      showEle.nodes = showEle.nodes.concat(nodesToAdd);
      showEle.links = showEle.links.concat(linksToAdd);

      // Add links from expanded variables to either variables/segments/submodules
      addLinksBwVarAndOthers(d);

      // Remove link between submodule and segment nodes
      //const lastSubmoduleSegmentLink = showEle.links.filter(link => link.source.id === d['SUBMODULE'] && link.target.id === nodeId).length
      //if(lastSubmoduleSegmentLink === 1) showEle.nodes = showEle.nodes.filter(node => node.id !== d['SUBMODULE'])
    }

    updateURL(showEle.nodes.map((node) => node.NAME).join("-"));
    update(); // re-render graph with updated array of nodes and links
  }

  function addLinksBwSegmentAndOthers(d) {
    // Links from segments to segments/variables in a different submodule
    const linksFromSegmentToOther = origLinks.filter((link) => link.sourceSubmodule === d["SUBMODULE"] && link.targetSubmodule !== d["SUBMODULE"]);
    const linksFromOtherToSegment = origLinks.filter((link) => link.targetSubmodule === d["SUBMODULE"] && link.sourceSubmodule !== d["SUBMODULE"]);

    // Links from segments to segments in the same submodule
    const linksFromSegToSegSameMod = origLinks.filter((link) => link.targetSubmodule === d["SUBMODULE"] && link.sourceSubmodule === d["SUBMODULE"]);

    linksFromSegToSegSameMod.forEach((link) => {
      showEle.links.push({
        source: "segment-" + d["SUBMODULE"] + "_" + link.sourceSegment,
        target: "segment-" + d["SUBMODULE"] + "_" + link.targetSegment,
      });
    }); // this will create duplicate links but they will be dealt with later

    // Since other nodes may or may not be collapsed, linksFromSegmentToOther cannot be simply concatenated to array of existing links
    linksFromSegmentToOther.forEach((link) => {
      const segmentID = "segment-" + d["SUBMODULE"] + "_" + link.sourceSegment;
      const target_sub_seg_ID = "segment-" + link.targetSubmodule + "_" + link.targetSegment;
      const target_sub_ID = "submodule-" + link.targetSubmodule;
      const target_ID = getTargetId(link);

      let newLink = {};
      // Check if segment node of the target of VARSEG nodes exists on screen already
      if (showEle.nodes.findIndex((n) => n.id === target_sub_seg_ID) !== -1) {
        // create a link between VARSEG node and segment node from another module
        newLink = {
          source: segmentID,
          target: target_sub_seg_ID,
        };
        // If segment node doesn't exist, maybe it has been collapsed to the submodule level.
        // Check if submodule node of the target of VARSEG nodes exists on screen already. At the submodule level, no variables can exist. Hence we won't be repeating links.
      } else if (showEle.nodes.findIndex((n) => n.id === target_sub_ID) !== -1) {
        // create a link between VARSEG node and submodule node from another module
        newLink = {
          source: segmentID,
          target: target_sub_ID,
        };
      } else if (showEle.nodes.findIndex((n) => n.id === target_ID) !== -1) {
        // create a link between VARSEG node and variable node from another module
        newLink = {
          source: segmentID,
          target: target_ID,
        };
      }
      showEle.links.push(newLink);
    });

    // Since other nodes may or may not be collapsed, linksFromOtherToSegment cannot be simply concatenated to array of existing links
    linksFromOtherToSegment.forEach((link) => {
      const segmentID = "segment-" + d["SUBMODULE"] + "_" + link.targetSegment;
      const src_sub_seg_ID = "segment-" + link.sourceSubmodule + "_" + link.sourceSegment;
      const src_sub_ID = "submodule-" + link.sourceSubmodule;
      const src_ID = getSourceId(link);

      let newLink = {};
      if (showEle.nodes.findIndex((n) => n.id === src_sub_seg_ID) !== -1) {
        newLink = {
          source: src_sub_seg_ID,
          target: segmentID,
        };
      } else if (showEle.nodes.findIndex((n) => n.id === src_sub_ID) !== -1) {
        newLink = {
          source: src_sub_ID,
          target: segmentID,
        };
      } else if (showEle.nodes.findIndex((n) => n.id === src_ID) !== -1) {
        newLink = {
          source: src_ID,
          target: segmentID,
        };
      }
      showEle.links.push(newLink);
    });
  }

  function addLinksBwVarAndOthers(d) {
    // Links between VARSEG nodes and other same/diff colored nodes
    const linksFromVarToOther = origLinks.filter((link) => link.sourceSubmodule === d["SUBMODULE"] && link.sourceSegment === d["SEGMENT"]);
    const linksFromOtherToVar = origLinks.filter((link) => link.targetSubmodule === d["SUBMODULE"] && link.targetSegment === d["SEGMENT"]);

    // Since other nodes may or may not be collapsed, linksFromVarToOther cannot be simply concatenated to array of existing links
    linksFromVarToOther.forEach((link) => {
      const src_ID = getSourceId(link);
      const target_sub_seg_ID = "segment-" + link.targetSubmodule + "_" + link.targetSegment;
      const target_sub_ID = "submodule-" + link.targetSubmodule;
      const target_ID = getTargetId(link);

      let newLink = {};
      // Check if segment node of the target of VARSEG nodes exists on screen already
      if (showEle.nodes.findIndex((n) => n.id === target_sub_seg_ID) !== -1) {
        // create a link between VARSEG node and other segment node
        newLink = {
          source: src_ID,
          target: target_sub_seg_ID,
        };
        // If segment node doesn't exist, maybe it has been collapsed to the submodule level.
        // Check if submodule node of the target of VARSEG nodes exists on screen already. At the submodule level, no variables can exist. Hence we won't be repeating links.
      } else if (showEle.nodes.findIndex((n) => n.id === target_sub_ID) !== -1) {
        // create a link between VARSEG node and other submodule node
        newLink = {
          source: src_ID,
          target: target_sub_ID,
        };
        // If segment and submodule node doesn't exist, that means the connection is between a VARSEG node and a variable of another color.
      } else if (showEle.nodes.findIndex((n) => n.id === src_ID) !== -1 && showEle.nodes.findIndex((n) => n.id === target_ID) !== -1) {
        newLink = link;
      }
      showEle.links.push(newLink);
    });

    // Since other nodes may or may not be collapsed, linksFromOtherToVar cannot be simply concatenated to array of existing links
    linksFromOtherToVar.forEach((link) => {
      const target_ID = getTargetId(link);
      const src_sub_seg_ID = "segment-" + link.sourceSubmodule + "_" + link.sourceSegment;
      const src_sub_ID = "submodule-" + link.sourceSubmodule;
      const src_ID = getSourceId(link);

      let newLink = {};
      if (showEle.nodes.findIndex((n) => n.id === src_sub_seg_ID) !== -1) {
        newLink = {
          source: src_sub_seg_ID,
          target: target_ID,
        };
      } else if (showEle.nodes.findIndex((n) => n.id == src_sub_ID) !== -1) {
        newLink = {
          source: src_sub_ID,
          target: target_ID,
        };
      } else if (showEle.nodes.findIndex((n) => n.id === src_ID) !== -1 && showEle.nodes.findIndex((n) => n.id === target_ID) !== -1) {
        newLink = link;
      }
      showEle.links.push(newLink);
    });
  }

  function highlightConnections(connectedNodes) {
    showEle.nodes.forEach((node) => {
      const nodeGfx = nodeDataToNodeGfx.get(node);
      nodeGfx.visible = showNode(connectedNodes, node.id) ? true : false;
      const labelGfx = nodeDataToLabelGfx.get(node);
      labelGfx.visible = showNode(connectedNodes, node.id) ? true : false;
    });

    showEle.links.forEach((link) => {
      const linkGfx = linkDataToLinkGfx.get(link);
      linkGfx.alpha = showLink(connectedNodes, link) ? 0.7 : 0;
    });

    //requestRender();
    updateURL(connectedNodes.map((node) => node).join("-"));
  }

  function highlightNode(dd) {
    showEle.nodes.forEach((node) => {
      const nodeGfx = nodeDataToNodeGfx.get(node);
      nodeGfx.visible = true;
      nodeGfx.alpha = node.NAME === dd ? 1 : 0.2;
      const labelGfx = nodeDataToLabelGfx.get(node);
      labelGfx.visible = node.NAME === dd ? true : false;
    });

    showEle.links.forEach((link) => {
      const linkGfx = linkDataToLinkGfx.get(link);
      linkGfx.alpha = 0.1;
    });

    //requestRender();
  }

  function clickedNodesFeedback(clickedNodes) {
    // Track which nodes have been clicked and render their names on screen
    // Note: NAME may not be unique, so track using ID instead, then extract the NAME
    const node1 = showEle.nodes.find((n) => n.id === clickedNodes[0]);
    const node2 = showEle.nodes.find((n) => n.id === clickedNodes[1]);

    if (clickedNodes[0]) d3.select(".clickedNodes-1").html("Start node: " + (node1 ? node1.NAME : ""));

    if (clickedNodes[1]) d3.select(".clickedNodes-2").html("End node: " + (node2 ? node2.NAME : ""));

    if (clickedNodes.length > 0) {
      d3.select(".message").style("visibility", "visible");
    }
  }

  function reset() {
    // Un-highlight all elements
    showEle.nodes.forEach((node) => {
      const nodeGfx = nodeDataToNodeGfx.get(node);
      nodeGfx.alpha = 1;
      nodeGfx.visible = showNode(singleNodeIDs, node.id) ? false : true;
      const labelGfx = nodeDataToLabelGfx.get(node);
      labelGfx.visible = node.type === "tier1" || node.type === "tier2" ? true : false;
    });

    showEle.links.forEach((link) => {
      const linkGfx = linkDataToLinkGfx.get(link);
      linkGfx.alpha = showEle.links.length > 200 ? 0.3 : linkStrokeOpacity;
    });

    if (searched) {
      viewport.animate({
        position: new PIXI.Point(0, 0),
        scaleX: 1,
        scaleY: 1,
        time: 1000,
      });
      document.getElementById("search-input").value = "";
      document.getElementById("suggestions-container").innerHTML = "";
      document.getElementById("reset-search").style.display = "none";
      message.select(".shortestPath-status").html("");
      searched = false;
    }
    // Undo clicked states
    clickedNN = false;
    clickedSP = false;
    clickedNodes = [];
    message.select(".clickedNodes-1").html("");
    message.select(".clickedNodes-2").html("");
    message.select(".shortestPath-status").html("");
    message.style("visibility", "hidden");

    tooltip.style("visibility", "hidden").attr("pointer-events","none");

    document.querySelectorAll('input[type="checkbox"]').forEach((e) => (e.checked = false)); // uncheck all the checkboxes from tree
    document.querySelectorAll('input[type="checkbox"]').forEach((e) => (e.disabled = false)); // activate all the checkboxes from tree (ie. checkboxes are clickable again)
    //requestRender();
  }

  // Function to zoom to a specific node
  function zoomToNode(node) {
    viewport.animate({
      position: new PIXI.Point(node.x, node.y),
      scaleX: 2,
      scaleY: 2,
      time: 800,
    });
    searched = true;
  }

  // Function to update tooltip content inside a DIV
  function updateTooltip(d) {
    let content = [];
    content.push(`<div><h3 style='text-align: center'>${d.NAME}</h3></div>`); // tooltip title
    // for (const [key, value] of Object.entries(d)) {
    //   // iterate over each attribute object and render
    //   if (key === "fx" || key === "fy" || key === "vx" || key === "vy" || key === "x" || key === "y" || key === "index" || key === "type") break;
    //   content.push(`<div><b>${key}: </b><span>${value}</span></div>`);
    // }
    const datum = allNodes.find(node => node.NAME === d.NAME)
    TOOLTIP_KEYS.forEach(key => {
      content.push(`<div><b>${key}: </b><span>${datum[key]}</span></div>`);
    })

    let contentStr = "";
    content.map((d) => (contentStr += d));

    tooltip
      .html(`${contentStr}`)
      //.style('top', event.y - 300+ 'px')
      //.style('left', event.x - 100 + 'px')
      .style("top", 150 + "px") // adjust starting point of tooltip div to minimise chance of overlap with node
      .style("left", 5 + "px")
      .style("visibility", "visible");
  }
  //////////////////////////////////////////////////////////////////////////////

  //////////////////////////// BUTTON-RELATED FUNCTIONS ////////////////////////
  function createButtons() {
    // Function to create a button element with a specified label and action
    function createButton(label, action, index) {
      const button = document.createElement("button");
      button.textContent = label;
      if(index !== 6) {
        button.classList.add("button");
      } else {
        button.classList.add("button1");
      }
      button.addEventListener("click", action);
      return button;
    }

    // Function to perform an action when a button is clicked
    function buttonClickHandler(event) {
      const buttonId = event.target.getAttribute("data-button-id");

      // Check which button was clicked using its ID
      switch (buttonId) {
        case "button1": // SHOW DIRECTION
          showArrows = !showArrows;
          if (showArrows) {
            event.target.classList.add("clicked");
            showEle.links.forEach((link) => {
              const linkGfx = linkDataToLinkGfx.get(link);
              linkGfx.getChildByName("ARROW").alpha = 1;
            });
          } else {
            event.target.classList.remove("clicked");
            showEle.links.forEach((link) => {
              const linkGfx = linkDataToLinkGfx.get(link);
              linkGfx.getChildByName("ARROW").alpha = 0;
            });
          }
          //requestRender();
          break;
        case "button2": // SHOW SHORTEST PATH
          //if (searched) return; // disable action if screen is at searched node view
          showShortestPath = !showShortestPath;
          if (showShortestPath) {
            event.target.classList.add("clicked");
          } else {
            event.target.classList.remove("clicked");
            reset();
          }
          showNeighbors = false;
          clickedNN = false;
          document.querySelector('.button[data-button-id="button3"]').classList.remove("clicked");
          const graph = initGraphologyGraph(showEle.nodes, showEle.links);
          updateSearch(showEle.nodes, showShortestPath, graph)
          break;
        case "button3": // SHOW NEAREST NEIGHBOUR
          //if (clickedSP || searched) return; // disable action if screen is at shortest path view / searched node view
          if (clickedSP) return; 
          showNeighbors = !showNeighbors;
          if (showNeighbors) {
            event.target.classList.add("clicked");
          } else {
            event.target.classList.remove("clicked");
            reset();
          }
          showShortestPath = false;
          document.querySelector('.button[data-button-id="button2"]').classList.remove("clicked");
          break;
        case "button4": // EXPANDED GRAPH
          if (clickedSP || searched || clickedNN) return; // disable action if screen is at shortest path view / searched node view / nearest neighbor view
          expandedAll = !expandedAll;
          nodeCollapsedState = {};
          SUBMODULES.map((d) => {
            nodeCollapsedState[d.SUBMODULE] = expandedAll ? 1 : 0;
          });
          SEGMENTS.map((d) => {
            nodeCollapsedState[d.SUBMODULE + "_" + d.SEGMENT] = expandedAll ? 0 : 1;
          });
          if (expandedAll) {
            event.target.classList.add("clicked");
            showEle = filterElements(nodes, links, true, "SUBMODULE", THRESHOLD);
            update(true);
          } else {
            event.target.classList.remove("clicked");
            showEle = filterElements(nodes.concat(SEGMENTS), links, false, "SUBMODULE", THRESHOLD);
            update(true);
          }
          break;
        case "button5": // HIDE SINGLE NODES
          if (clickedSP || searched || clickedNN) return; // disable action if screen is at shortest path view / searched node view  / nearest neighbor view
          // Some nodes have links where the source and target is the node itself. These nodes are still considered as single nodes and hidden.
          showSingleNodes = !showSingleNodes;
          if (!showSingleNodes) {
            event.target.classList.add("clicked");
            // Find nodes without any connections
            const graph = initGraphologyGraph(showEle.nodes, showEle.links);
            singleNodeIDs = showEle.nodes.filter((n) => graph.degreeWithoutSelfLoops(n.id) === 0).map((d) => d.id);
            // Hide the opacity of these single nodes
            showEle.nodes.forEach((node) => {
              const nodeGfx = nodeDataToNodeGfx.get(node);
              nodeGfx.visible = showNode(singleNodeIDs, node.id) ? false : true;
            });
          } else {
            event.target.classList.remove("clicked");
            showEle.nodes.forEach((node) => {
              const nodeGfx = nodeDataToNodeGfx.get(node);
              nodeGfx.visible = true;
            });
            singleNodeIDs = [];
            //requestRender();
          }
          break;
        case "button6": // RESET
          reset();
          // Unhighlight all buttons
          const buttons = document.querySelectorAll("button");
          buttons.forEach(function (item, index) {
            if (index !== 3) item.classList.remove("clicked");
          });
          showEle.links.forEach((link) => {
            const linkGfx = linkDataToLinkGfx.get(link);
            linkGfx.getChildByName("ARROW").alpha = 0;
          });
          showEle.nodes.forEach((node) => {
            const nodeGfx = nodeDataToNodeGfx.get(node);
            nodeGfx.visible = true;
            nodeGfx.alpha = 1;
          });
          clickedNodes = [];
          clickedSP = false;
          clickedNN = false;
          expandedAll = false;
          showArrows = false;
          showNeighbors = false;
          showShortestPath = false;
          searched = false;
          showSingleNodes = true;

          // Have the reset group button have option.
          // For example, on initial click, it'll change to show "Quilt" to show all "Submodules" (Health, Economy, etc.) unexpanded along with "Middle" showing all "Segments" as nodes (General, Demand, etc.) and "Whole" shows all individual variable nodes.
          if(RESET_OPTION === 'Quilt') {
            showEle = filterElements(nodes.concat(SUBMODULES), origLinks, false, "SUBMODULE", THRESHOLD, "Quilt");
          }
          if(RESET_OPTION === 'Middle') {
            // only SEGMENT nodes to render on screen
            showEle = filterElements(nodes.concat(SEGMENTS), origLinks, false, "SUBMODULE", THRESHOLD);
          }
          if(RESET_OPTION === 'Whole') {
            // All VARIABLE NODES AND THE LINKS BETWEEN THEM (fully expanded graph, no segment or submodule nodes)
            showEle = filterElements(origNodes, origLinks, true, "SUBMODULE", THRESHOLD);
          }
          update()

          break;
        default:
          // Handle cases where an unknown button was clicked
          break;
      }
    }

    // Get the button panel element
    const buttonPanel = document.getElementById("buttonPanel");
    const rowPanel1 = document.createElement("div");
    const rowPanel2 = document.createElement("div");
    buttonPanel.appendChild(rowPanel1);
    buttonPanel.appendChild(rowPanel2);

    // Create and append buttons to the panel
    ["Show directions", "Show shortest path", "Show neighbors"].forEach((label, index) => {
      const button = createButton(label, buttonClickHandler, index + 1);
      button.setAttribute("data-button-id", `button${index + 1}`);
      if (showArrows && index === 0) button.classList.add("clicked");
      if (showShortestPath && index === 1) button.classList.add("clicked");
      if (showNeighbors && index === 2) button.classList.add("clicked");
      if (showSingleNodes && index === 5) button.classList.add("clicked");
      rowPanel1.appendChild(button);
    });

    const selectList = document.createElement("select");
    selectList.id = "degreeSelection";
    rowPanel1.appendChild(selectList);

    const optionArray = [1, 2, 3];
    for (var i = 0; i < optionArray.length; i++) {
        var option = document.createElement("option");
        option.value = optionArray[i];
        option.text = optionArray[i];
        selectList.appendChild(option);
    }

    document.getElementById("degreeSelection").addEventListener("change", function () {
      DEGREE = document.getElementById("degreeSelection").value;
      const graph = initGraphologyGraph(showEle.nodes, showEle.links);
      const connectedNodes = findNeighbours(graph, clickedNodes, DEGREE)
      if (connectedNodes && connectedNodes.length > 0) {
        highlightConnections(connectedNodes);
      }
    });

    ["Expanded Graph", "Hide Single Nodes", "Reset"].forEach((label, index) => {
      const button = createButton(label, buttonClickHandler, index + 4);
      button.setAttribute("data-button-id", `button${index + 4}`);
      rowPanel2.appendChild(button);
    });

    const selectList1 = document.createElement("select");
    selectList1.classList.add('default-dd')
    selectList1.id = "resetSelection";
    rowPanel2.appendChild(selectList1);
    const optionArray1 = ["Quilt", "Middle", "Whole"];
    for (var i = 0; i < optionArray1.length; i++) {
        var option = document.createElement("option");
        option.value = optionArray1[i];
        option.text = optionArray1[i];
        if (option.value === RESET_OPTION) {
          option.selected = true;
        }
        selectList1.appendChild(option);
    }

    document.getElementById("resetSelection").addEventListener("change", function () {
      RESET_OPTION = document.getElementById("resetSelection").value;
    });

  }
  //////////////////////////////////////////////////////////////////////////////

  //////////////////////////// BUTTON-RELATED FUNCTIONS ////////////////////////
  function updateSearch(variableData, showShortestPath, graph) {

    if(!graph) graph = initGraphologyGraph(showEle.nodes, showEle.links);

    const searchInput = document.getElementById("search-input");
    const resetSearchIcon = document.getElementById("reset-search");
    const suggestionsContainer = document.getElementById("suggestions-container");

    // Function to filter suggestions based on user input
    function filterSuggestions(input) {
      return variableData.filter((item) => {
        return item.NAME.toLowerCase().includes(input.toLowerCase()) || (item.DEFINITION ? item.DEFINITION.toLowerCase().includes(input.toLowerCase()) : false);
      });
    }

    // Function to update the suggestions dropdown
    function updateSuggestions(input) {
      const filteredSuggestions = filterSuggestions(input);
      suggestionsContainer.innerHTML = "";

      filteredSuggestions.sort(function (a, b) {
        return a.NAME.toLowerCase().localeCompare(b.NAME.toLowerCase());
      });

      filteredSuggestions.forEach((item) => {
        const suggestionElement = document.createElement("div");
        suggestionElement.classList.add("suggestion");
        suggestionElement.textContent = item.DEFINITION ? `${item.NAME} - ${item.DEFINITION}` : item.NAME;
        suggestionElement.addEventListener("click", () => {
          searched = true;
          searchInput.value = item.NAME;
          suggestionsContainer.style.display = "none";
          resetSearchIcon.style.display = "block";

          if (showEle.nodes.find((n) => n.NAME === item.NAME)) {
            if (showShortestPath) {
              clickNodeForShortestPath(item, graph);
            } else {
              highlightNode(item.NAME);
            }
            zoomToNode(item);
            document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => (checkbox.disabled = true));
          } else {
            d3.select(".message").style("visibility", "visible");
            d3.select(".shortestPath-status").html("No such node found.");
          }
        });

        suggestionsContainer.appendChild(suggestionElement);
      });

      if (filteredSuggestions.length > 0) {
        suggestionsContainer.style.display = "block";
      } else {
        suggestionsContainer.style.display = "none";
      }
    }

    // Event listener for input changes
    searchInput.addEventListener("input", () => {
      simulation.alpha(0);
      const inputValue = searchInput.value;
      updateSuggestions(inputValue);
    });

    // Event listener for clicking the reset icon
    resetSearchIcon.addEventListener("click", () => {
      searched = false;
      searchInput.value = "";
      suggestionsContainer.innerHTML = "";
      resetSearchIcon.style.display = "none";
      reset();
    });

    // Close suggestions when clicking outside
    document.addEventListener("click", (event) => {
      if (!suggestionsContainer.contains(event.target)) {
        suggestionsContainer.style.display = "none";
      }
    });
  }
  //////////////////////////////////////////////////////////////////
}

function findShortestPath(graph, clickedNodes) {
  // OUTWARD-BOUND only, meaning the first clickedNode has to be the source node of the path
  const connectedNodes1 = dijkstra.bidirectional(graph, clickedNodes[0], clickedNodes[1]);
  // Therefore, add another shortest path check for the other direction
  // const connectedNodes2 = dijkstra.bidirectional(graph, clickedNodes[1], clickedNodes[0]);
  // if(connectedNodes1 && connectedNodes2) {
  //   return connectedNodes1.concat(connectedNodes2);
  // } else if(!connectedNodes1 && connectedNodes2) {
  //   return connectedNodes2;
  // } else if(connectedNodes1 && !connectedNodes2) {
  //   return connectedNodes1;
  // } else {
  //   return null
  // }
  return connectedNodes1
}

// Find neighboring connections of the clicked node (up to 2 degrees away, OUTWARD-BOUND only: meaning target nodes their links)
function findNeighbours(graph, dd_arr, DEGREE) {
  let connectedNodes = [];
  dd_arr.forEach((dd) => {
    bfsFromNode(graph, dd.id ? dd.id : dd, function (node, attr, depth) {
      if (depth <= DEGREE) {
        connectedNodes.push(node);
      }
    }, {mode: 'outbound'});
    bfsFromNode(graph, dd.id ? dd.id : dd, function (node, attr, depth) {
      if (depth <= DEGREE) {
        connectedNodes.push(node);
      }
    }, {mode: 'inbound'});   
  });
  return connectedNodes;
}

function initGraphologyGraph(nodes, links) {
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

// Function to update the URL with the current state
function updateURL(state) {
  const encodedState = encodeURIComponent(JSON.stringify(state));
  const newURL = `${window.location.pathname}?state=${encodedState}`;
  window.history.pushState({ state }, "", newURL);
}

// Return array of ids that is checked
function checkboxValues(selection) {
  return selection
    .selectAll("input:checked")
    .data()
    .map((d) => d.id);
}

// Throttle function to limit the mouseover event frequency
function throttle(func, delay) {
  let timeout;
  return function () {
    if (!timeout) {
      func.apply(this, arguments);
      timeout = setTimeout(() => {
        timeout = null;
      }, delay);
    }
  };
}

function intern(value) {
  return value !== null && typeof value === "object" ? value.valueOf() : value;
}

function getSourceId(d) {
  return d.source && (d.source.id ? d.source.id : d.source);
}
function getTargetId(d) {
  return d.target && (d.target.id ? d.target.id : d.target);
}

function showLink(nodeIDs, d) {
  return nodeIDs.indexOf(getSourceId(d)) !== -1 && nodeIDs.indexOf(getTargetId(d)) !== -1;
}

function showNode(nodeIDs, id) {
  return nodeIDs.indexOf(id) !== -1;
}
