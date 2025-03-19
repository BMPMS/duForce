import * as d3 from "d3";

export default function VariableTree(nodes, THRESHOLD) {
  const ROOT = { id: "ROOT" };

  // Create the submodule nodes
  const SUBMODULES = [...new Set(nodes.filter((d) => d.SUBMODULE > THRESHOLD).map((d) => d.SUBMODULE))]
    .filter((d) => d)
    .map((d) => {
      const node = nodes.find((n) => n.SUBMODULE === d);
      return {
        id: "submodule-" + d,
        parent: "ROOT",
        NAME: node.SUBMODULE_NAME,
        type: "tier1",
      };
    });

  // Create the segment nodes for each submodule node
  const SEGMENTS = [...new Set(nodes.filter((d) => d.SEGMENT && d.SUBMODULE && +d.SUBMODULE > THRESHOLD).map((d) => d.SUBMODULE + "_" + d.SEGMENT))]
    .filter((d) => d !== "null_null")
    .map((d) => {
      const node = nodes.find((n) => n.SUBMODULE === +d.split("_")[0] && n.SEGMENT === +d.split("_")[1]);
      return {
        id: "segment-" + d,
        parent: "submodule-" + d.split("_")[0],
        NAME: node.SEGMENT_NAME,
        type: "tier2",
      };
    });

  let data = [ROOT];

  nodes.forEach((d) => {
    let parent;
    if (d.type === "tier1") {
      parent = "ROOT";
    } else if (d.type === "tier2") {
      parent = "submodule-" + d.SUBMODULE;
    } else {
      parent = "segment-" + d.SUBMODULE + "_" + d.SEGMENT;
    }
    data.push({
      parent,
      id: d.id,
      NAME: d.NAME,
      type: d.type,
    });
  });

  data = data.concat(SUBMODULES).concat(SEGMENTS);

  const uniqueObjects = {};
  const deduplicatedArray = [];
  data.forEach((obj) => {
    uniqueObjects[obj["id"]] = obj;
  });

  for (const key in uniqueObjects) {
    deduplicatedArray.push(uniqueObjects[key]);
  }
  data = deduplicatedArray;

  // Node content
  function renderNode(selection, rcd) {
    selection.append("span").text(rcd.NAME);

    if (rcd.parent === "ROOT" || rcd.type === "tier1" || rcd.type === "tier2") return;

    selection.append("input").attr("type", "checkbox");
  }

  // Recursively append child nodes
  function nextLevel(selection, node) {
    const label = selection.append("span").attr("class", "list-label-" + node.depth);
    const arrow = label.append("span").classed("arrow", true);
    label.call(renderNode, node.data);
    if (!node.hasOwnProperty("children")) return;
    const items = selection
      .append("ul")
      .style("list-style-type", "none")
      .selectAll("li")
      .data(node.children, (d) => d.NAME);
    items.exit().remove();
    items
      .enter()
      .append("li")
      .attr("class", "list-item-" + node.depth)
      .style("cursor", "pointer")
      .merge(items)
      .each(function (d) {
        d3.select(this).call(nextLevel, d);
      });
    label.select(".arrow").text("▼ ");
    // .on("click", function () {
    //   // Collapse on click
    //   const childList = selection.select("ul");
    //   if (!childList.size()) return;
    //   const expanded = childList.style("display") !== "none";
    //   d3.select(this).text(expanded ? "▶ " : "▼ ");
    //   childList.style("display", expanded ? "none" : "inherit");
    // });
  }

  // Generate tree view
  function tree(selection) {
    selection.classed("viewport", true).style("overflow-y", "scroll").style("height", "calc(100vh - 170px)").append("div").classed("body", true).style("transform", "scale(1.5)").style("transform-origin", "top left");
  }

  // Update tree data
  function updateTree(selection, items) {
    const root = d3
      .stratify()
      .id((d) => d.id)
      .parentId((d) => d.parent)(items);

    // Sort the tree structure
    root.eachBefore((d) => {
      if (d.children) {
        d.children.sort((a, b) => a.data.id.localeCompare(b.data.id));
      }
    });

    selection.select(".body").call(nextLevel, root);
    // Remove dummy root node
    selection.select(".body > span").remove();
    selection.select(".body > ul").style("padding-left", 0);
  }

  // Render
  d3.select("#view div").remove();
  d3.select("#view").append("div").call(tree).call(updateTree, data);
}
