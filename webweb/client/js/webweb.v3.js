/*
 * webweb makes pretty interactive network diagrams in your browser
 * version 3.4
 *
 * Daniel Larremore + Contributors
 * August 29, 2018
 * daniel.larremore@colorado.edu
 * http://github.com/dblarremore/webweb
 * Comments and suggestions always welcome.
 *
 */
/*
 * Here are default values. If you don't put anything different in the JSON file, this is what you get!
 * w width
 * h height
 * c charge
 * l length of edges
 * r radius of nodes
 * g gravity
 */
var w = 800;
var h = 800;
var c = 60;
var l = 20;
var r = 5;
var g = 0.1;

var netNames, netName;
var N;
var links = [];
var nodes = [];
var node, force;

var scaleSize, scaleColorScalar, scaleColorCategory;
var scaleLink, scaleLinkOpacity;

var colorType, sizeType, colorKey, sizeKey;
var rawColors, rawSizes, sizes, colors, cats, catNames;

var nameToMatch, R, isHighlightText;

var isStartup;

var colorLabels, sizeLabels;

/*
 * Dynamics and colors
 */
// tick attributes for links and nodes
function tick() {
    link.attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });
    node.attr("cx", function(d) { return d.x; })
        .attr("cy", function(d) { return d.y; })
}

// This function is poorly named. 
// It is called when loading a network or changing networks
// It rebuilds links, labels, and menus, accordingly
function computeLinks(net) {
    // Update the name
    netName = net;

    // Remove all the links in the list of links.
    links.splice(0, links.length);
    draw();

    // get the adjacencies
    adj = d3.values(wwdata["network"][netName]["adjList"]);

    // learn how we should scale the link weight and opacity by computing the range (extent) of the adj weights.
    scaleLink.domain(d3.extent(d3.transpose(adj)[2]));
    scaleLinkOpacity.domain(d3.extent(d3.transpose(adj)[2]));

    // make a matrix here so that we can intelligently compute node "weights"
    var matrix = {}
    for (var i in nodes) {
        matrix[i] = {};
    }

    // push all the links to the list: links
    for (var i in adj) {
        var edge = adj[i];
        var source = edge[0];
        var target = edge[1];
        var weight = edge[2];

        links.push({
            source: source,
            target: target,
            w: weight,
        })

        if (! matrix[source][target]) {
            matrix[source][target] = weight;
            matrix[target][source] = weight;

            nodes[source].weight += weight;
            nodes[target].weight += weight;
        }
    }

    setLabels();

    updateSizeMenu();
    updateColorMenu();

    draw();
}

