import * as d3 from "d3";
import {  COLOR_SCALE_RANGE } from "./constants";
import { config } from "./config";
import ForceGraph from "./graph-d3";

const mainAppContainerSelector = "#app";
// functions to render graph when ready (or after a collapsible tree change)
const getGraphData = () => {
  if(config.graphDataType === "parameter") return config.parameterData;
  if(config.graphDataType === "segment") return {nodes: config.hierarchyData["segmentNodes"], links: []};
  return {nodes: config.hierarchyData["subModuleNodes"],links: []};
}

const getSubModulePositions = (width, height) => {
  const subModulesByLeaveCount = config.hierarchyData.subModuleNodes.reduce((acc, entry) => {
    acc.push({
      name: entry.id,
      value: entry.leaves().length
    })
    return acc;
  },[]);

  const root = d3
    .hierarchy({ name: "root", children: subModulesByLeaveCount })
    .sum((s) => s.value);

  const treemapLayout = d3.treemap()
    .size([width, height])

  treemapLayout(root);

  // applying a basic jitter function so it doesn't appear totally aligned
  const jitter = (value, amount = 50) => value + (Math.random() * 2 - 1) * amount;

  const subModulePositions =  root.children.reduce((acc, entry,index) => {
    acc.push({
      name: entry.data.name,
      x: jitter(entry.x0 + (entry.x1 - entry.x0)),
      y: jitter(entry.y0 + (entry.y1 - entry.y0)),
      fill: COLOR_SCALE_RANGE[index]
    })
    return acc;
  },[]);

  return subModulePositions;
}
export const renderGraph = (initial) => {

  const graphData = getGraphData();
 const subModulePositions = getSubModulePositions(window.innerWidth, window.innerHeight)
  // Execute the function to generate a new network
  ForceGraph(
    graphData,
    {
      containerSelector: mainAppContainerSelector,
      initial,
      width: window.innerWidth,
      height: window.innerHeight,
      subModulePositions
    }
  );
}
export const getColorScale = () => d3.scaleOrdinal(config.subModules, COLOR_SCALE_RANGE);

// constants for drawTree function
// From https://fontawesome.com/
// go to approach is to use unicode's but the browser is converting text -> svg (never seen that before) and it's not rendering
// since there are only a few icons, I'm reverting to svgs and storing the paths + viewboxes as constants
const downArrowPath = "M201.4 374.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 306.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"
const rightArrowPath = "M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"
const rightArrowViewBox = "0 0 320 512";
const standardViewBox = "0 0 448 512"
const allSelectedPath = "M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM337 209L209 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L303 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"
const partSelectedPath = "M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM152 232l144 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-144 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"
const noneSelectedPath = "M384 80c8.8 0 16 7.2 16 16l0 320c0 8.8-7.2 16-16 16L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0zM64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32z"
const colorScale = getColorScale();
const iconWidthHeight = 16;

export const remToPx = (rem) =>{
  // converts rem to px so we can maintain re-sizing
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return rem * rootFontSize;
}

const marginTop = 0;
const rowHeight = remToPx(1.7);
const treeDivId = "collapsibleMenuDiv";
// search-tab-container width is 18rem, 20px is absolute maximum scrollbar width;
let treeWidth = remToPx(18) - 20;

// config.selectedNodeNames used by chart + list
const getSelectedPath = (descendantNames) => {
  const hasSelected = descendantNames.some((s) => config.selectedNodeNames.includes(s));
  const hasUnselected = descendantNames.some((s) => !config.selectedNodeNames.includes(s));
  if(hasSelected && !hasUnselected) return allSelectedPath;
  if(hasSelected) return partSelectedPath;
  return noneSelectedPath;
}

