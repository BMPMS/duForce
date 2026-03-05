// config.js

import {  LABEL_FONT_BASE_REM,
  LINK_FORCE_STRENGTH,
  NODE_RADIUS_RANGE,
  PARAMETER_CLUSTER_STRENGTH,
  RADIUS_COLLIDE_MULTIPLIER, SIMULATION_TICK_TIME,
} from "./constants";

export const config = {
  // default settings
  currentLayout: "default", // 3 options - "default", "nearestNeighbour", "shortestPath"
  graphDataType: "submodule", // 3 options - "submodule", "segment", "parameter"
  initialLoadComplete: false,
  nearestNeighbourOrigin: "",
  nearestNeighbourDegree: 1,
  shortestPathStart: "",
  shortestPathEnd: "",
  shortestPathString: "",
  showSingleNodes: false,
  // graph data set on initial load
  allNodeNames: [],
  noParameterAllNodeNames:[],
  totalNodeCount: 0,
  noParameterNodeCount: 0,
  expandedMacroMesoNodes: [],
  hierarchyData: {subModuleNames: [], subModuleNodes: [], segmentNames: [],segmentNodes:[], mmLinks: [], segmentSubmoduleMapper:{}},
  parameterData: {},
  // tree data set on initial load
  expandedTreeData: {}, // stored for expandAll button
  collapsedTreeData: {}, // stored for collapseAll button
  currentTreeData: {}, // current tree expansion status
  tier1And2Mapper: {},// used when collapsing/expanding tree
  // set after initial default load
  defaultNodePositions:{},
  // arrays used for selected nodes (notDefault for NN + SP layouts)
  selectedNodeNames: [],
  notDefaultSelectedNodeNames: [],
  notDefaultSelectedLinks: [],
  tooltipRadio: "none", // used to toggle visibility of tooltipRadio button visible on NN
  macroMesoUrlExtras: [],
  nnUrlView: false,
  visibleVariableLinks:[],
  // config constants testing variables
  showParameters: false,
  clickedMMVariable: "",
  setVisibleVariableLinks(newArray) {
    if (typeof newArray === "object") {
      this.visibleVariableLinks = newArray;
    } else {
      console.error("Expected an array for visibleVariableLinks.");
    }
  },
  setMMClickedVariable(newString) {
    if (typeof newString === "string") {
      this.clickedMMVariable = newString;
    } else {
      console.error("Expected a string for clickedMMVariable.");
    }
  },
  setShowParameters(newBoolean) {
    if (typeof newBoolean === "boolean") {
      this.showParameters = newBoolean;
    } else {
      console.error("Expected a boolean for showParameters.");
    }
  },
  setShortestPathString(newString) {
    if (typeof newString === "string") {
      this.shortestPathString = newString;
    } else {
      console.error("Expected a string for shortestPathString.");
    }
  },

  setNNUrlView(newBoolean) {
    if (typeof newBoolean === "boolean") {
      this.nnUrlView = newBoolean;
    } else {
      console.error("Expected a boolean for nnUrlView.");
    }
  },

  setMacroMesoUrlExtras(newArray) {
    if (typeof newArray === "object") {
      this.macroMesoUrlExtras = newArray;
    } else {
      console.error("Expected an string for setMacroMesoUrlExtras.");
    }
  },
  setExpandedMacroMesoNodes(newArray) {
    if (typeof newArray === "object") {
      this.expandedMacroMesoNodes = newArray;
    } else {
      console.error("Expected an object for expandedMacroMesoNodes.");
    }
  },
  setTooltipRadio(newString) {
    if (typeof newString === "string") {
      this.tooltipRadio = newString;
    } else {
      console.error("Expected an string for tooltipRadio.");
    }
  },
  setHierarchyData(newObject) {
    if (typeof newObject === "object") {
      this.hierarchyData = newObject;
    } else {
      console.error("Expected an array for hierarchyData.");
    }
  },
  setParameterData(newObject) {
    if (typeof newObject === "object") {
      this.parameterData = newObject;
    } else {
      console.error("Expected an array for parameterData.");
    }
  },
  // Method to update the nodes array
  setTier1And2Mapper(newObject) {
    if (typeof newObject === "object") {
      this.tier1And2Mapper = newObject;
    } else {
      console.error("Expected an array for tier1And2Mapper.");
    }
  },
  setAllNodeNames(newObject) {
    if (typeof newObject === "object") {
      this.allNodeNames = newObject;
    } else {
      console.error("Expected an array for allNodeNames.");
    }
  },
  setNoParameterAllNodeNames(newObject) {
    if (typeof newObject === "object") {
      this.noParameterAllNodeNames = newObject;
    } else {
      console.error("Expected an array for allNodeNames.");
    }
  },
  setTotalNodeCount(newNumber) {
    if (typeof +newNumber === "number") {
      this.totalNodeCount = +newNumber;
    } else {
      console.error("Expected an array for totalNodeCount.");
    }
  },
  setNoParameterNodeCount(newNumber) {
    if (typeof +newNumber === "number") {
      this.noParameterNodeCount = +newNumber;
    } else {
      console.error("Expected an array for noParameterNodeCount.");
    }
  },
  setNearestNeighbourDegree(newNumber) {
    if (typeof +newNumber === "number") {
      this.nearestNeighbourDegree = +newNumber;
    } else {
      console.error("Expected an array for nearestNeighbourDegree.");
    }
  },
  setDefaultNodePositions(newObject) {
    if (typeof newObject === "object") {
      this.defaultNodePositions = newObject;
    } else {
      console.error("Expected an object for defaultNodePositions.");
    }
  },
  setNotDefaultSelectedLinks(newObject) {
    if (typeof newObject === "object") {
      this.notDefaultSelectedLinks = newObject;
    } else {
      console.error("Expected an array for notDefaultSelectedLinks.");
    }
  },
  setNearestNeighbourOrigin(newNodeName) {
    if (typeof newNodeName === "string") {
      this.nearestNeighbourOrigin = newNodeName;
    } else {
      console.error("Expected an array for nearestNeighbourOrigin.");
    }
  },
  setShortestPathStart(newNodeName) {
    if (typeof newNodeName === "string") {
      this.shortestPathStart = newNodeName;
    } else {
      console.error("Expected an array for shortestPathStart.");
    }
  },
  setShortestPathEnd(newNodeName) {
    if (typeof newNodeName === "string") {
      this.shortestPathEnd = newNodeName;
    } else {
      console.error("Expected an array for shortestPathEnd.");
    }
  },
  setCollapsedTreeData(newObject) {
    if (typeof newObject === "object") {
      this.collapsedTreeData = newObject;
    } else {
      console.error("Expected an array for collapsedTreeData.");
    }
  },
  setExpandedTreeData(newObject) {
    if (typeof newObject === "object") {
      this.expandedTreeData = newObject;
    } else {
      console.error("Expected an array for expandedTreeData.");
    }
  },
  setCurrentTreeData(newObject) {
    if (typeof newObject === "object") {
      this.currentTreeData = newObject;
    } else {
      console.error("Expected an array for currentTreeData.");
    }
  },
  setSelectedNodeNames(newArray) {
    if (Array.isArray(newArray)) {
      this.selectedNodeNames = newArray;
    } else {
      console.error("Expected an array for setSelectedNodeName.");
    }
  },
  setNotDefaultSelectedNodeNames(newArray) {
    if (Array.isArray(newArray)) {
      this.notDefaultSelectedNodeNames = newArray;
    } else {
      console.error("Expected an array for notDefaultSelectedNodeNames.");
    }
  },
  addToSelectedNodeNames(newName) {
    if (typeof newName === 'string') {
      if(!this.selectedNodeNames.some((s) => s === newName)){
        this.selectedNodeNames.push(newName);
      }
    } else {
      console.error("Expected an array for setSelectedNodeName.");
    }
  },

  // Method to update the layout type
  setCurrentLayout(newLayout) {
    if (typeof newLayout === 'string') {
      this.currentLayout = newLayout;
    } else {
      console.error("Expected a string for currentLayout.");
    }
  },
  // Method to update the layout type
  setGraphDataType(newType) {
    if (typeof newType === 'string') {
      this.graphDataType = newType;
    } else {
      console.error("Expected a string for setGraphDataType.");
    }
  },
  // Method to set the showSingle explicitly
  setShowSingleNodes(value) {
    if (typeof value === 'boolean') {
      this.showSingleNodes = value;
    } else {
      console.error("Expected a boolean for showSingleNodes.");
    }
  },

  // Method to set the showSingle explicitly
  setInitialLoadComplete(value) {
    if (typeof value === 'boolean') {
      this.initialLoadComplete = value;
    } else {
      console.error("Expected a boolean for initialLoadComplete.");
    }
  }
};