// Compute the actual radius multipliers of the nodes, given the data and chosen parameters
// Input, x, is the method by which we will compute the radii
// For example, if x is None, then the multiplier is 1, the identity
// Otherwise, the multiplier can be something else!
function computeSizes(x) {
    rawSizes = [];
    sizes = [];

    // If there's no degree scaling, set all sizes to 1
    if (x == "none") {
        sizeType = "none";
        for (var i in nodes) {
            sizes[i] = 1;
        }
        return;
    }
    else {
        // If we're scaling by degrees, linearly scale the range of SQRT(degrees) between 0.5 and 1.5
        if (x == "degree") {
            sizeType = "degree";
            for (var i in nodes){
                rawSizes[i] = nodes[i].weight;
                sizes[i] = Math.sqrt(rawSizes[i]);
            }
        }
        else {
            var label = sizeLabels[x];

            sizeType = label.type;
            for (var i in nodes) {
                sizes[i] = label.value[i];
            }

            rawSizes = sizes.slice(0);
        }

        scaleSize.domain(d3.extent(sizes), d3.max(sizes)).range([0.5,1.5]);
        for (var i in sizes) {
            sizes[i] = scaleSize(sizes[i]);
        }
    }
}
// Highlight a node by making it bigger and outlining it
function highlightNode(d) {
    d3.select("#node_" + d.idx)
        .transition().duration(100)
        .attr("r", sizes[d.idx] * r * 1.3)
        .style("stroke", d3.rgb(0,0,0));
}
// Highlight a node by showing its name next to it.
// If the node has no name, show its index.  
function highlightText(d) {
    if (d == "stop") {
        isHighlightText = false; 
        return
    }
    else if (d == "start") {
        isHighlightText = true; 
        return
    }
    if (isHighlightText){
        var nodeName = "node";
        var nodeId = d.idx;
        if (d.name !== undefined) {
            nodeName = d.name;
            nodeId = "(" + nodeId + ")";
        }

        var highlightTextString = "This is " + nodeName + " " + nodeId;

        vis.append("text").text(highlightTextString)
            .attr("x", d.x + 1.5 * r)
            .attr("y", d.y - 1.5 * r)
            .attr("fill", "black")
            .attr("font-size", 12)
            .attr("id", "highlightText");
    }
}
// Returns a node's highlighted size and stroke to normal
function unHighlightNode(d) {
    if (nameToMatch == "" || d.name.indexOf(nameToMatch) < 0) {
        d3.select("#node_" + d.idx)
            .transition()
            .attr("r",sizes[d.idx]*r)
            .style("stroke",d3.rgb(255,255,255));
    }
}
// Removes a node's highlighted name 
function unHighlightText() {
    vis.selectAll("#highlightText").remove();
}
// Similar to computeSizes, this function computes the colors for the nodes
// based on the preferences of the user chosen in the dropdown menus.
// The argument of this function, x, is a string representing the color choice. 
function computeColors(x) {
    // no colors
    if (x == "none"){
        colorType = "none";

        // set all nodes to dark grey 100
        for (var i in nodes) { 
            colors[i] = d3.rgb(100,100,100);
        }
    }
    // by degree
    else if (x == "degree"){
        // we'll treat degree as a scalar
        colorType = x;

        // raw values are weights
        for (var i in nodes) {
            rawColors[i] = nodes[i].weight;
        }

        // scaled values mapped to 0...1
        scaleColorScalar.domain(d3.extent(rawColors)).range([0,1]);

        // get colors by passing scaled value to colorWheel
        for (var i in nodes) {
            colors[i] = colorWheel(nodes[i].weight);
        }
    }
    else {
        var label = colorLabels[x];
        colorType = label.type;

        for (var i in nodes){
            rawColors[i] = label.value[i];
        }

        catNames = [];
        cats = [];

        // get the category names if it's categorical
        if (colorType == "categorical") {
            catNames = label.categories;
        }
        // if we didn't set categories above, then catNames will be undefined
        // and this code will run, setting the categories and their names to scalars
        if (catNames == undefined){
            var q = d3.set(rawColors).values();
            q.sort();
            catNames = [];
            for (i in q) {
                cats[i] = q[i];
                catNames[i] = q[i];
            };
        }
        else {
            // Check to see if our cats are numeric or labels
            if (isNaN(d3.quantile(rawColors,0.25))) {
                cats = catNames.sort();
            }
            else {
                for (i in catNames){
                    cats[i] = i;
                };
            }
        }

        // We think it's categorical...
        if (colorType == "categorical") {
            // but let's check because we can only have up to 9 categorical colors
            if (Object.keys(catNames).length <= 9) {
                var color_palate = getColorPalate();
                // scaled values mapped using colorBrewer
                scaleColorCategory.domain(cats).range(colorbrewer[color_palate][Object.keys(catNames).length]);

                for (var i in nodes){
                    colors[i] = colorWheel(rawColors[i]);
                }
            }
            else {
                // if we thought we had categories but we have too many, treat like scalars
                colorType = "scalarCategorical";

                // scaled values mapped to 0...1
                scaleColorScalar.domain(d3.extent(rawColors)).range([0,1]);

                for (var i in nodes){
                    colors[i] = colorWheel(rawColors[i]);
                }
            }
        }
        else {
            // scaled values mapped to 0...1
            scaleColorScalar.domain(d3.extent(rawColors)).range([0,1]);

            for (var i in nodes){
                colors[i] = colorWheel(rawColors[i]);
            }
        }
    };
}
// ColorWheel is a function that takes a node label, like a category or scalar
// and just gets the damn color. But it has to take into account what the 
// current colorType is. Basically, this is trying to apply our prefs to colors
function colorWheel(x) {
    if (isNaN(x)) {
        if (colorType == "categorical" && typeof(x) == "string"){
            return scaleColorCategory(x);
        }
        else {
            return d3.rgb(180, 180, 180)};
    }

    if (colorType == "categorical") {
        return scaleColorCategory(x);
    }
    else if (colorType == "scalar" || colorType == "scalarCategorical" || colorType == "degree") {
        // Rainbow HSL
        return d3.hsl(210 * (1 - scaleColorScalar(x)), 0.7, 0.5);
        // Greyscale
        // return [0.8*255*x,0.8*255*x,0.8*255*x];
        // Copper
        // return [255*Math.min(x/0.75,1),0.78*255*x,0.5*255*x];
    }
    else if (colorType == "binary") {
        if (!x) {
            return d3.rgb(30, 100, 180)
        }
        else {
            return d3.rgb(102, 186, 30)
        };
    }
}
/*
 * Menu interaction
 * These functions are bound to the various menus that we create in the GUI.
 * On menu change, one of these will be called. 
 */