// called from within itself and from d3-graph.js
export const drawTree = () => {

  const depthExtra = (depth, increment) => (depth -1) * increment;


  const currentTreeData = config.currentTreeData;
  const svg =  d3.select(`.${treeDivId}_svg`);
  const treeHeight = marginTop + (currentTreeData.descendants().length * rowHeight);
  svg.attr("height",treeHeight);

  let chartData = currentTreeData.descendants()
    .filter((f) => f.depth > 0)
    .sort((a,b) => d3.ascending(a.data.hOrderPosition, b.data.hOrderPosition));

  if(!config.showSingleNodes){
    chartData = chartData.filter((f) => !(f.data.type === "tier3" && f.data.linkCount === 0))
  }

  const treeGroup = svg
    .selectAll(".treeGroup")
    .data(chartData, (d) => d.data.hOrderPosition)
    .join((group) => {
      const enter = group.append("g").attr("class", "treeGroup");
      enter.append("text").attr("class", "treeLabel");
      enter.append("line").attr("class", "verticalLine");
      enter.append("svg").attr("class","expandCollapseIcon").append("path").attr("class", "expandCollapseIconPath");
      enter.append("rect").attr("class","expandClickRect")
      enter.append("svg").attr("class", "selectedCheckboxIcon").append("path").attr("class", "selectedCheckboxIconPath");
      enter.append("rect").attr("class","checkboxClickRect")
      return enter
    })

  treeGroup.attr("transform",(d,i) =>`translate(0,${marginTop + (i * rowHeight)})`)

  treeGroup.select(".expandClickRect")
    .attr("display", (d) => !d.children && !d.data._children ? "none" : "block")
    .attr("cursor","pointer")
    .attr("width", treeWidth - iconWidthHeight - 10)
    .attr("height", rowHeight)
    .attr("fill","transparent")
    .on("click", (event, d) => {
      if(!d.children  && d.data._children){
        d.children = d.data._children;
        d.data._children = undefined;
      } else if (d.children !== undefined){
        d.data._children = d.children;
        d.children = undefined;
      }
      config.setCurrentTreeData(currentTreeData);
      drawTree();
    });

  treeGroup.select(".treeLabel")
    .attr("font-weight", 400)
    .attr("font-size", (d) => `${0.9 - depthExtra(d.depth,0.1)}rem`)
    .attr("dominant-baseline","middle")
    .attr("x",  (d) =>  iconWidthHeight + 5 + depthExtra(d.depth,15))
    .attr("y",   rowHeight/2)
    .attr("fill", (d) => colorScale(d.data.subModule))
    .text((d) => `${d.data.NAME}`)
    .on("mouseover", (event,d) => {
      if(d.data.type === "tier3"){
        d3.selectAll(".treeLabel")
          .attr("fill-opacity", (l) => l.data.NAME === d.data.NAME ? 0.7 : 1);
      }
    })
    .on("mouseout",() => {
      d3.selectAll(".treeLabel").attr("fill-opacity",  1);
    })
    .attr("cursor",(d) => d.data.type === "tier3" ? "pointer": "default")
    .on("click", (event, d) => {
      if(d.data.type === "tier3"){
        config.setNearestNeighbourOrigin(d.data.NAME);
        config.setTooltipRadio("none");
        d3.select("#search-input").property("value",d.data.name);
        config.setSelectedNodeNames(config.allNodeNames)
        config.setNotDefaultSelectedLinks([]);
        config.setNotDefaultSelectedNodeNames([]);
        config.setShortestPathStart("");
        config.setShortestPathEnd("");
        config.setShortestPathString("");
        d3.select(".animation-container").style("display", "flex");
        setTimeout(() => {
          renderGraph(false);
        }, 0); // or 16 for ~1 frame delay at 60fps
      }

    });

  treeGroup.select(".verticalLine")
    .attr("x1", 0)
    .attr("x2", treeWidth)
    .attr("y1", rowHeight )
    .attr("y2", rowHeight )
    .attr("stroke", "#A0A0A0")
    .attr("stroke-width", 0.25);

  treeGroup.select(".expandCollapseIcon")
    .attr("display", (d) => d.depth === 3 ? "none" : "block")
    .attr("width",  (d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("height",(d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("viewBox",(d) => !d.children ? rightArrowViewBox : standardViewBox)
    .attr("x",  (d) =>   depthExtra(d.depth,15))
    .attr("y", (d) => (rowHeight - iconWidthHeight + depthExtra(d.depth,2))/2);

  treeGroup.select(".expandCollapseIconPath")
    .attr("d", (d) => !d.children ? rightArrowPath : downArrowPath)
    .attr("fill", "#F0F0F0");

  treeGroup.select(".selectedCheckboxIcon")
    .style("display",config.graphDataType === "parameter" ? "block" : "none")
    .attr("width",  (d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("height",(d) => iconWidthHeight - depthExtra(d.depth,2))
    .attr("viewBox",standardViewBox)
    .attr("x",  (d) =>  treeWidth - 5 - (iconWidthHeight - depthExtra(d.depth,2)))
    .attr("y", (d) => (rowHeight - iconWidthHeight + depthExtra(d.depth,2))/2);

  treeGroup.select(".selectedCheckboxIconPath")
    .attr("d", (d) => getSelectedPath(d.data.type === "tier3" ? [d.data.NAME] : config.tier1And2Mapper[d.data.id]))
    .attr("fill", "#F0F0F0");

  treeGroup.select(".checkboxClickRect")
    .attr("cursor","pointer")
    .attr("x", treeWidth - iconWidthHeight - 10)
    .attr("width", iconWidthHeight + 10)
    .attr("height", rowHeight)
    .attr("fill","transparent")
    .on("click",(event, d) => {
      config.setNearestNeighbourOrigin("");
      config.setTooltipRadio("none");
      //reset url to blank
      history.replaceState(null, '', window.location.href.split("?")[0]);
      d3.select("#search-input").property("value","");
      if(d.data.type === "tier3") {
        if (config.selectedNodeNames.includes(d.data.NAME)) {
          // tier 3 (chart nodes) - currently selected
          // unselect all descendants
          config.setSelectedNodeNames(config.selectedNodeNames.filter((f) =>  f !== d.data.NAME))
        } else {
          // tier 3 (chart nodes) - current unselected;
          config.addToSelectedNodeNames(d.data.NAME);
        }
      } else if (config.graphDataType === "parameter"){
        const descendants = config.tier1And2Mapper[d.data.id];
        const selectedPath = getSelectedPath(descendants);
        if(selectedPath === allSelectedPath){
          config.setSelectedNodeNames(config.selectedNodeNames.filter((f) => !descendants.includes(f)))
        } else {
          // part or none selected === all all
          descendants.forEach((t) => {
            config.addToSelectedNodeNames(t);
          })
        }
      }
      config.setCurrentTreeData(currentTreeData);
      config.setShortestPathString("");
      drawTree();
      d3.select(".animation-container").style("display", "flex");
      setTimeout(() => {
        renderGraph(false);
      }, 0); // or 16 for ~1 frame delay at 60fps
    });

  d3.select(".animation-container").style("display", "none");
}


const saveSvgAsImage = (filename = 'image.png', type = 'image/png') => {
  // for download image button
  const scale = 3;
  const svgElement = d3.select(".baseSvg").node();
  const svgString = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function () {
    const canvas = document.createElement('canvas');
    canvas.width = (svgElement.viewBox.baseVal.width || svgElement.width.baseVal.value) * scale;
    canvas.height = (svgElement.viewBox.baseVal.height || svgElement.height.baseVal.value) * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    URL.revokeObjectURL(url);

    canvas.toBlob(function(blob) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = URL.createObjectURL(blob);
      link.click();
    }, type);
  };

  img.onerror = function (err) {
    console.error('Image load error:', err);
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

export function downloadCSV(data, filename = "data.csv") {
  if (!Array.isArray(data) || data.length === 0) {
    console.error("Invalid or empty data array.");
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","), // header row
    ...data.map(row =>
      headers.map(field => JSON.stringify(row[field] ?? "")).join(",")
    )
  ];

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// function called from main.js after initial render
export default function VariableTree(data) {

  const selectedNodeNamesCopy = JSON.parse(JSON.stringify(config.selectedNodeNames));

  // this could potentially be a property
  const startingDepth = 1;
  // hiding children beyond startingDepth - common d3 practice

  const setToStartingDepth = (dataset) => {
    dataset.descendants()
      .forEach((d) => {
        if(d.children){
          if(d.depth >= startingDepth){
            d.data._children = d.children;
            d.children = undefined;
          }
        }
      });
    return data;
  }

  // setting the tree config data
  const allExpandedData = data.copy();
  config.setExpandedTreeData(allExpandedData)
  const treeData = setToStartingDepth(data);
  const allCollapsedData = treeData.copy();
  config.setCollapsedTreeData(allCollapsedData);
  config.setCurrentTreeData(treeData);

  const initialTreeHeight = window.innerHeight - marginTop - 300;

  // Prevent the scroll event on the tree from affecting other elements
  d3.select(`#${treeDivId}`)
    .style("pointer-events", "auto")
    .on('wheel', function(event) {
      event.stopPropagation();
    })

  // append tree svg if there is one
  let svg = d3.select(`.${treeDivId}_svg`);
  if(svg.node() === null) {

    svg = d3.select(`#${treeDivId}`)
      .append("svg")
      .attr("class",`${treeDivId}_svg`)
      .attr("width", treeWidth)
      .attr("height", initialTreeHeight);

  } else {
    svg.attr("width", treeWidth)
      .attr("height", initialTreeHeight);
  }

  drawTree();
  renderGraph(true);

  // finally, set various buttons

  // download image
  d3.select("#downloadImage")
    .on("click", () => {
      saveSvgAsImage();
    })

  // download image
  d3.select("#downloadNNData")
    .on("click", () => {
      downloadCSV(config.notDefaultSelectedLinks,`NN_data_${config.nearestNeighbourOrigin}_degree${config.nearestNeighbourDegree}`);
    })

  // chart data radio - parameter, submodule, segment
  d3.selectAll(".chartDataRadio")
    .on("change", (event) =>  {
      const currentLayout = event.currentTarget.value;
      const baseUrl = window.location.href.split("?")[0];
      if(currentLayout === "segment"){
        history.replaceState(null, '', `${baseUrl}\?view=meso`);
      } else if (currentLayout === "parameter"){
        history.replaceState(null, '', `${baseUrl}\?view=variable`);
      } else {
        history.replaceState(null, '', baseUrl);
      }
      d3.select(".animation-container").style("display", "flex");
      d3.select(".tooltip").style("visibility","hidden");
      d3.selectAll("#search-input").property("value","");
       d3.select("#collapsibleMenuToggle")
        .style("display",currentLayout === "parameter" ? "block" : "none");
      config.setShortestPathString("");

      config.setGraphDataType(currentLayout);
      config.setNearestNeighbourOrigin("");
      config.setTooltipRadio("none");
      config.setCurrentLayout("default");
      config.setExpandedMacroMesoNodes([]);
      config.setMacroMesoUrlExtras([]);
      const getSelectedNames = () => {
        if(config.graphDataType === "parameter") return selectedNodeNamesCopy;
        if(config.graphDataType === "submodule") return config.hierarchyData.subModuleNames;
        return config.hierarchyData.segmentNames;
      }
      const selectedNames = getSelectedNames();
      const nodeNamesCopy = JSON.parse(JSON.stringify(selectedNames));
      config.setSelectedNodeNames(nodeNamesCopy);
      svg.selectAll(".selectedCheckboxIcon").style("display",config.graphDataType === "parameter" ? "block" : "none")
      svg.selectAll(".selectedCheckboxIconPath")
        .attr("d", (d) => getSelectedPath(d.data.type === "tier3" ? [d.data.NAME] : config.tier1And2Mapper[d.data.id]))
      if(currentLayout === "parameter"){
        if(config.clickedMMVariable !== ""){
          config.setNearestNeighbourOrigin(config.clickedMMVariable);
          config.setMMClickedVariable("");
        }
      }
      setTimeout(() => {
        renderGraph(config.graphDataType !== "parameter");
      }, 0); // or 16 for ~1 frame delay at 60fps

    });


  const showParameters = d3.select("#viewParams");

  showParameters.on("change",(event) => {
    d3.select(".animation-container").style("display", "flex");
    const showParameters = event.target.checked;
    config.setShowParameters(showParameters);
    setTimeout(() => {
      renderGraph(config.graphDataType !== "parameter");
    }, 0); // or 16 for ~1 frame delay at 60fps
  })

  // collapse expand button
  d3.select("#collapseExpandButton")
    .text("expand ALL")
    .on("click",(event) => {
      const text = d3.select(event.currentTarget).text();
      const newText = text === "expand ALL" ? "collapse ALL" : "expand ALL"
      if(text === "expand ALL"){
        // convert all _children to children
        d3.select(event.currentTarget).text("...")
        config.setCurrentTreeData(config.expandedTreeData);

      } else {
        // switch back to startingDepth
        config.setCurrentTreeData(config.collapsedTreeData)
      }
      d3.select(event.currentTarget).text(newText);
      d3.select(".animation-container").style("display", "flex");
      setTimeout(() => {
        drawTree();
      }, 0); // or 16 for ~1 frame delay at 60fps

    });

  // and handle resizing
  const resizeThrottle = (func, limit) => {
    // from chatGPT - stops it resizing every nanosecond
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

// Your resize handler function
  function handleResize() {
    // redraw tree on resize so container size matches tree size
    treeWidth = remToPx(18) - 20;
    svg.attr("width", treeWidth);
    // resizing main svg (not re-rendering chart due to load/rendering time)
    let mainAppSvg = d3.select(mainAppContainerSelector).select("svg");
    mainAppSvg.attr("width", window.innerWidth).attr("height",window.innerHeight);
    drawTree();
  }

// Add throttled event listener which redraws the tree every 0.1 second rather than nanosecond
  window.addEventListener("resize", resizeThrottle(handleResize, 100));

}
