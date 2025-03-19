import * as d3 from "d3";
import { bfsFromNode } from "graphology-traversal";
import { dijkstra } from "graphology-shortest-path";
import Graph from "graphology";
import VariableTree from "./tree.js";

function generatePath(d, exclude_radius) {
  var dx = d.target.x - d.source.x;
  var dy = d.target.y - d.source.y;
  var gamma = Math.atan2(dy, dx); // Math.atan2 returns the angle in the correct quadrant as opposed to Math.atan

  if (exclude_radius) {
    var sourceNewX = d.source.x + Math.cos(gamma) * d.source.r;
    var sourceNewY = d.source.y + Math.sin(gamma) * d.source.r;
    var targetNewX = d.target.x - Math.cos(gamma) * d.target.r;
    var targetNewY = d.target.y - Math.sin(gamma) * d.target.r;
  } else {
    var sourceNewX = d.source.x;
    var sourceNewY = d.source.y;
    var targetNewX = d.target.x;
    var targetNewY = d.target.y;
  }

  // Coordinates of mid point on line to add new vertex.
  let midX = (targetNewX - sourceNewX) / 2 + sourceNewX;
  let midY = (targetNewY - sourceNewY) / 2 + sourceNewY;
  return "M" + sourceNewX + "," + sourceNewY + "L" + midX + "," + midY + "L" + targetNewX + "," + targetNewY;
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

export default function ForceGraph(
  {
    nodes, // an iterable of node objects (typically [{id}, …])
    links, // an iterable of link objects (typically [{source, target}, …])
  },
  {
    containerSelector,
    nodeId = "id", // given d in nodes, returns a unique identifier (string)
    sourceId = "source",
    targetId = "target",
    nodeGroup, // given d in nodes, returns an (ordinal) value for color
    nodeGroups, // an array of ordinal values representing the node groups
    nodeTitle, // given d in nodes, a title string
    nodeFill = "currentColor", // node stroke fill (if not using a group color encoding)
    nodeStroke = "#ffffff", // node stroke color
    nodeStrokeWidth = 1, // node stroke width, in pixels
    nodeFillOpacity = 1, // node stroke opacity
    nodeStrokeOpacity = 1, // node stroke opacity
    nodeRadius = 5, // node radius, in pixels
    linkStroke = "#000000", // link stroke color
    linkStrokeOpacity = 0.7, // link stroke opacity
    linkStrokeWidth = 1.5, // given d in links, returns a stroke width in pixels
    labelFontWeight = "normal",
    labelVisibility = "hidden",
    labelColor = "#000000",
    colors = d3.schemeTableau10, // an array of color strings, for the node groups
    width = 640, // outer width, in pixels
    height = 400, // outer height, in pixels
    tooltipStyles = {
      width: "auto",
      height: "auto",
      padding: "10px",
      "background-color": "white",
      border: "1px solid black",
      "z-index": 10,
    },
  } = {}
) {
  // Initial states
  const baseURL = "http://localhost:8080/"; // CHANGE TO ACTUAL PRODUCTION APP URL
  const THRESHOLD = 7; // FOR TESTING PURPOSES ONLY TO REDUCE GRAPH SIZE BY FILTERING SUBMODULES
  let nodeDegrees = {};
  let nodeCollapsedState = {};
  let timer;
  let clicked = false; // if any node is clicked, clicked=true
  let zoomLevel = 1; // mousewheel level
  let clickedNodes = []; // an array to store the names of clicked nodes
  let expandedAll = false; // if full graph (all children nodes visible), expandedAll=true
  let showArrows = false; // if edge directions are shown on graph, showArrows=true
  let showNeighbors = false; // if user is allowed to mouseover node to begin search for OUTWARD-BOUND ONLY neighbours 2 degrees away, showNeighours=true
  let searched = false; // if node is searched for from the searchbox, searched=true
  let hideSingleNodes = false; // to show/hide on screen nodes with no connections

  // Set up accessors to enable a cleaner way of accessing data attributes
  const N = d3.map(nodes, (d) => d[nodeId]).map(intern);
  const LS = d3.map(links, (d) => d[sourceId]).map(intern);
  const LT = d3.map(links, (d) => d[targetId]).map(intern);

  // Replace the input nodes and links with mutable objects for the simulation
  nodes = d3.map(nodes, (d, i) => ({ id: N[i], ...d, type: "tier3" }));
  links = d3.map(links, (_, i) => ({
    source: LS[i],
    target: LT[i],
  }));

  // Create the submodule nodes
  const SUBMODULES = [...new Set(nodes.filter((d) => d.SUBMODULE > THRESHOLD).map((d) => d.SUBMODULE))]
    .filter((d) => d)
    .map((d) => {
      nodeDegrees["submodule-" + d] = 0;
      nodeCollapsedState[d] = expandedAll ? 1 : 0;
      return {
        id: "submodule-" + d,
        NAME: d,
        SUBMODULE: d,
        type: "tier1",
      };
    });

  // Create the segment nodes for each submodule node
  const SEGMENTS = [...new Set(nodes.filter((d) => d.SUBMODULE > THRESHOLD).map((d) => d.SUBMODULE + "_" + d.SEGMENT))]
    .filter((d) => d !== "null_null")
    .map((d) => {
      nodeDegrees["segment-" + d] = 0;
      nodeCollapsedState[d] = expandedAll ? 0 : 1;
      return {
        id: "segment-" + d,
        NAME: d,
        SUBMODULE: +d.split("_")[0],
        SEGMENT: +d.split("_")[1],
        type: "tier2",
      };
    });

  // // Create edges that connect segment nodes to each submodule node
  // const SUBMODULE_SEGMENT_PAIR = [
  //   ...new Set(nodes.map((d) => d.SUBMODULE + "_" + d.SEGMENT)),
  // ]
  //   .filter((d) => d !== "null_null")
  //   .map((d) => {
  //     return {
  //       source: "submodule-" + d.split("_")[0],
  //       target: "segment-" + d,
  //       type: "tier1",
  //     };
  //   });

  if (expandedAll === false) {
    // Add all the new nodes and edges above to the original dataset
    //nodes = nodes.concat(SUBMODULES).concat(SEGMENTS);
    nodes = nodes.concat(SEGMENTS);
    //links = links.concat(SUBMODULE_SEGMENT_PAIR);
  }

  // To calculate number of incoming connections to size node radius
  nodes.forEach((node) => {
    nodeDegrees[node.id] = 0;
  });

  links.forEach((link) => {
    const srcNode = nodes.find((node) => node.id === link.source);
    const targetNode = nodes.find((node) => node.id === link.target);
    nodeDegrees[link.source]++;
    // Sizes of the nodes weighted by the number of links going to that node.
    nodeDegrees[link.target]++;
    nodeDegrees["segment-" + targetNode["SUBMODULE"] + "_" + targetNode["SEGMENT"]]++;
    nodeDegrees["submodule-" + targetNode["SUBMODULE"]]++;
    link.sourceSegment = srcNode["SEGMENT"];
    link.targetSegment = targetNode["SEGMENT"];
    link.sourceSubmodule = srcNode["SUBMODULE"];
    link.targetSubmodule = targetNode["SUBMODULE"];
  });

  // All elements fully expanded
  let origEle = filterElements(nodes, links, true, "SUBMODULE", THRESHOLD);
  // Elements in collapsed state to render on screen on page load initially
  let showEle = filterElements(nodes, links, expandedAll, "SUBMODULE", THRESHOLD);
  // Save an original copy of nodes and edges. Necessary to enable accuracy of expand / collapse feature
  let origNodes = [...origEle.nodes];
  let origLinks = [...origEle.links];

  const nodeRadiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(Object.values(nodeDegrees))])
    .range([4.5, 22])
    .clamp(true);

  /////////////////// Set up initial  DOM elements on screen ///////////////////
  // Create a container for tooltip that is only visible on mouseover of a node
  const tooltip = d3.select("#app").append("div").attr("class", "tooltip").style("position", "absolute").style("visibility", "hidden");

  for (const prop in tooltipStyles) {
    tooltip.style(prop, tooltipStyles[prop]);
  }

  // Create a container to show / track clicked node selection to find shortest path
  const message = d3.select("#app").append("div").attr("class", "message");

  message.append("h2").attr("class", "clickedNodes-1");

  message.append("h2").attr("class", "clickedNodes-2");

  message.append("h3").attr("class", "shortestPath-status");

  message
    .append("h3")
    .attr("class", "clickedNodes-reset")
    .attr("text-decoration", "underline")
    .attr("pointer-events", "auto")
    .attr("cursor", "pointer")
    .html("RESET")
    .on("click", function (event, dd) {
      clicked = false;
      clickedNodes = [];
      reset();
      message.select(".clickedNodes-1").html("");
      message.select(".clickedNodes-2").html("");
      message.select(".shortestPath-status").html("");
      message.style("visibility", "hidden");
      document.querySelectorAll('input[type="checkbox"]').forEach((e) => (e.checked = false)); // uncheck all the checkboxes from tree
    });

  // Create a container for the graph
  const svg = d3
    .select(containerSelector)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .attr("style", "max-width: 100%; height: auto; pointer-events: auto;");

  // Create and store arrowheads that will be used when the lines are rendered later
  svg.append("defs").append("marker").attr("id", "arrowhead").attr("viewBox", "-0 -5 10 10").attr("refX", 0).attr("refY", 0).attr("orient", "auto").attr("markerWidth", 5).attr("markerHeight", 5).attr("xoverflow", "visible").append("svg:path").attr("d", "M 0,-5 L 10 ,0 L 0,5").attr("fill", linkStroke).style("stroke", "none");

  const g = svg.append("g");

  const linkG = g.append("g").attr("class", "links");

  const nodeG = g.append("g").attr("class", "nodes");

  const textG = g.append("g").attr("class", "labels");

  //////////////////////////////////////////////////////////////////////////////

  /////////////////////////// add zoom capabilities ////////////////////////////
  const zoomHandler = d3.zoom().on("zoom", function (event) {
    g.attr("transform", event.transform);
    if (clicked || searched) return;
    zoomLevel = event.transform.k;
    if (zoomLevel >= 3.5) {
      svg.selectAll(".label").attr("visibility", (d) => (d.linkCnt >= 10 ? "visible" : "hidden"));
    } else if (zoomLevel >= 2) {
      svg.selectAll(".label").attr("visibility", (d) => (d.linkCnt >= 20 ? "visible" : "hidden"));
    } else if (zoomLevel < 2) {
      svg.selectAll(".label").attr("visibility", labelVisibility);
    }
  });

  svg.call(zoomHandler);
  //////////////////////////////////////////////////////////////////////////////
  const simulation = d3.forceSimulation();

  // Render graph state initially
  if (window.location.href != baseURL) {
    let showNodesIDs = window.location.href.split("?state=%")[1].split("-");
    showNodesIDs[0] = showNodesIDs[0].slice(2);
    showNodesIDs[showNodesIDs.length - 1] = showNodesIDs[showNodesIDs.length - 1].slice(0, -3);
    const allNodes = origNodes.concat(SEGMENTS).concat(SUBMODULES);
    showEle.nodes = allNodes.filter((d) => showNodesIDs.indexOf(d.NAME.toString()) !== -1);
    showEle.links = origLinks.filter((d) => showNodesIDs.indexOf(typeof d.source === "object" ? d.source.id : d.source) !== -1 && showNodesIDs.indexOf(typeof d.target === "object" ? d.target.id : d.target) !== -1);

    showEle.nodes.map((node) => {
      addLinksBwSubmoduleAndOthers(node);
      addLinksBwSegmentAndOthers(node);
      addLinksBwVarAndOthers(node);
    });

    // PRECAUTIONARY ACTION: ENSURE THAT ONLY LINKS WITH CORRESPONDING SOURCE AND TARGET NODES ON SCREEN ARE RENDERED
    const nodeIDs = showEle.nodes.map((node) => node.id);
    let linksToAdd = [];
    showEle.links.forEach((link) => {
      if (nodeIDs.indexOf(link.source) !== -1 && nodeIDs.indexOf(link.target) !== -1) {
        linksToAdd.push(link);
      }
    });
    showEle.links = linksToAdd;
  }

  update();

  // Initialize a panel of buttons to configure initial graph state and handle future interaction with graph
  createButtons();

  // Initialize search box with searchable items (Note: Will have to think of how to update search results when user filters graph)
  createSearch(origEle.nodes);

  //////////////////////////////////////////////////////////////////////////////

  /////////////////////// SIMULATION-RELATED FUNCTIONS /////////////////////////
  function update() {
    // PRECAUTIONARY ACTION: REMOVE DUPLICATE LINKS
    const uniqueLinks = [];
    const uniqueLinksSet = new Set();
    showEle.links.forEach((link) => {
      if (Object.keys(link).length === 0) return;
      const sourceID = link.source.id ? link.source.id : link.source;
      const targetID = link.target.id ? link.target.id : link.target;
      const linkStr = `${sourceID}-${targetID}`;
      if (!uniqueLinksSet.has(linkStr)) {
        uniqueLinksSet.add(linkStr);
        uniqueLinks.push(link);
      }
    });
    showEle.links = uniqueLinks;
    console.log(showEle);

    // Set up accessors to enable a cleaner way of accessing attributes of each node and edge
    const T = nodeTitle === undefined ? d3.map(showEle.nodes, (d) => d.NAME).map(intern) : d3.map(showEle.nodes, nodeTitle).map(intern);
    const G = nodeGroup == null ? null : d3.map(showEle.nodes, nodeGroup).map(intern);
    const W = typeof linkStrokeWidth !== "function" ? null : d3.map(showEle.links, linkStrokeWidth);
    const L = typeof linkStroke !== "function" ? null : d3.map(showEle.links, linkStroke);
    if (G && nodeGroups === undefined) nodeGroups = d3.sort(G);
    const color = nodeGroup == null ? null : d3.scaleOrdinal(nodeGroups, colors);

    showEle.nodes.forEach((n) => {
      n.linkCnt = nodeDegrees[n.id] || 0;
    });

    const graph = initGraphologyGraph(showEle.nodes, showEle.links);
    ////////////////////////// Run simulation on data ///////////////////////////
    simulation
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
      // .force(
      //   "collision",
      //   d3.forceCollide().radius(function (d) {
      //     // only apply force collision on submodule and segment nodes, to prevent them from overlapping with each other
      //     return d.type === "tier1" || d.type === "tier2" ? 30 : null;
      //   }),
      // )
      .force("charge", d3.forceManyBody().strength(Math.max(expandedAll ? -200 : -800, -60000 / showEle.nodes.length)))
      .force("cluster", forceCluster().strength(0.35)); // cluster all nodes belonging to the same submodule

    // Restart the force layout
    simulation.nodes(showEle.nodes).force("link").links(showEle.links);

    simulation.on("tick", ticked);

    simulation
      .alphaTarget(0.5)
      .alphaDecay(expandedAll ? 0.5 : 0.3)
      .restart(); // increase alphaDecay value to cool down a graph more quickly

    // Update existing links
    const link = linkG
      .selectAll("path.link")
      .data(showEle.links)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "link")
            .attr("id", (d) => d.source.id + "_" + d.target.id),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("stroke", linkStroke)
      .attr("stroke-width", linkStrokeWidth)
      .attr("opacity", (d) => (d.type === "tier1" || d.type === "tier2" ? 1 : showEle.links.length > 200 ? 0.25 : linkStrokeOpacity)) // full opacity of segment and submodule connections for easier identification
      .attr("d", (d) => generatePath(d));

    if (showArrows) {
      linkG.selectAll("path.link").attr("marker-mid", "url(#arrowhead)"); // render arrow heads in the middle of line
    }

    if (W) link.attr("stroke-width", (d, i) => W[i]);
    if (L) link.attr("stroke", (d, i) => L[i]);

    // Update existing nodes
    const updatedNode = nodeG.selectAll(".node").data(showEle.nodes, (d) => d.id);

    updatedNode.join(
      (enter) => {
        const newNode = enter
          .append("g")
          .attr("class", "node")
          .attr("pointer-events", "auto")
          .attr("cursor", "pointer")
          .attr("opacity", 1)
          .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
          .call(drag(simulation))
          .on("click", function (event, dd) {
            simulation.alpha(0);
            event.preventDefault();
            if (dd.type === "tier1" || dd.type === "tier2") return; // NOTE: SHORTEST PATH CONNECTIONS CAN ONLY BE FOUND BETWEEN VARIABLE NODES
            if (event.detail === 1) {
              // Necessary to differentiate between a 'click' and 'double click' action
              timer = setTimeout(() => {
                if (clickedNodes.length < 2) {
                  if (clickedNodes.indexOf(dd.id) === -1) {
                    // if the same node is not already clicked, add to array
                    clickedNodes.push(dd.id);
                    d3.select(this).select("circle").attr("stroke", "white").attr("stroke-width", "2.5px");
                  } else {
                    clickedNodes.splice(dd.id, 1); // remove a clicked node if the same node is clicked again
                    d3.select(this).select("circle").attr("stroke", nodeStroke).attr("stroke-width", nodeStrokeWidth);
                  }
                }

                clickedNodesFeedback(clickedNodes); // render clicked node(s) name on screen to let the user know they have engaged with the circle

                // Only proceed with finding shortest path between 2 different clicked nodes
                if (clickedNodes.length === 2) {
                  findShortestPath(graph, clickedNodes);
                  clicked = true; // Only prevent dblclick and mouseover action when the shortest path is shown
                }
              }, 200);
            }
          })
          .on("dblclick.zoom", null)
          .on("dblclick", function (event, dd) {
            simulation.alpha(0);
            // No collapse/expand action taken if screen is at shortest path view or searched node view
            if (clicked || searched) return;
            event.preventDefault();
            event.stopPropagation();
            clearTimeout(timer);
            if (dd.type === "tier1" || (nodeCollapsedState[dd.SUBMODULE + "_" + dd.SEGMENT] === 1 && nodeCollapsedState[dd.SUBMODULE] === 0)) {
              console.log("expand");
              expandableAction(dd);
            } else {
              console.log("collapse");
              collapsibleAction(dd);
            }
          })
          .on("mouseover", function (event, dd) {
            simulation.alpha(0);
            updateTooltip(dd); // show tooltip on mouseover any node
            // No nearest neighour finding action taken if screen is at shortest path view / searched node view / mouseover has been disabled
            // Disabled mousover/out action when showNeighbors = false, to prevent hindering click or dblclick action from a UX perspective
            if (clicked || searched || !showNeighbors) return;
            event.preventDefault();
            // Throttle function to limit the nearest neighbor search frequency (prevent accidentally triggering the search, considerng the high volume of elements on screen)
            throttle(findNeighbours(graph, [dd]), 1000);
          })
          .on("mouseleave", function () {
            simulation.alpha(0);
            tooltip.style("visibility", "hidden");
            if (clicked || searched || !showNeighbors) return;
            reset();
          })
          .on("contextmenu", (event) => {
            event.preventDefault(); // Prevent the default context menu
            console.log("open modal box to choose to manually expand or collapse");
          });

        newNode
          .append("circle")
          .attr("fill", nodeFill)
          .attr("stroke", nodeStroke)
          .attr("r", (d) => nodeRadiusScale(d.linkCnt)) // only segment and submodule nodes are not sized by node degree
          .attr("fill-opacity", nodeFillOpacity)
          .attr("stroke-opacity", nodeStrokeOpacity)
          .attr("stroke-width", nodeStrokeWidth);

        if (G) newNode.select("circle").attr("fill", (d, i) => color(G[i]));

        return newNode;
      },
      (update) => update,
      (exit) => exit.remove()
    );

    // Update existing text elements
    const updatedText = textG.selectAll(".label").data(showEle.nodes, (d) => d.id);

    updatedText.join(
      (enter) => {
        const newText = enter
          .append("g")
          .attr("class", "label")
          .attr("opacity", 1)
          .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
          .attr("visibility", labelVisibility);

        newText
          .append("text")
          .attr("x", (d) => nodeRadiusScale(d.linkCnt) + 5) // position label next to node without overlap
          .attr("dominant-baseline", "middle")
          .attr("text-anchor", "start")
          .attr("fill", labelColor)
          .attr("stroke", "black")
          .attr("stroke-width", 0.25)
          .attr("font-size", (d) => nodeRadiusScale(d.linkCnt)) // label size is proportionate to node size
          .attr("font-weight", labelFontWeight)
          .text((d, i) => T[i]);

        return newText;
      },
      (update) => update,
      (exit) => exit.remove()
    );

    function ticked() {
      link.attr("d", (d) => generatePath(d));
      nodeG.selectAll(".node").attr("transform", (d) => `translate(${d.x}, ${d.y})`);
      textG.selectAll(".label").attr("transform", (d) => `translate(${d.x}, ${d.y})`);
    }

    VariableTree(showEle.nodes, THRESHOLD, showNeighbors, graph);

    /////////////////// UPDATE GRAPH FROM TREE ///////////////////////
    d3.selectAll(".list-item-1").on("click", function (event, d) {
      event.preventDefault();
      event.stopPropagation();
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
    });

    d3.selectAll(".list-item-0").on("click", function (event, d) {
      event.preventDefault();
      event.stopPropagation();
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
    });
  }

  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
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
  // This function is used to filter input data before initial graph render.
  function filterElements(nodes, links, expandedAll, criteria, value) {
    let nodesShow = nodes.filter((d) => d[criteria] > value);

    if (expandedAll) {
      nodesShow = nodesShow.filter((d) => d.type !== "tier1" && d.type !== "tier2");
    }

    const showNodesIDs = nodesShow.map((d) => d.id);

    const linksShow = links.filter((d) => showNodesIDs.indexOf(typeof d.source === "object" ? d.source.id : d.source) !== -1 && showNodesIDs.indexOf(typeof d.target === "object" ? d.target.id : d.target) !== -1);

    // only render the submodule and segment nodes initially if expandedAll=false
    if (expandedAll === false) {
      const nodesFiltered = nodesShow.filter((d) => d.type === "tier1" || d.type === "tier2");

      const linksFiltered = linksShow.filter((d) => d.type === "tier1");

      // find connections between the segment nodes
      linksShow.forEach((d) => {
        const id = d.sourceSubmodule + "_" + d.sourceSegment + "_" + d.targetSubmodule + "_" + d.targetSegment;
        const linksIDs = linksFiltered.map((link) => link.sourceSubmodule + "_" + link.sourceSegment + "_" + link.targetSubmodule + "_" + link.targetSegment);
        if (linksIDs.indexOf(id) === -1) {
          if (d.sourceSubmodule !== null && d.sourceSegment !== null && d.targetSubmodule !== null && d.targetSegment !== null) {
            linksFiltered.push({
              source: "segment-" + d.sourceSubmodule + "_" + d.sourceSegment,
              target: "segment-" + d.targetSubmodule + "_" + d.targetSegment,
              sourceSegment: d.sourceSegment,
              targetSegment: d.targetSegment,
              sourceSubmodule: d.sourceSubmodule,
              targetSubmodule: d.targetSubmodule,
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
      const submoduleNode = SUBMODULES.find((node) => node.id === sub_ID);
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
        if (nodesToRemove.indexOf(link.source.id) !== -1) {
          linksToRemove.push(link);
        }
        if (nodesToRemove.indexOf(link.target.id) !== -1) {
          linksToRemove.push(link);
        }
        if (nodeIDs.indexOf(link.source.id) === -1) {
          linksToRemove.push(link);
        }
        if (nodeIDs.indexOf(link.target.id) === -1) {
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
      const segmentNode = SEGMENTS.find((node) => node.id === sub_seg_ID);
      showEle.nodes.push(segmentNode);

      // As source nodes may be expanded/collapsed we have to check before adding the link
      linksFromOtherToSegment.forEach((link) => {
        const src_sub_seg_ID = "segment-" + link.sourceSubmodule + "_" + link.sourceSegment;
        const src_sub_ID = "submodule-" + link.sourceSubmodule;
        const src_ID = link.source.id ? link.source.id : link.source;

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
        const target_ID = link.target.id ? link.target.id : link.target;

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

    updateURL(showEle.nodes.map((d) => d.NAME).join("-"));
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
      const src_ID = link.source.id ? link.source.id : link.source;

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
      const target_ID = link.target.id ? link.target.id : link.target;

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
      showEle.links = showEle.links.filter((link) => link.source.id !== "submodule-" + d["SUBMODULE"] && link.target.id !== "submodule-" + d["SUBMODULE"]);

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
      showEle.links = showEle.links.filter((link) => link.source.id !== nodeId && link.target.id !== nodeId);

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

    updateURL(showEle.nodes.map((d) => d.NAME).join("-"));
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
      const target_ID = link.target.id ? link.target.id : link.target;

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
      } else if (showEle.nodes.findIndex((n) => (n.id === target_sub_ID) !== -1)) {
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
      const src_ID = link.source.id ? link.source.id : link.source;

      let newLink = {};
      if (showEle.nodes.findIndex((n) => n.id === src_sub_seg_ID) !== -1) {
        newLink = {
          source: src_sub_seg_ID,
          target: segmentID,
        };
      } else if (showEle.nodes.findIndex((n) => (n.id === src_sub_ID) !== -1)) {
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
      const src_ID = link.source.id ? link.source.id : link.source;
      const target_sub_seg_ID = "segment-" + link.targetSubmodule + "_" + link.targetSegment;
      const target_sub_ID = "submodule-" + link.targetSubmodule;
      const target_ID = link.target.id ? link.target.id : link.target;

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
      } else if (showEle.nodes.findIndex((n) => (n.id === target_sub_ID) !== -1)) {
        // create a link between VARSEG node and other submodule node
        newLink = {
          source: src_ID,
          target: target_sub_ID,
        };
        // If segment and submodule node doesn't exist, that means the connection is between a VARSEG node and a variable of another color.
      } else if (showEle.nodes.findIndex((n) => (n.id === target_ID) !== -1 && (n.id === src_ID) !== -1)) {
        newLink = link;
      }
      showEle.links.push(newLink);
    });

    // Since other nodes may or may not be collapsed, linksFromOtherToVar cannot be simply concatenated to array of existing links
    linksFromOtherToVar.forEach((link) => {
      const target_ID = link.target.id ? link.target.id : link.target;
      const src_sub_seg_ID = "segment-" + link.sourceSubmodule + "_" + link.sourceSegment;
      const src_sub_ID = "submodule-" + link.sourceSubmodule;
      const src_ID = link.source.id ? link.source.id : link.source;

      let newLink = {};
      if (showEle.nodes.findIndex((n) => n.id === src_sub_seg_ID) !== -1) {
        newLink = {
          source: src_sub_seg_ID,
          target: target_ID,
        };
      } else if (showEle.nodes.findIndex((n) => (n.id == src_sub_ID) !== -1)) {
        newLink = {
          source: src_sub_ID,
          target: target_ID,
        };
      } else if (showEle.nodes.findIndex((n) => (n.id === src_ID) !== -1 && (n.id === target_ID) !== -1)) {
        newLink = link;
      }
      showEle.links.push(newLink);
    });
  }

  function highlightNode(dd) {
    nodeG.selectAll(".node").attr("opacity", (d) => (d.id == dd ? 1 : 0.2));

    linkG.selectAll("path.link").attr("opacity", 0.1);

    textG.selectAll(".label").attr("visibility", (d) => (d.id == dd ? "visible" : "hidden"));
  }

  // Un-highlight all elements and hide tooltip
  function reset() {
    nodeG.selectAll(".node").attr("opacity", 1);

    nodeG.selectAll(".node").selectAll("circle").attr("stroke", nodeStroke).attr("stroke-width", nodeStrokeWidth);

    linkG.selectAll("path.link").attr("opacity", (d) => (d.type === "tier1" || d.type === "tier2" ? 1 : showEle.links.length > 200 ? 0.25 : linkStrokeOpacity));

    textG.selectAll(".label").attr("visibility", labelVisibility);

    tooltip.style("visibility", "hidden");

    if (searched) {
      svg.transition().duration(500).call(zoomHandler.transform, d3.zoomIdentity);
      searched = false;
      document.getElementById("search-input").value = "";
      suggestionsContainer.innerHTML = "";
      resetSearchIcon.style.display = "none";
    }

    document.querySelectorAll('input[type="checkbox"]').forEach((e) => (e.checked = false)); // uncheck all the checkboxes

    d3.select(".message").style("visibility", "hidden");
    d3.select(".shortestPath-status").html("");
  }

  function updateTooltip(d) {
    let content = [];
    content.push(`<div><h3>${d.id}</h3></div>`); // tooltip title
    for (const [key, value] of Object.entries(d)) {
      // iterate over each attribute object and render
      if (key === "fx" || key === "fy" || key === "vx" || key === "vy" || key === "x" || key === "y" || key === "index" || key === "type") break;
      content.push(`<div><b>${key}: </b><span>${value}</span></div>`);
    }
    let contentStr = "";
    content.map((d) => (contentStr += d));

    tooltip
      .html(`${contentStr}`)
      //.style('top', event.y - 300+ 'px')
      //.style('left', event.x - 100 + 'px')
      .style("top", 60 + "px") // adjust starting point of tooltip div to minimise chance of overlap with node
      .style("left", 5 + "px")
      .style("visibility", "visible");
  }

  // Function to zoom to a specific node
  function zoomToNode(node) {
    // Calculate the new zoom transform
    const scale = 2; // You can adjust the zoom level as needed
    const x = -node.x * scale;
    const y = -node.y * scale;
    const transform = d3.zoomIdentity.translate(x, y).scale(scale);
    // Apply the new zoom transform with smooth transition
    svg.transition().duration(500).call(zoomHandler.transform, transform);
  }
  //////////////////////////////////////////////////////////////////////////////

  /////////////////////// HELPER FUNCTIONS ////////////////////////
  function intern(value) {
    return value !== null && typeof value === "object" ? value.valueOf() : value;
  }

  function createButtons() {
    // Function to create a button element with a specified label and action
    function createButton(label, action) {
      const button = document.createElement("button");
      button.textContent = label;
      button.classList.add("button");
      button.addEventListener("click", action);
      return button;
    }

    // Function to perform an action when a button is clicked
    function buttonClickHandler(event) {
      const buttonId = event.target.getAttribute("data-button-id");

      // Check which button was clicked using its ID
      switch (buttonId) {
        case "button1":
          if (clicked || searched) return; // disable action if screen is at shortest path view / searched node view
          showArrows = !showArrows;
          if (showArrows) {
            event.target.classList.add("clicked");
            linkG.selectAll("path.link").attr("marker-mid", "url(#arrowhead)");
          } else {
            event.target.classList.remove("clicked");
            linkG.selectAll("path.link").attr("marker-mid", null);
          }
          break;
        case "button2":
          if (clicked || searched) return; // disable action if screen is at shortest path view / searched node view
          showNeighbors = !showNeighbors;
          if (showNeighbors) {
            event.target.classList.add("clicked");
          } else {
            event.target.classList.remove("clicked");
          }
          const graph = initGraphologyGraph(showEle.nodes, showEle.links);
          VariableTree(showEle.nodes, THRESHOLD, showNeighbors, graph);
          break;
        case "button3":
          if (clicked || searched) return; // disable action if screen is at shortest path view / searched node view
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
            update();
          } else {
            event.target.classList.remove("clicked");
            showEle = filterElements(nodes.concat(SEGMENTS), links, false, "SUBMODULE", THRESHOLD);
            update();
          }
          break;
        case "button4":
          // Note: If a single node is still shown on screen despite clicking the button, it's because some nodes have links where the source and target is the node itself.
          hideSingleNodes = !hideSingleNodes;
          if (hideSingleNodes) {
            event.target.classList.add("clicked");
            // Find nodes without any connections
            const nodes = Object.keys(nodeDegrees).filter((key) => nodeDegrees[key] === 0);
            // Hide the opacity of these single nodes
            nodeG
              .selectAll(".node")
              .filter((d) => nodes.indexOf(d.id) !== -1)
              .attr("opacity", 0);
          } else {
            event.target.classList.remove("clicked");
            nodeG.selectAll(".node").attr("opacity", 1);
          }
          break;
        case "button5":
          reset();
          break;
        default:
          // Handle cases where an unknown button was clicked
          break;
      }
    }

    // Create an array of button labels
    const buttonLabels = ["Show directions", "Show neighbors", "Expanded Graph", "Hide Single Nodes", "Reset"];

    // Get the button panel element
    const buttonPanel = document.getElementById("buttonPanel");

    // Create and append buttons to the panel
    buttonLabels.forEach((label, index) => {
      const button = createButton(label, buttonClickHandler);
      button.setAttribute("data-button-id", `button${index + 1}`);
      buttonPanel.appendChild(button);
    });
  }

  function createSearch(variableData) {
    const searchInput = document.getElementById("search-input");
    const resetSearchIcon = document.getElementById("reset-search");
    const suggestionsContainer = document.getElementById("suggestions-container");

    // Function to filter suggestions based on user input
    function filterSuggestions(input) {
      return variableData.filter((item) => {
        return item.id.toLowerCase().includes(input.toLowerCase()) || (item.DEFINITION ? item.DEFINITION.toLowerCase().includes(input.toLowerCase()) : false);
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
        suggestionElement.textContent = `${item.NAME} - ${item.DEFINITION}`;
        suggestionElement.addEventListener("click", () => {
          searched = true;
          searchInput.value = item.NAME;
          suggestionsContainer.style.display = "none";
          resetSearchIcon.style.display = "block";

          const node = showEle.nodes.find((n) => n.NAME === item.NAME);
          if (node) {
            zoomToNode(item.NAME);
            highlightNode(item.NAME);
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

export function clickedNodesFeedback(clickedNodes) {
  // Track which nodes have been clicked and render their names on screen
  if (clickedNodes[0]) d3.select(".clickedNodes-1").html("Start node: " + clickedNodes[0]);

  if (clickedNodes[1]) d3.select(".clickedNodes-2").html("End node: " + clickedNodes[1]);

  if (clickedNodes.length > 0) {
    d3.select(".message").style("visibility", "visible");
  }
}

export function findShortestPath(graph, clickedNodes) {
  // OUTWARD-BOUND only, meaning the first clickedNode has to be the source node of the path
  const connectedNodes = dijkstra.bidirectional(graph, clickedNodes[0], clickedNodes[1]);
  if (connectedNodes) {
    // Only proceed with showing the nodes and paths that constitute the shortest path if it exist
    highlightConnections(connectedNodes);
  } else {
    // Provide feedback to user that no shortest path exist between the 2 nodes
    d3.select(".shortestPath-status").html("No shortest path found. Would you like to try again?");
  }
}

// Find neighboring connections of the clicked node (up to 2 degrees away, OUTWARD-BOUND only: meaning target nodes their links)
export function findNeighbours(graph, dd_arr) {
  let connectedNodes = [];
  dd_arr.forEach((dd) => {
    bfsFromNode(graph, dd.id ? dd.id : dd, function (node, attr, depth) {
      if (depth <= 2) {
        connectedNodes.push(node);
      }
    });
  });
  highlightConnections(connectedNodes);
}

function highlightConnections(connectedNodes) {
  d3.selectAll(".node").attr("opacity", (d) => (connectedNodes.indexOf(d.id) !== -1 ? 1 : 0));

  d3.selectAll("path.link").attr("opacity", (d) => (connectedNodes.indexOf(d.source.id) !== -1 && connectedNodes.indexOf(d.target.id) !== -1 ? 1 : 0));

  d3.selectAll(".label").attr("visibility", (d) => (connectedNodes.indexOf(d.id) !== -1 ? "visible" : "hidden"));
}

function initGraphologyGraph(nodes, links) {
  // Initialize a new Graphology graph and add all nodes and edges to it
  // This will be used for shortest path and finding neighbours later
  const graph = new Graph();

  nodes.forEach((n) => {
    if (!graph.hasNode(n.id)) graph.addNode(n.id);
  });
  links.forEach((e) => {
    if (e.source.id && e.target.id) {
      if (graph.hasNode(e.source.id) && graph.hasNode(e.target.id)) {
        if (!graph.hasEdge(e.source.id, e.target.id)) {
          graph.addEdge(e.source.id, e.target.id);
        }
      }
    } else {
      if (graph.hasNode(e.source) && graph.hasNode(e.target)) {
        if (!graph.hasEdge(e.source, e.target)) {
          graph.addEdge(e.source, e.target);
        }
      }
    }
  });

  return graph;
}

// Function to update the URL with the current state
function updateURL(state) {
  const encodedState = encodeURIComponent(JSON.stringify(state));
  const newURL = `${window.location.pathname}?state=${encodedState}`;
  window.history.pushState({ state }, "", newURL);
}