function changeSizes(x) {
    sizeKey = x;
    computeSizes(x);
    redrawNodes();
    computeLegend();
    if (nameToMatch != "") {
        matchNodes(nameToMatch)
    };
}
function changeColors(x) {
    colorKey = x;
    computeColors(x);
    redrawNodes();
    computeLegend();
    if (nameToMatch != "") {
        matchNodes(nameToMatch)
    };
}
function setColorPalate(color_palate) {
    computeColors(colorKey);
    redrawNodes();
    computeLegend();
}

function changeCharge(x) {
    if (x >= 0) {
        force.charge(-x);
        force.start();
    }
    else {
        alert("Repulsion must be nonnegative.");
    }
}
function changer(x) {
    r = x;
    redrawNodes();
    computeLegend();
}
function changeDistance(x) {
    if (x >= 0) {
        force.linkDistance(x);
        force.start();
    }
    else {
        alert("Distance must be nonnegative.");
    }
}
function changeLinkStrength(x) {
    if (x >= 0) {
        force.linkStrength(x);
        force.start();
    }
    else {
        alert("Distance must be nonnegative.");
    }
}
function changeGravity(x) {
    if (x >= 0) {
        force.gravity(x);
        force.start();
    }
    else {
        alert("Gravity must be nonnegative.");
    }
}
function toggleDynamics(isDynamics) {
    if (!isDynamics)
    {
        force.stop();
        for (var i = 0; i < force.nodes().length; i++) {
            force.nodes()[i].fixed = true;
        }
    }
    else {
        for (var i = 0; i < force.nodes().length; i++) {
            force.nodes()[i].fixed = false;
        }
        node.call(force.drag)
        force.resume();
    }
}
function toggleLinkWidthScaling(checked) {
    if (checked) {
        scaleLink.range([0.5, 4]);
    }
    else {
        scaleLink.range([1, 1]);
    }
    redrawLinks();
}
function toggleLinkOpacity(checked) {
    if (checked) {
        scaleLinkOpacity.range([0.4, 0.9])
    }
    else {
        scaleLinkOpacity.range([1, 1]);
    }
    redrawLinks();
}
function matchNodes(x) {
    nameToMatch = x;
    if (x.length == 0){
        nodes.forEach(function(d) {
            unHighlightNode(d);
        });
    }
    else {
        nodes.forEach(function(d) {
            if (d.name.indexOf(nameToMatch) < 0) {
                unHighlightNode(d);
            }
            else {
                highlightNode(d);
            }
        })
    }
}
/*
 * Drawing
 * All the functions here have to do with actually creating objects in the canvas.
 */
function redrawNodes() {
    nodes.forEach(function(d, i) {
        d3.select("#node_" + d.idx)
            .attr("r", sizes[i] * r)
            .style("fill", d3.rgb(colors[i]));
    });
}
function redrawLinks() {
    links.forEach(function(d, i) {
        d3.select("#link_" + i)
            .transition()
            .style("stroke-width", function(d){
                if (d.w == 0) {
                    return 0;
                }
                else {
                    return scaleLink(d.w);
                }
            })
        .style("stroke-opacity", function(d) {
            return scaleLinkOpacity(d.w)
        });
    })
}
// This function is rather complicated.
// We want to draw a legend for the sizes and colors.
// If they are bound to the same attribute, we should have a single color/size combined legend
// If they are bound to different attributes, we should keep them separate.
// We generally prefer integer boundaries in our legends... but only if the values
// that are getting passed in are integers... etc. This code steps through what
// we think of as standard human preferences.
function computeLegend() {
    var colorsLegend = [];
    var sizesLegend = [];
    var sizesLegendText = [];
    var colorsLegendText = [];
    R = 0;
    if (sizeType != "none" && r != 0 && r != "") {
        if (sizeType == "scalar" || sizeType == "degree") {
            // integer scalars
            if (allInts(rawSizes)) {
                var numInts = d3.max(rawSizes) - d3.min(rawSizes) + 1;

                if (numInts <= 9) {
                    sizesLegend = d3.range(d3.min(rawSizes), d3.max(rawSizes) + 1);
                }
                else {
                    sizesLegend = binnedLegend(rawSizes, 4);
                }
            }
            // noninteger scalars
            else {
                sizesLegend = binnedLegend(rawSizes, 4);
            }

            sizesLegendText = sizesLegend.slice(0);
        }
        else if (sizeType == "binary") {
            sizesLegendText = ["false", "true"];
            sizesLegend = [0, 1];
        }

        if (sizeType == "degree"){
            for (var i in sizesLegend){
                sizesLegend[i] = scaleSize(Math.sqrt(sizesLegend[i]));
            }
        }
        else {
            for (var i in sizesLegend){
                sizesLegend[i] = scaleSize(sizesLegend[i]);
            }
        }
        R = r * d3.max(sizesLegend);
    }

    if (colorType != "none") {
        if (colorType == "categorical") {
            colorsLegend = scaleColorCategory.domain();
            colorsLegendText = d3.values(catNames);
        }
        else if (colorType == "binary") {
            colorsLegend = [0, 1];
            colorsLegendText = ["false", "true"];
        }
        else if (colorType == "scalar" || colorType == "degree") {
            // integer scalars
            if (allInts(rawColors)) {
                var numInts = d3.max(rawColors) - d3.min(rawColors) + 1;

                if (numInts <= 9){
                    colorsLegend = d3.range(d3.min(rawColors),d3.max(rawColors) + 1);
                }
                else {
                    colorsLegend = binnedLegend(rawColors, 4);
                }
            }
            // noninteger scalars
            else {
                colorsLegend = binnedLegend(rawColors, 4);
            }

            colorsLegendText = colorsLegend.slice(0);
        }
        else if (colorType == "scalarCategorical") {
            colorsLegend = binnedLegend(rawColors, 4);
            colorsLegendText = colorsLegend.slice(0);
        }
    }
    drawLegend(sizesLegend, colorsLegend, sizesLegendText, colorsLegendText);
}

