export const getSubModuleColours = (subModuleNames,colorScale) =>  subModuleNames.reduce((acc, entry) => {

  acc.push({
    name: entry,
    fill: colorScale(entry)
  })
  return acc;
},[]);
export const convertNodes = (nodes, graphDataType, subModuleColors,nodeRadiusRange,nodeRadiusScale) => nodes.reduce((acc, node) => {
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
  node.radiusVar = graphDataType === "parameter" ? node.linkCount : node.type || node.data?.type;
  node.radius = (node.isParameter || node.data?.isParameter && graphDataType === "parameter") ?  nodeRadiusRange[0] : nodeRadiusScale(node.radiusVar);
  node.group = node.subModule || node.data.subModule;
  acc.push(node);
  return acc;
}, [])
export const getSimulation = (d3,graphDataType, linkForceStrength,radiusCollideMultiplier,subModuleNodes,width, height) => {
  const xWeight = width > height ? 0.7 : 1;
  const yWeight = width > height ? 1 : 0.7;

  const getSubModulePositions = () => {
    const submoduleLeaves = subModuleNodes.map((m) =>  ({name: m.id || m.data?.id,value: d3.sum(m.leaves(), (s) => s.data.linkCount)}));
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
  return d3
    .forceSimulation()
    .force("charge", d3.forceManyBody().strength(graphDataType !== "parameter"  ? 0 : -300))
    .force("link", d3.forceLink().id((d) => d.id).strength((link) => {
      const isParameter = link.source.data?.isParameter || link.target.data?.isParameter;
      if(graphDataType !== "parameter" || isParameter){
        return 0
      } // default from https://d3js.org/d3-force/link as distance doesn't matter here
      // return 0
      return linkForceStrength
    }))
    .force("x", d3.forceX((d) => graphDataType === "parameter" ? submodulePositions[d.subModule].x :width/2).strength( graphDataType !== "parameter"  ? xWeight * 0.04 : xWeight * 0.15))
    .force("y", d3.forceY((d) => graphDataType === "parameter" ? submodulePositions[d.subModule].y :width/2).strength( graphDataType !== "parameter"  ? yWeight * 0.04 :yWeight * 0.15))
    .force("collide", d3.forceCollide() // change segment when ready
      .radius((d) => d.radius * (graphDataType === "parameter" ? radiusCollideMultiplier : 4))
      .strength(1)
      .iterations(30)
    ) // change segment when ready
    .force("cluster", forceCluster()) // cluster all nodes belonging to the same submodule.


  function forceCluster() {
    //const strength =  config.graphDataType === "parameter" ? 0.3 : 0.6 ;
    const strength = graphDataType === "parameter" ? 0.2 : 0.4
    const parentStrength = 0.05;
    let nodes;
    function force(alpha) {

      if(graphDataType === "parameter"){
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
}


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




