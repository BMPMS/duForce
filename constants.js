export const useDefaults = true;
export const LINK_COLOR = "#C0C0C0";
export const PARAMETER_CLUSTER_STRENGTH = 0.2;
export const LINK_ARROW_COLOR = "#737373";
export const COLOR_SCALE_RANGE = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#56B4E9",
  "#F0E442",
  "#999999",
  "#E69F00",
  "#64C4CD",
  "#6A0DAD",
  "#BADA55"]

// node size range - always on a continuous scale based on the # of connections
//export const NODE_RADIUS_RANGE = [1, 50];
export const NODE_RADIUS_RANGE = [3,30];
// keep them small for rendering (ie 1 to 50 is better than 15 to 100)
// previous version (Sept 2025) was [6, 40];

// I've also created a distinct range for Macro, Meso
// in these views the sizing is based on the # of parameters in the group (so all parameters are the same size)
export const NODE_RADIUS_RANGE_MACRO_MESO = [4,30];

export const MACRO_MESO_RADII = [40,15,5]
// FORCE PARAMETERS
export const RADIUS_COLLIDE_MULTIPLIER = 1.5;
// the amount of space around the node - 2.5 * radius seems to work quite well
// this is a play off between too much space and the labels overlapping

// I've set a maximum for this as well so there is not a crazy gap around the larger nodes
// (which have space for labels anyway)
// it should never go lower than the NODE_RADIUS_RANGE max
export const LINK_FORCE_STRENGTH = 0.1;
// the strength of the force pulling the nodes together based on their connections
// 0 will group by submodule
// 1 was where you had it originally
// it was on 0.2 for the previous demo...

export const SIMULATION_TICK_TIME = 450; // 300 is the d3 default.
// I wouldn't recommend going lower than 300 as it needs time to place the nodes
// You could experiment with higher, see if positioning is more optional - higher the value, longer it takes.

export const LABEL_FONT_BASE_REM = 0.4;
// these are the messages top middle
export const MESSAGES = {"noSP": "There is no shortest path between the selected nodes",
  "SP" : "Search for nodes to find the Shortest Path",
  "NN" : "Search for nodes to find the Nearest Neighbour",
}
// parameters you want to show in tooltip
export const TOOLTIP_KEYS = ['NAME',"DISPLAY_NAME", "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"];

// various other colour palettes we've looked at for reference in case you need to switch again

export const observable11 = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab",
  "#17becf"
]
export const tableau11 = ['#4E79A7', '#F28E2C', '#E15759', '#76B7B2', '#59A14F', '#EDC949', '#AF7AA1', '#FF9D9A', '#9C755F', '#BAB0AB', '#17BECF']
export const gestalt = [
  "#005FCB",
  "#B190FF","#FDA600","#75BFFF","#DE2C62","#A4F9AC","#812AE7","#FF5B45","#007A72","#F76593","#FFC58F"

]

// palette you wanted to switch to already here -switch from this one.
export const palette_Aug_Sep_25 = [
  "#418BFC",
  "#46BCC8",
  "#D6AB1B",
  "#EB5E68", "" +
  "#B6BE1C",
  "#F64D1A",
  "#BA6DE4",
  "#EA6BCB",
  "#B9AAC8",
  "#F08519",
  "#C0C0C0"
];