function binnedLegend(vals, bins) {
    var legend = [];
    var min_val = d3.min(vals);
    var max_val = d3.max(vals);
    var step = (max_val - min_val) / bins;

    legend.push(rounddown(min_val, 10));

    for (var i = 1; i < bins; i++) {
        legend.push(round(min_val + i * step, 10));
    }

    legend.push(roundup(max_val, 10));

    return legend;
}
// Having computed the values that we want to make legendary, above, now draw it.
function drawLegend(sizesLegend, colorsLegend, sizesLegendText, colorsLegendText) {
    vis.selectAll("#legend").remove();

    if (sizeType == "none" && colorType == "none") {
        return;
    };

    if (sizeKey == colorKey) {
        sizesLegend.forEach(function(d, i){
            vis.append("circle")
                .attr("id", "legend")
                .attr("r", r * d)
                .attr("cx", 5 + R)
                .attr("cy", 5 + R + 2.3 * R * i)
                .style("fill", colorWheel(colorsLegend[i]))
                .style("stroke", d3.rgb(255, 255, 255));
        });

        sizesLegendText.forEach(function(d, i){
            vis.append("text")
                .attr("id", "legend")
                .text(d)
                .attr("x", 10 + 2 * R)
                .attr("y", 5 + R + 2.3 * R * i + 4)
                .attr("fill", "black")
                .attr("font-size", 12)
        });

        return;
    }

    if (sizeType != "none") {
        sizesLegend.forEach(function(d, i){
            vis.append("circle")
                .attr("id","legend")
                .attr("r",r*d)
                .attr("cx", 5+R)
                .attr("cy", 5+R+2.3*R*i)
                .style("fill",d3.rgb(0,0,0))
                .style("stroke",d3.rgb(255,255,255));
        });
        sizesLegendText.forEach(function(d, i){
            vis.append("text")
                .attr("id","legend")
                .text(d)
                .attr("x", 10+2*R)
                .attr("y", 5+R+2.3*R*i+4)
                .attr("fill","black")
                .attr("font-size",12)
        });
    }

    if (colorType != "none") {
        colorsLegend.forEach(function(d, i){
            vis.append("circle")
                .attr("id","legend")
                .attr("r",5)
                .attr("cx", 5+Math.max(R,5))
                .attr("cy", 5+5+2*R+2.3*R*(sizesLegend.length-1)+5+2.3*5*i)
                .style("fill",colorWheel(colorsLegend[i]))
                .style("stroke",d3.rgb(255,255,255));
        });
        colorsLegendText.forEach(function(d, i) {
            vis.append("text")
                .attr("id","legend")
                .text(d)
                .attr("x", 10+Math.max(R,5)+5)
                .attr("y", 5+5+2*R+2.3*R*(sizesLegend.length-1)+5+2.3*5*i+4)
                .attr("fill","black")
                .attr("font-size",12)
        });
    }
}
// This function does the initial draw.
// It starts from the Links, then does the Nodes. 
// Finally, it starts the force using force.start()
function draw() {
    link = link.data(force.links());

    link.enter().insert("line", ".node")
        .attr("class", "link")
        .attr("id", function(d, i) { 
            return "link_" + i; 
        })
        .style("stroke", d3.rgb(150,150,150))
        .style("stroke-width", function(d) {
            if (d.w == 0) {
                return 0;
            }
            else {
                return scaleLink(d.w)
            }
        })
        .style("stroke-opacity", function(d) {
            return scaleLinkOpacity(d.w)
        });

    link.exit().remove();

    // Nodes
    if (isStartup) {
        node = node.data(force.nodes());
        node.enter().insert("circle")
            .attr("class", "node")
            .attr("r", r)
            .attr("id", function(d) {
                return ("node_" + d.idx);
            })
            .style("fill", d3.rgb(255,255,255))
            .style("stroke", d3.rgb(255,255,255));

        node.exit().remove();
        node.on("mousedown", function(d) {
            unHighlightText();
            highlightText("stop");
        });

        d3.select(window).on("mouseup", function() {
            highlightText("start");
        });

        node.on("mouseover", function (d) {
            highlightNode(d); 
            highlightText(d);
        });

        node.on("mouseout", function(d) {
            unHighlightNode(d);
            unHighlightText();
        });

        node.call(force.drag);
    }

    force.start();
    isStartup = 0;
}
////////////////////////////////////////////////////////////////////////////////
//
//
//
//
// MENUS
//
//
//
//
////////////////////////////////////////////////////////////////////////////////
function writeScaleLinkWidthToggle(parent) {
    var scaleLinkWidthToggle = parent.append("div")
        .attr("id", "scaleLinkWidthToggle")
        .text("Scale link width ");

    var isChecked = "unchecked";
    if (wwdata.display.scaleLinkWidth) {
        isChecked = "checked";
    }

    toggleLinkWidthScaling(wwdata.display.scaleLinkWidth);

    scaleLinkWidthToggle.append("input")
        .attr("id", "linkWidthCheck")
        .attr("type", "checkbox")
        .attr(isChecked, "")
        .attr("onchange", "toggleLinkWidthScaling(this.checked)");
}
function writeScaleLinkOpacityToggle(parent) {
    var scaleLinkOpacityToggle = parent.append("div")
        .attr("id", "scaleLinkOpacityToggle")
        .text("Scale link opacity ");

    var isChecked = "unchecked";
    if (wwdata.display.scaleLinkOpacity) {
        isChecked = "checked";
    }

    toggleLinkOpacity(wwdata.display.scaleLinkOpacity);

    scaleLinkOpacityToggle.append("input")
        .attr("id", "linkOpacityCheck")
        .attr("type", "checkbox")
        .attr(isChecked, "")
        .attr("onchange", "toggleLinkOpacity(this.checked)");
}
function writeNodesMoveToggle(parent) {
    var nodesMoveToggle = parent.append("div")
        .attr("id", "nodesMoveToggle")
        .text("Allow nodes to move");

    var isChecked = "checked";
    if (wwdata.display.disallowNodeMovement) {
        isChecked = "unchecked";
    }

    nodesMoveToggle.append("input")
        .attr("id", "nodesMoveToggle")
        .attr("type", "checkbox")
        .attr(isChecked, "")
        .attr("onchange", "toggleDynamics(this.checked)");

    toggleDynamics(document.getElementById("nodesMoveToggle").checked);
}
function writeSaveAsSVGButton(parent) {
    var saveAsSVGButton = parent.append("div")
        .attr("id", "saveAsSVGButton")
        .text("Save SVG ");

    saveAsSVGButton.append("input")
        .attr("id", "saveSVGButton")
        .attr("type", "button")
        .attr("value", "Save")
        .on("click", writeDownloadLink);
}
function writeDropJSONArea() {
    var dropJSONArea = d3.select("#chart")
        .append("div")
        .attr("id","dropJSONArea")
        .html("drop webweb json here");

    d3.select("#chart")
        .style("border", "1.5px dashed")
        .style("border-radius", "5px")
        .style("padding", "5px")
        .style("text-align", "center")
        .style("color", "#bbb");


    // Setup the dnd listeners.
    var dropZone = document.getElementById('chart');
    dropZone.addEventListener('dragover', handleDragOver, false);
    dropZone.addEventListener('drop', readJSONDrop, false);
}
function writeLoadJSONButton(parent) {
    var loadJSONButton = parent.append("div")
        .attr("id","loadJSONButton")
        .text("Load JSON");

    loadJSONButton.append("input")
        .attr("type", "file")
        .attr("id", "json_files")
        .attr("name", "uploadJSON")
        .attr("accept", ".json")
        .on("change", function(evt) {
            var evt = d3.event;
            readJSON();
        });
}
function writeNetworkSelectMenu(parent) {
    var networkSelectMenu = parent.append("div")
        .attr("id", "networkSelectMenu")
        .text("Display data from ");

    networkSelectMenu.append("select")
        .attr("id", "netSelect")
        .attr("onchange", "computeLinks(this.value)")
        .selectAll("option").data(netNames).enter().append("option")
        .attr("value", function(d) { return d; })
        .text(function(d) { return d; });
}

