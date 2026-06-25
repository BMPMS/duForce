
import path, { dirname, join } from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";


const d3 = await import('d3');

const layouts = [
  { name: 'landscape', width: 1920, height: 1080 },
  { name: 'portrait', width: 1080, height: 1920 },
  { name: 'square', width: 1400, height: 1400 }
];

async function generatePositions(layout,subModuleNodes,nodes, links,getSimulation) {
  const {width,height} = layout;

  const simulation = getSimulation(d3,"parameter",0.05,1.5,subModuleNodes,width,height)
  console.log('Running simulation for layout.  It may take a few minutes, please be patient.', layout)
  simulation.stop();
  simulation.nodes(nodes).force("link").links(links);
  // restart simulation
  simulation.alphaTarget(0.1).restart();
  // stop at calculated tick time (from previous dev)
  simulation.tick(500);
  // stop simulation
  simulation.stop();

  return nodes.reduce((acc, node) => {
    acc[node.id] = { x: node.x, y: node.y };
    return acc
  }, {})

}


async function run() {

  try {

    console.log('Starting layout generation...');
    const { convertNodes, getSimulation,getSubModuleColours } = await import('./layout-functions.mjs');
    const {COLOR_SCALE_RANGE, NODE_RADIUS_RANGE} = await import('../chart_js/constants.mjs')
    const __dirname = dirname(fileURLToPath(import.meta.url));

    const [convertedData] = await Promise.all([
      readFile(join(__dirname, '../assets/convertedData.json'), 'utf8').then(JSON.parse),
     ]);

    // Basic validation
    if (!convertedData) {
      throw new Error('convertedData() returned no data');
    }
    console.log('File read succesfully...');

    const {parameterData,hierarchyData} = convertedData;
    const {nodes,links} = parameterData;
    const treeData = d3.hierarchy(hierarchyData);
    const nodesCopy = treeData.copy()
    const subModuleNodes = nodesCopy.descendants().filter((f) => f.depth === 1);
    const subModuleNames = subModuleNodes.map((m) => m.data.id);

    const colorRange = COLOR_SCALE_RANGE;
    const colorScale = d3.scaleOrdinal().domain(subModuleNames).range(colorRange);
    console.log('color scale ok')
    const subModuleColors = getSubModuleColours(subModuleNames,colorScale);
    const nodeRadiusRange = NODE_RADIUS_RANGE
    const nodeRadiusScale = d3.scaleSqrt()
      .domain([0, d3.max(nodes, (d) => d.linkCount)])
      .range(nodeRadiusRange)
      .clamp(true)
    console.log('node radius scale ok')
    const convertedNodes = convertNodes(nodes, "parameter", subModuleColors,nodeRadiusRange,nodeRadiusScale)
    console.log('convert nodes  ok')
    for (const layout of layouts) {
      const formattedData = await generatePositions(layout, subModuleNodes, convertedNodes, links,getSimulation);
      console.log(layout, 'format data ok')
      const outputPath = path.resolve(__dirname, `../assets/defaultNodePositions_${layout.name}.json`);
      const backupPath = path.resolve(__dirname, `../assets_backup/defaultNodePositions_${layout.name}-backup.json`);
      const tempPath = `${outputPath}.tmp`;

      const json = JSON.stringify(formattedData, null, 2);

      if (fs.existsSync(outputPath)) {
        fs.copyFileSync(outputPath, backupPath);
        console.log(`Backup created for ${layout.name}`);
      }

      fs.writeFileSync(tempPath, json, 'utf8');
      fs.renameSync(tempPath, outputPath);

      console.log(`Written: defaultNodePositions_${layout.name}.json`);
    }



  } catch (error) {
    console.error('\nGeneration failed');
    console.error(error);

    process.exit(1);
  }
}

run();