// called when we load a json file and need to rebuild the networkSelectMenu.
function updateNetworkSelectMenu() {
    var netSelect = d3.select("#netSelect");

    netSelect.selectAll("option").remove();

    netSelect.selectAll("option")
        .data(netNames).enter()
        .append("option")
        .attr("value",function(d){return d;})
        .text(function(d){return d;});
}

function writeSizeMenu(parent) {
    var sizeMenu = parent.append("div")
        .attr("id", "sizeMenu")
        .text("Compute node size from ");

    sizeMenu.append("select")
        .attr("id", "sizeSelect")
        .attr("onchange", "changeSizes(this.value)");
}
function updateSizeMenu() {
    var sizeSelect = d3.select("#sizeSelect");

    sizeSelect.selectAll("option").remove();

    var size_label_strings = [];
    for (var label in sizeLabels) {
        size_label_strings.push(label);
    }

    sizeSelect.selectAll("option")
        .data(size_label_strings)
        .enter()
        .append("option")
        .attr("value", function(d) { return d; })
        .text(function(d) { return d; });

    if (sizeLabels[sizeKey] == undefined || sizeKey == undefined) {
        sizeKey = "none";
    }

    sizeSelect = document.getElementById('sizeSelect');
    sizeSelect.value = sizeKey;
    changeSizes(sizeKey);
}

function writeColorMenu(parent) {
    var colorMenu = parent.append("div")
        .attr("id","colorMenu")
        .text("Compute node color from ");

    colorMenu.append("select")
        .attr("id","colorSelect")
        .attr("onchange","changeColors(this.value)");
}
function updateColorMenu() {
    var colorSelect = d3.select("#colorSelect");

    colorSelect.selectAll("option").remove();

    var color_label_strings = [];
    for (var label in colorLabels) {
        color_label_strings.push(label);
    }

    colorSelect.selectAll("option")
        .data(color_label_strings)
        .enter()
        .append("option")
        .attr("value",function(d){return d;})
        .text(function(d){return d;});

    if (colorLabels[colorKey] == undefined || colorKey == undefined) {
        colorKey = "none";
    }

    colorSelect = document.getElementById('colorSelect');
    colorSelect.value = colorKey;
    changeColors(colorKey);
}

function writeColorPalateMenu(parent) {
    var colorPalateMenu = parent.append("div")
        .attr("id", "colorPalateMenu")
        .text("Color Palate ");

    var color_names = [];
    for (color_name in colorbrewer) {
        color_names.push(color_name);
    }

    colorPalateMenu.append("select")
        .attr("id", "colorPalateMenuSelect")
        .attr("onchange", "setColorPalate(this.value)")
        .selectAll("option")
        .data(color_names)
        .enter()
        .append("option")
        .attr("value", function(d) { return d; })
        .text(function(d) { return d; });

    colorPalateMenuSelect = document.getElementById('colorPalateMenuSelect');
    if (wwdata.display.colorPalate !== undefined) {
        if (colorbrewer[wwdata.display.colorPalate] !== undefined) {
            colorPalateMenuSelect.value = wwdata.display.colorPalate;
        }
    }
    else {
        colorPalateMenuSelect.value = 'Set1';
    }
}
function getColorPalate() {
    colorPalateMenuSelect = document.getElementById('colorPalateMenuSelect');
    return colorPalateMenuSelect.value;
}
function writeChargeWidget(parent) {
    var chargeWidget = parent.append("div")
        .attr("id", "chargeWidget")
        .text("Node charge: ");

    chargeWidget.append("input")
        .attr("id", "chargeText")
        .attr("type", "text")
        .attr("onchange", "changeCharge(this.value)")
        .attr("value", -force.charge())
        .attr("size", 3);
}
function writeLinkLengthWidget(parent) {
    var linkLengthWidget = parent.append("div")
        .attr("id", "linkLengthWidget")
        .text("Link length: ");

    linkLengthWidget.append("input")
        .attr("id", "distanceText")
        .attr("type", "text")
        .attr("onchange", "changeDistance(this.value)")
        .attr("value", force.distance())
        .attr("size", 3);
}
function writeLinkStrengthWidget(parent) {
    var linkStrengthWidget = parent.append("div")
        .attr("id", "linkStrengthWidget")
        .text("Link strength: ");

    linkStrengthWidget.append("input")
        .attr("id","linkStrengthText")
        .attr("type","text")
        .attr("onchange","changeLinkStrength(this.value)")
        .attr("value",force.linkStrength())
        .attr("size",3);
}
function writeGravityWidget(parent) {
    var gravityWidget = parent.append("div")
        .attr("id", "gravityWidget")
        .text("Gravity: ");

    gravityWidget.append("input")
        .attr("id","gravityText")
        .attr("type","text")
        .attr("onchange","changeGravity(this.value)")
        .attr("value",force.gravity())
        .attr("size",3);
}
function writeRadiusWidget(parent) {
    var radiusWidget = parent.append("div")
        .attr("id", "radiusWidget")
        .text("Node r: ");

    radiusWidget.append("input")
        .attr("id","rText")
        .attr("type", "text")
        .attr("onchange","changer(this.value)")
        .attr("value", r)
        .attr("size", 3);
}
function writeMatchWidget(parent) {
    var matchWidget = parent.append("div")
        .attr("id", "matchWidget")
        .text("Highlight nodes whose name matches ");

    matchWidget.append("input")
        .attr("id","matchText")
        .attr("type", "text")
        .attr("onchange", "matchNodes(this.value)")
        .attr("size", 3);
}
function writeMenus(menu) {
    var leftMenu = menu.append("div")
        .attr("id", "leftMenu")
        .attr("class", "left");

    var rightMenu = menu.append("div")
        .attr("id", "rightMenu")
        .attr("class", "right");

    writeNetworkSelectMenu(leftMenu);
    writeSizeMenu(leftMenu);
    writeColorMenu(leftMenu);
    writeColorPalateMenu(leftMenu);
    writeScaleLinkWidthToggle(leftMenu);
    writeScaleLinkOpacityToggle(leftMenu);
    writeNodesMoveToggle(leftMenu);
    writeSaveAsSVGButton(leftMenu);
    writeDropJSONArea(leftMenu);
    // Implemented by Mike Iuzzolino, disabled by DBL for cleanliness
    // writeLoadJSONButton();

    writeChargeWidget(rightMenu);
    writeLinkLengthWidget(rightMenu);
    writeLinkStrengthWidget(rightMenu);
    writeGravityWidget(rightMenu);
    writeRadiusWidget(rightMenu);
    writeMatchWidget(rightMenu);
}

/*
* File interaction code
* This code handles the dragging and dropping of files
* as well as the saving of SVG
*/ 
function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.

    // Make the border pop when something is dragged over. 
    d3.select("#chart")
        .style("border", "2.5px dashed")
        .style("border-radius", "10px")
        .style("color", "#888")
        .transition().duration(400)
        .style("border", "1.5px dashed")
        .style("border-radius", "5px")
        .style("color", "#bbb");
}

// This prepares to read in a json file if you drop it. 
// It calls readJSON, which is below.
function readJSONDrop(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    var files = evt.dataTransfer.files; // FileList object.

    var text = d3.select("#menuL9")

    text.html(function() {
        return "Loading " + files[0].name + "...";
    });

    setTimeout(function() {
        text.html("drop webweb json here")
    }, 2000);

    readJSON(files);
}
// Theoretically, multiple files could have been dropped above.
// Those files are passed into readJSON
// Only the first file is used. 
function readJSON(files, method) {
    var file;

    if (files === undefined) {
        files = document.getElementById('json_files').files;
    }
    file = files[0];

    var start = 0;
    var stop = file.size - 1;

    var reader = new FileReader();

    // If we use onloadend, we need to check the readyState.
    reader.onloadend = function(evt) {
        if (evt.target.readyState == FileReader.DONE) { // DONE == 2
            var json_string = evt.target.result;
            json_string = json_string.replace("var wwdata = ", "");
            wwdata = JSON.parse(json_string);
            updateVis(wwdata);
        }
    };

    var blob = file.slice(start, stop + 1);
    reader.readAsBinaryString(blob);
}

// Blob is used to do the SVG save. 
function writeDownloadLink(){
    try {
        var isFileSaverSupported = !!new Blob();
    } catch (e) {
        alert("blob not supported");
    }
    // grab the svg, call it netName, and save it.

    var html = d3.select("svg")
        .attr("title", netName)
        .attr("version", 1.1)
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .node().parentNode.innerHTML;
    var blob = new Blob([html], {type: "image/svg+xml"});
    saveAs(blob, netName);
};


/* Helper functions */
function identity(d) {
    return d;
}
function isInt(n) {
    return n % 1 === 0;
}
function round(x, dec) {
    return (Math.round(x * dec) / dec);
}
function roundup(x, dec) {
    return (Math.ceil(x * dec) / dec);
}
function rounddown(x, dec) {
    return (Math.floor(x * dec) / dec);
}
function allInts(vals) {
    for (i in vals) {
        if (!isInt(vals[i])) {
            return false;
        }
    }

    return true;
}

////////////////////////////////////////////////////////////////////////////////
// loads the labels up from the places they could come from:
// 1. the defaults (none, degree)
// 2. the display parameters
// 3. the network itself
//
// Priority is given to the network's labels, then display, then defaults
////////////////////////////////////////////////////////////////////////////////
function setLabels() {
    var all_labels = {
        'none' : {},
        'degree' : {},
    };

    if (wwdata.display.labels !== undefined) {
        var display_labels = wwdata.display.labels;
        for (var label in display_labels) {
            all_labels[label] = display_labels[label];
        }
    }

    if (wwdata.network[netName] !== undefined && wwdata.network[netName].labels !== undefined) {
        var network_labels = wwdata.network[netName].labels;
        for (var label in network_labels) {
            all_labels[label] = network_labels[label];
        }
    }
    sizeLabels = {};
    colorLabels = {};
    for (label in all_labels) {
        if (all_labels[label].type !== "categorical") {
            sizeLabels[label] = all_labels[label];
        }
        colorLabels[label] = all_labels[label];
    }
}
////////////////////////////////////////////////////////////////////////////////
// Parameters currently passed through:
// - N
// - w, h, c, l, r, g
// - colorBy --> colorKey
// - sizeBy --> sizeKey
// - scaleLinkOpacity
// - scaleLinkWidth
// - disallowNodeMovement
////////////////////////////////////////////////////////////////////////////////
function setDisplay(wwdata) {
    N = wwdata.display.N;
    if (wwdata.display.w !== undefined){w = wwdata.display.w;}
    if (wwdata.display.h !== undefined){h = wwdata.display.h;}
    if (wwdata.display.c !== undefined){c = wwdata.display.c;}
    if (wwdata.display.l !== undefined){l = wwdata.display.l;}
    if (wwdata.display.r !== undefined){r = wwdata.display.r;}
    if (wwdata.display.g !== undefined){g = wwdata.display.g;}

    colorKey = wwdata.display.colorBy;
    sizeKey = wwdata.display.sizeBy;

    netNames = Object.keys(wwdata.network);

    links = [];

    // Define nodes
    nodes = [];
    for (var i = 0; i < N; i++) {
        nodes.push({
            "idx" : i,
            "weight" : 0,
        });
    }

    // set the display names
    if (wwdata.display.nodeNames !== undefined) {
        for (var i in nodes) {
            nodes[i]["name"] = wwdata.display.nodeNames[i];
        }
    }

    var title = "webweb";
    if (wwdata.display.name !== undefined) {
        title = title + " - " + wwdata.display.name;
    }

    d3.select("title").text(title);
}
////////////////////////////////////////////////////////////////////////////////
// This function is poorly named. It:
// - makes the svg
// - makes a node and link selector
// - scales stuff
// - initializes some colors
////////////////////////////////////////////////////////////////////////////////
function displayNetwork() {
    vis = d3.select("#svg_div")
        .append("svg")
        .attr("width", w)
        .attr("height", h)
        .attr("id", "vis");

    node = vis.selectAll(".node");
    link = vis.selectAll(".link");
    force = d3.layout.force()
        .links(links)
        .nodes(nodes)
        .charge(-c)
        .gravity(g)
        .linkDistance(l)
        .size([w, h])
        .on("tick", tick);

    scaleSize = d3.scale.linear().range([1,1]);
    scaleColorScalar = d3.scale.linear().range([1,1]);
    scaleColorCategory = d3.scale.ordinal().range([1,1]);
    scaleLink = d3.scale.linear().range([1,1]);
    scaleLinkOpacity = d3.scale.linear().range([0.4,0.9]);

    colorType = "none";
    sizeType = "none";
    rawColors = [];
    colors = [];
    cats = [];
    catNames = [];
    nameToMatch = "";
    R = 0;
    isHighlightText = true;

    for (var i = 0; i < N; i++) {
        colors[i] = d3.rgb(100, 100, 100); 
        rawColors[i] = 1;
    }

    isStartup = 1;
    netName;
}

// updateVis is called whenever we drag a file in
// It's the update version of initializeVis
function updateVis(wwdata) {
    setDisplay(wwdata);

    // remove the SVG; it will be recreated below
    d3.select("#vis").remove();

    displayNetwork();

    updateNetworkSelectMenu();
    computeLinks(netNames[0]);
}

// Initialize the actual viz by putting all the pieces above together.
function initializeVis() {
    setDisplay(wwdata);

    // set up the DOM
    var center = d3.select("body")
        .append("div")
        .attr("id", "center");

    var menu = center.append("div")
        .attr("id", "menu");

    center.append("div")
        .attr("id", "chart")
        .append("div")
        .attr("id", "svg_div");

    displayNetwork();

    writeMenus(menu);
    computeLinks(netNames[0]);
}

window.onload = function() {
    initializeVis();
};
