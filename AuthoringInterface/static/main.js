// open /Applications/Google\ Chrome.app --args --allow-file-access-from-files
// "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --allow-file-access-from-files
// Chrome flags: enable "Experimental canvas features"

// run local server: php -S 127.0.0.1:8080
// http://127.0.0.1:8080/index.html

// global variables
var scene_name = "";

var segments = []; // 2d array of segments
var segmentsinfo = []; // 2d array of segment info (eg. center coord, area)
var pixelsDict = {}; // index : segment#
var pixelsDictOri = {}; // index: original segment#
var oriImageData, oriData;
var hueImageData, hueData;
var tROIImageData = [], tROIData = []; // transformed ROI
var segCoords = {}; // segment# : [x1,y1,x2,y2 ...]
var segInfo = {}; // segment#: [x_center, y_center, area]
var grows = 0; // rows in image
var gcols = 0; // columns in image
var currId = []; // selected segments
var baseImageData;
var segResultImage;
var qr_landmarks = "";
var seg_param = [20, 0.025, 20, 6]; // default seg parameters
var three_d = false;
var two_d = false;
var clr = false;
var del_hue = 0;
var ann = false;
var three_d_points = [];
var two_d_points = [];
var file_output = "";
var file_preview = "";
var frame_count = 0;
var filename = ""; // seg_result filename
var newImageData;
var homography;
var ROIImageData3D = [];
var prevImageData3D;
var canvas_state;

var undoImageList = [];
var undoPixelsDict = [];

var offsetX_css_related = 0;
var offsetY_css_related = 0;

document.getElementById("frameCount").innerHTML = 0; 
document.getElementById("segment#").innerHTML = "0";  
document.getElementById("pos").innerHTML = "none";
document.getElementById("hue_change").innerHTML = "0";

function apply_homography(src, dst) {
    var canvas = document.getElementById("bgcanvas");
    var ctx = canvas.getContext("2d");
    var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    tROIImageData = [];
    tROIData = [];
    for (var numseg = 0; numseg < currId.length; numseg++)
        tROIImageData.push(interpImg(ROIImageData3D[numseg], src, dst));

    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    createImageBitmap(prevImageData3D).then(img => ctx.drawImage(img, 0, 0));
    for (var numseg = 0; numseg < currId.length; numseg++) {
        createImageBitmap(tROIImageData[numseg]).then(img => ctx.drawImage(img, 0, 0));
    }
}



function interpImg(ROIImageData, src, dst) {
    var perspT = PerspT(src, dst);

    var canvas = document.getElementById("bgcanvas");
    var ctx = canvas.getContext("2d");
    var ROIData = ROIImageData.data;
    var interpImageData = ctx.createImageData(gcols, grows);
    var interpData = interpImageData.data;
    var ROIMinX = gcols, ROIMaxX = 0;
    var ROIMinY = grows, ROIMaxY = 0;
    for (var i = 0; i < ROIData.length; i += 4) {
        if (ROIData[i + 3] > 0) {
            var currX = (i/4) % gcols;
            var currY = Math.floor((i/4) / gcols);
            if (ROIMinX > currX) ROIMinXROIMinX = currX;
            if (ROIMaxX < currX) ROIMaxX = currX;
            if (ROIMinY > currY) ROIMinY = currY;
            if (ROIMaxY < currY) ROIMaxY = currY;
        }
    }
    corner_lu = perspT.transform(ROIMinX, ROIMinY);
    corner_lb = perspT.transform(ROIMinX, ROIMaxY);
    corner_ru = perspT.transform(ROIMaxX, ROIMinY);
    corner_rb = perspT.transform(ROIMaxX, ROIMaxY);
    var interpMinX = Math.min(corner_lu[0], corner_lb[0], corner_ru[0], corner_rb[0]);
    var interpMaxX = Math.max(corner_lu[0], corner_lb[0], corner_ru[0], corner_rb[0]);
    var interpMinY = Math.min(corner_lu[1], corner_lb[1], corner_ru[1], corner_rb[1]);
    var interpMaxY = Math.max(corner_lu[1], corner_lb[1], corner_ru[1], corner_rb[1]);

    for (var i = 0; i < interpData.length; i += 4) {
        var currX = (i/4) % gcols;
        var currY = Math.floor((i/4) / gcols);
        if (interpMinX <= currX <= interpMaxX && interpMinY <= currY <= interpMaxY) {
            backP = perspT.transformInverse(currX, currY);
            var backX = backP[0], backY = backP[1];
            // var backP_lu = [Math.floor(backX), Math.floor(backY)];
            // var backP_lb = [Math.floor(backX), Math.ceil(backY)];
            // var backP_ru = [Math.ceil(backX), Math.floor(backY)];
            // var backP_rb = [Math.ceil(backX), Math.ceil(backY)];
            var ratioX = backX - Math.floor(backX);
            var ratioY = backY - Math.floor(backY);
            // check range for inverse transformed coordinates in ROIData
            var r_lu, g_lu, b_lu, a_lu;
            var r_lb, g_lb, b_lb, a_lb;
            var r_ru, g_ru, b_ru, a_ru;
            var r_rb, g_rb, b_rb, a_rb;
            if (Math.floor(backX) >= 0 && Math.floor(backX) < gcols && Math.floor(backY) >= 0 && Math.floor(backY) < grows) {
                r_lu = ROIData[4 * (Math.floor(backX) + Math.floor(backY) * gcols)];
                g_lu = ROIData[4 * (Math.floor(backX) + Math.floor(backY) * gcols) + 1];
                b_lu = ROIData[4 * (Math.floor(backX) + Math.floor(backY) * gcols) + 2];
                a_lu = ROIData[4 * (Math.floor(backX) + Math.floor(backY) * gcols) + 3];
            } else {
                r_lu = 0; g_lu = 0; b_lu = 0; a_lu = 0;
            }
            if (Math.floor(backX) >= 0 && Math.floor(backX) < gcols && Math.ceil(backY) >= 0 && Math.ceil(backY) < grows) {
                r_lb = ROIData[4 * (Math.floor(backX) + Math.ceil(backY) * gcols)];
                g_lb = ROIData[4 * (Math.floor(backX) + Math.ceil(backY) * gcols) + 1];
                b_lb = ROIData[4 * (Math.floor(backX) + Math.ceil(backY) * gcols) + 2];
                a_lb = ROIData[4 * (Math.floor(backX) + Math.ceil(backY) * gcols) + 3];
            } else {
                r_lb = 0; g_lb = 0; b_lb = 0; a_lb = 0;
            }
            if (Math.ceil(backX) >= 0 && Math.ceil(backX) < gcols && Math.floor(backY) >= 0 && Math.floor(backY) < grows) {
                r_ru = ROIData[4 * (Math.ceil(backX) + Math.floor(backY) * gcols)];
                g_ru = ROIData[4 * (Math.ceil(backX) + Math.floor(backY) * gcols) + 1];
                b_ru = ROIData[4 * (Math.ceil(backX) + Math.floor(backY) * gcols) + 2];
                a_ru = ROIData[4 * (Math.ceil(backX) + Math.floor(backY) * gcols) + 3];
            } else {
                r_ru = 0; g_ru = 0; b_ru = 0; a_ru = 0;
            }
            if (Math.ceil(backX) >= 0 && Math.ceil(backX) < gcols && Math.ceil(backY) >= 0 && Math.ceil(backY) < grows) {
                r_rb = ROIData[4 * (Math.ceil(backX) + Math.ceil(backY) * gcols)];
                g_rb = ROIData[4 * (Math.ceil(backX) + Math.ceil(backY) * gcols) + 1];
                b_rb = ROIData[4 * (Math.ceil(backX) + Math.ceil(backY) * gcols) + 2];
                a_rb = ROIData[4 * (Math.ceil(backX) + Math.ceil(backY) * gcols) + 3];
            } else {
                r_rb = 0; g_rb = 0; b_rb = 0; a_rb = 0;
            }
            interpData[i] = (1-ratioX) * (1-ratioY) * r_lu + (1-ratioX) * ratioY * r_lb + ratioX * (1-ratioY) * r_ru + ratioX * ratioY * r_rb;
            interpData[i + 1] = (1-ratioX) * (1-ratioY) * g_lu + (1-ratioX) * ratioY * g_lb + ratioX * (1-ratioY) * g_ru + ratioX * ratioY * g_rb;
            interpData[i + 2] = (1-ratioX) * (1-ratioY) * b_lu + (1-ratioX) * ratioY * b_lb + ratioX * (1-ratioY) * b_ru + ratioX * ratioY * b_rb;
            interpData[i + 3] = (1-ratioX) * (1-ratioY) * a_lu + (1-ratioX) * ratioY * a_lb + ratioX * (1-ratioY) * a_ru + ratioX * ratioY * a_rb;
        }
    }

    return interpImageData;
}

// show reference qr codes
$("#ref_codes").click(function() {
    var fields = document.getElementById("reference_codes");

    // show or hide qr codes
    if (fields.style.display == "block") 
        fields.style.display = "none";
    else
        fields.style.display = "block";

    // create reference codes
    document.getElementById("ref_version").onchange = function() {
        var version = this.value;
        var text = "";
        var segs = qrcodegen.QrSegment.makeSegments(text);
        var qrcode = qrcodegen.QrCode.encodeSegments(segs, qrcodegen.QrCode.Ecc.LOW, version, version);
        var canvas = document.getElementById("ref_canvas");
        qrcode.drawCanvas(11, 0, canvas);
    }

});


// show authoring interface
$("#authoring_button").click(function() {
    var fields = document.getElementById("authoring");

    // show or hide qr codes
    if (fields.style.display == "block") 
     fields.style.display = "none";
 else 
    fields.style.display = "block";
});


// get qr landmarks
function uploadImage() {
    var uploadedImage = new Image();
    // draw image on canvas
    uploadedImage.onload = function() {
        var canvas = document.getElementById("bgcanvas"),
        context = canvas.getContext("2d");
        canvas.width = uploadedImage.width;
        canvas.height = uploadedImage.height;
        grows = uploadedImage.height;
        gcols = uploadedImage.width;
        context.drawImage(uploadedImage, 0, 0);
        baseImageData = context.getImageData(0, 0, canvas.width, canvas.height);
        newImageData = baseImageData;

        // qr code detection
        // qrcode.imagedata = baseImageData;
        // qrcode.width = uploadedImage.width;
        // qrcode.height = uploadedImage.height;
        // var image = qrcode.grayScaleToBitmap(qrcode.grayscale());
        // var detector = new Detector(image);
        // var landmarks = detector.detect().points;

        // store landmarks
        // for (var i=0; i < 4; i++) {
        // 	qr_landmarks = qr_landmarks + landmarks[i].X + " " + landmarks[i].Y + " "; 
        // }
        qr_landmarks = document.getElementById("qr_landmarks").value;

        // clear output
        document.getElementById("segment#").innerHTML = "0";
        document.getElementById("frameCount").innerHTML = "0";
        // document.getElementById("authoringFile").innerHTML = "";
        document.getElementById("hue_change").innerHTML = "0";
        file_output = "";
        file_preview = "";
        frame_count = 0;
        currId = []; // selected segments
        seg_param = [20, 0.025, 20, 6];
        three_d = false;
        three_d_points = [];
    };

    // get files
    // var file = document.getElementById("backimage");
    // if (file.files.length != 1) {
    //     alert("Required file: img_author.png");
    //     return;
    // }

    // if (file.files[0].name.includes(".png"))
    //     uploadedImage.src = URL.createObjectURL(file.files[0]);
    // else {
    //     alert("Required file: img_author.png");
    //     return;
    // }

    // if (document.getElementById("blocks").checked) {
    //     scene_name = "demo_blocks/";
    // } else if (document.getElementById("coffee").checked) {
    //     scene_name = "demo_coffee/";
    // } else if (document.getElementById("ink").checked) {
    //     scene_name = "demo_ink/";
    // } else if (document.getElementById("map").checked) {
    //     scene_name = "demo_map/";
    // } else if (document.getElementById("vase").checked) {
    //     scene_name = "demo_vase/";
    // } else {
    //     scene_name = "demo_test/";
    // }
    // scene_name = "demo_test/";
    // uploadedImage.src = scene_name + "img_author.png";
    uploadedImage.src = "http://tracer.cs.yale.edu:2018/get_userdata?file=img_author.png";
    // TODO random ordering of 5 examples
    console.log("new image");
    document.getElementById("param1").disabled = false;
    document.getElementById("param2").disabled = false;
    document.getElementById("param4").disabled = false;
}
uploadImage();

function onMouseOver(index) {
    var X = event.pageX - index.offsetLeft - offsetX_css_related;
    var Y = event.pageY - index.offsetTop - offsetY_css_related;
    document.getElementById("pos").innerHTML = X + ", " + Y;
}

function clearPrevEventlisteners() {
    var canvas = document.getElementById("top");
    var new_canvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(new_canvas, canvas);
    is2DEventListenersAdded = 0;
    document.getElementById("rotateAngle").innerHTML = 0;
    $("#top").click(function() {
        if (segments.length == 0) {
            alert("Please use sliders and save segmentation parameters");
            return;
        }
        var X = event.pageX - this.offsetLeft - offsetX_css_related; 
        var Y = event.pageY - this.offsetTop - offsetY_css_related;
        var coords = X.toString() + "," + Y.toString();
        edit_image(X, Y);
    });
}

// Animation scheme: 3D transformation
$("#2d_button").click(function() {
    if (currId.length == 0) {
        alert("Please select at least one segment on the image first");
        return;
    }
    if (two_d || three_d || clr || ann) return; // do not allow switching animation modes
    document.getElementById("addframe_button").disabled = true; // user has to drag before adding frame

    two_d = true;
    three_d = false;
    clr = false;
    ann = false;

    // Clear previous event listeners
    clearPrevEventlisteners();

    // TODO undo other animation schemes
    
    document.getElementById("2d_button").style.background = "#3B99FC";
    document.getElementById("3d_button").style.background = "#4CAF50";
    document.getElementById("color_button").style.background = "#4CAF50";
    document.getElementById("annotation_button").style.background = "#4CAF50";

    document.getElementById("twod_table").style.display = "block";
    document.getElementById("threed_table").style.display = "none";
    document.getElementById("color_table").style.display = "none";
    document.getElementById("annotation_table").style.display = "none";

    // Simulate a click to add all the event listeners in advance
    document.getElementById("top").click();
});

// Animation scheme: 3D transformation
$("#3d_button").click(function() {
    if (currId.length == 0) {
        alert("Please select at least one segment on the image first");
        return;
    }
    if (two_d || three_d || clr || ann) return; // do not allow switching animation modes
    document.getElementById("addframe_button").disabled = true; // user has to drag before adding frame

    two_d = false;
    three_d = true;
    clr = false;
    ann = false;

    // Clear previous event listeners
    clearPrevEventlisteners();

    // TODO undo other animation schemes

    document.getElementById("2d_button").style.background = "#4CAF50";
    document.getElementById("3d_button").style.background = "#3B99FC";
    document.getElementById("color_button").style.background = "#4CAF50";
    document.getElementById("annotation_button").style.background = "#4CAF50";

    document.getElementById("twod_table").style.display = "none";
    document.getElementById("threed_table").style.display = "block";
    document.getElementById("color_table").style.display = "none";
    document.getElementById("annotation_table").style.display = "none";

    // initialize canvas with draggable points
    canvas_state = new CanvasState(document.getElementById("top"), document);

});

// Animation scheme: color
var init_h = -1;
$("#color_button").click(function() {
    if (currId.length == 0) {
        alert("Please select at least one segment on the image first");
        return;
    }
    if (two_d || three_d || clr || ann) return; // do not allow switching animation modes

    two_d = false;
    three_d = false;
    clr = true;
    ann = false;

    // Clear previous event listeners
    clearPrevEventlisteners();

    // TODO undo other animation schemes

    document.getElementById("2d_button").style.background = "#4CAF50";
    document.getElementById("3d_button").style.background = "#4CAF50";
    document.getElementById("color_button").style.background = "#3B99FC";
    document.getElementById("annotation_button").style.background = "#4CAF50";

    document.getElementById("twod_table").style.display = "none";
    document.getElementById("threed_table").style.display = "none";
    document.getElementById("color_table").style.display = "block";
    document.getElementById("annotation_table").style.display = "none";

    compute_initial_hue();
    $("#hue").val(init_h);
});

// Animation scheme: annotation
$("#annotation_button").click(function() {
    if (currId.length == 0) {
        alert("Please select at least one segment on the image first");
        return;
    }
    if (two_d || three_d || clr || ann) return; // do not allow switching animation modes

    two_d = false;
    three_d = false;
    clr = false;
    ann = true;

    // Clear previous event listeners
    clearPrevEventlisteners();

    // TODO undo other animation schemes

    document.getElementById("2d_button").style.background = "#4CAF50";
    document.getElementById("3d_button").style.background = "#4CAF50";
    document.getElementById("color_button").style.background = "#4CAF50";
    document.getElementById("annotation_button").style.background = "#3B99FC";

    document.getElementById("twod_table").style.display = "none";
    document.getElementById("threed_table").style.display = "none";
    document.getElementById("color_table").style.display = "none";
    document.getElementById("annotation_table").style.display = "block";
});


// compute initial hue of ROI
function compute_initial_hue() {
    // iterate through pixels
    // if segment is in currId --> convert rgb to hsv and add to sum, increment count
    var sum_h = 0;
    var count = 0;
    
    // iterate through pixels
    var canvas = document.getElementById("bgcanvas");
    var ctx = canvas.getContext("2d");
    var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var canvasData = canvasImageData.data;
    hueImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    hueData = hueImageData.data;

    for (var i = 0; i < canvasData.length; i += 4) {
        // if pixel in current ROI add hsv to sum
        if (currId.includes(pixelsDict[i/4])) {
            // unhighlight the ROI
            canvasData[i] = (canvasData[i] - 25500/355) * 355/255;
            canvasData[i + 1] = canvasData[i + 1] / 0.75;
            canvasData[i + 2] = canvasData[i + 2] / 0.75;
            canvasData[i + 3] = 255;

            // store the original ROI
            hueData[i] = canvasData[i];
            hueData[i + 1] = canvasData[i + 1];
            hueData[i + 2] = canvasData[i + 2];
            hueData[i + 3] = canvasData[i + 3];

            // convert rgb to hsv
            var rgb = tinycolor({ r: canvasData[i], g: canvasData[i + 1], b: canvasData[i + 2] });
            var hsv = rgb.toHsv();
            sum_h += hsv["h"];
            count++;
        }
    }

    // average all hsv values of ROI
    init_h = sum_h / count;
    $("#hue").val(init_h);
    document.getElementById("hue_change").innerHTML = "0";
    createImageBitmap(canvasImageData).then(img => ctx.drawImage(img, 0, 0));
}


// try different delta hue
function hue_update() {
    // get value from slider
    var curr_hue = parseInt(document.getElementById("hue").value);
    del_hue = Math.round(curr_hue - init_h);
    document.getElementById("hue_change").innerHTML = del_hue;

    if (init_h == -1) {
        window.alert("Initial hue computation failed!");
        compute_initial_hue();
    }

    // iterate through pixels
    var canvas = document.getElementById("bgcanvas");
    var ctx = canvas.getContext("2d");

    newImageData = ctx.createImageData(gcols, grows);
    var newData = newImageData.data;

    for (var i = 0; i < newData.length; i += 4) {
        // if pixel is in segment for currId 
        // set new hue --> convert hsv to rgb --> set pixel
        if (currId.includes(pixelsDict[i/4])) { 
            // convert current rgb to hsv
            // set new h value
            var rgb = tinycolor({ r: hueData[i], g: hueData[i + 1], b: hueData[i + 2] });
            var hsv = rgb.toHsv();
            var new_hsv = tinycolor({ h: (hsv["h"] + del_hue) % 360, s: hsv["s"], v: hsv["v"] });
            rgb = new_hsv.toRgb();

            newData[i]     = rgb["r"]; // red
            newData[i + 1] = rgb["g"]; // green
            newData[i + 2] = rgb["b"]; // blue
            newData[i + 3] = hueData[i + 3]; // alpha
        }
        // else same keep image same
        else {
            newData[i]     = hueData[i]; // red
            newData[i + 1] = hueData[i + 1]; // green
            newData[i + 2] = hueData[i + 2]; // blue
            newData[i + 3] = hueData[i + 3]; // alpha
        }
    }

    ctx.globalAlpha = 1;
    createImageBitmap(newImageData).then(img => ctx.drawImage(img, 0, 0));

}

// update the duration value
function duration_update() {
    var duration = document.getElementById("duration").value;
    if (duration == 1)
        document.getElementById("duration_text").innerHTML = "1 second";
    else
        document.getElementById("duration_text").innerHTML = duration.toString() + " seconds";
}

// get click from top layer
$("#top").click(function() {
    // segmentation parameters must be set
    if (segments.length == 0) {
        alert("Please save segmentation parameters");
        return;
    }
    // get mouse coordinates relative to canvas
    var X = event.pageX - this.offsetLeft - offsetX_css_related; 
    var Y = event.pageY - this.offsetTop - offsetY_css_related;

    // find closest area to click
    edit_image(X, Y);
});


// simulate click to trigger canvas state draw()
function simulate_click() {
    function triggerMouseEvent (node, eventType) {
        var clickEvent = document.createEvent ('MouseEvents');
        clickEvent.initEvent (eventType, true, true);
        node.dispatchEvent (clickEvent);
    }

    var targetNode = document.querySelector("#top");
    if (targetNode) {
        triggerMouseEvent (targetNode, "mousedown");
    }
    else
        console.log ("*** Target node not found!");

}

var is2DEventListenersAdded = 0;
// manipulate image on lower layer
function edit_image(X, Y) {

    // get mouse coordinates relative to canvas
    var exists = false;


    if (three_d) {
        if (!canvas_state.origdatasaved) {
            var bgcanvas = document.getElementById("bgcanvas");
            var ctx = bgcanvas.getContext("2d");
            prevImageData3D = ctx.getImageData(0, 0, bgcanvas.width, bgcanvas.height);
            var prevData = prevImageData3D.data;
            var ROIData = [];

            for (var numseg = 0; numseg < currId.length; numseg++) {
                ROIImageData3D.push(ctx.createImageData(gcols, grows));
                ROIData.push(ROIImageData3D[numseg].data);
            }


            for (var i = 0; i < prevData.length; i += 4) {
                for (var numseg = 0; numseg < currId.length; numseg++) {
                    if (currId[numseg] == pixelsDict[i/4]) {
                        // Copy ROI data
                        ROIData[numseg][i] = prevData[i];
                        ROIData[numseg][i + 1] = prevData[i + 1];
                        ROIData[numseg][i + 2] = prevData[i + 2];
                        ROIData[numseg][i + 3] = prevData[i + 3];
                        // Fill original image with black
                        if (pixelsDict[i/4] == pixelsDictOri[i/4]) {
                            prevData[i] = 0;
                            prevData[i + 1] = 0;
                            prevData[i + 2] = 0;
                            prevData[i + 3] = 255;
                        } else {
                            prevData[i] = oriData[i];
                            prevData[i + 1] = oriData[i + 1];
                            prevData[i + 2] = oriData[i + 2];
                            prevData[i + 3] = oriData[i + 3];
                        }
                        
                    }
                }
            }
        }


        return;
    }

    if (two_d) {
        // if (two_d_points.length == 2) {
        //     alert("Select 2 points only");
        //     return;
        // }
        // two_d_points.push(X.toString() + " " + Y.toString());

        // highlight_points(two_d_points, X, Y, true);

        // mouse down, move, and up event listeners for dragging
        var canvas = document.getElementById("top");
        var bgcanvas = document.getElementById("bgcanvas");
        var ctx = bgcanvas.getContext("2d");
        var prevImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var prevData = prevImageData.data;
        var isDragging2D = false;
        var isEverDragged = false;
        var ROIpixels = 0, ROIcenterX = 0, ROIcenterY = 0;
        var dragFinishX = 0, dragFinishY = 0;
        var rotateAngle = 0;
        var ROIImageData = [], ROIData = [];
        for (var numseg = 0; numseg < currId.length; numseg++) {
            ROIImageData.push(ctx.createImageData(gcols, grows));
            ROIData.push(ROIImageData[numseg].data);
        }
        // only add event listeners once
        if (is2DEventListenersAdded == 0) {
            canvas.addEventListener("mousedown", function(e) {
                var dragX = e.clientX - this.offsetLeft - offsetX_css_related; 
                var dragY = e.clientY - this.offsetTop - offsetY_css_related;
                // console.log("Zach mousedown: (" + dragX + ", " + dragY+ ") isEverDragged = " + isEverDragged);
                // Click on ROI to activate dragging
                if (isEverDragged) {
                    isDragging2D = true;
                    return;
                }

                if (currId.includes(pixelsDict[dragX + dragY * gcols])) {
                    // console.log("Zach included");
                    for (var i = 0; i < prevData.length; i += 4) {
                        for (var numseg = 0; numseg < currId.length; numseg++) {
                            if (currId[numseg] == pixelsDict[i/4]) {
                                // Copy ROI data
                                ROIData[numseg][i] = prevData[i];
                                ROIData[numseg][i + 1] = prevData[i + 1];
                                ROIData[numseg][i + 2] = prevData[i + 2];
                                ROIData[numseg][i + 3] = prevData[i + 3];
                                // Fill original image with black
                                if (pixelsDict[i/4] == pixelsDictOri[i/4]) {
                                    prevData[i] = 0;
                                    prevData[i + 1] = 0;
                                    prevData[i + 2] = 0;
                                    prevData[i + 3] = 255;
                                } else {
                                    prevData[i] = oriData[i];
                                    prevData[i + 1] = oriData[i + 1];
                                    prevData[i + 2] = oriData[i + 2];
                                    prevData[i + 3] = oriData[i + 3];
                                }
                                // Increase number of ROI pixels
                                ROIpixels++;
                                ROIcenterX += (i/4) % gcols;
                                ROIcenterY += Math.floor((i/4) / gcols);
                            }
                        }
                    }
                    ROIcenterX = Math.round(ROIcenterX / ROIpixels);
                    ROIcenterY = Math.round(ROIcenterY / ROIpixels);
                    isEverDragged = true;
                    // push the starting point
                    two_d_points = [];
                    two_d_points.push(ROIcenterX.toString() + " " + ROIcenterY.toString());
                    isDragging2D = true;
                }
            }, true);
            canvas.addEventListener("mousemove", function(e) {
                var dragX = e.clientX - this.offsetLeft - offsetX_css_related; 
                var dragY = e.clientY - this.offsetTop - offsetY_css_related;
                // console.log("Zach mousemove");
                if (isDragging2D) {
                    // draw non-ROI image
                    createImageBitmap(prevImageData).then(img => ctx.drawImage(img, 0, 0));
                    // draw transformed ROI
                    for (var numseg = 0; numseg < currId.length; numseg++) {
                        createImageBitmap(ROIImageData[numseg]).then(img => {
                            ctx.save();
                            var cx = dragX - ROIcenterX, cy = dragY - ROIcenterY;
                            var rotang = rotateAngle * Math.PI / 180;
                            ctx.translate(ROIcenterX, ROIcenterY);
                            ctx.rotate(rotang);
                            ctx.translate(-ROIcenterX, -ROIcenterY);
                            // Decompose the offset to new directions
                            var cx_new = cx / Math.cos(Math.atan2(cy, cx)) * Math.cos(Math.atan2(cy, cx) - rotang);
                            var cy_new = cy / Math.sin(Math.atan2(cy, cx)) * Math.sin(Math.atan2(cy, cx) - rotang);
                            ctx.drawImage(img, cx_new, cy_new);
                            ctx.restore();
                        });
                    }
                }
            }, true);
            canvas.addEventListener("mouseup", function(e) {
                dragFinishX = e.clientX - this.offsetLeft - offsetX_css_related; 
                dragFinishY = e.clientY - this.offsetTop - offsetY_css_related;
                var dragFinishImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                // console.log("Zach mouseup: " + dragFinishX.toString() + " " + dragFinishY.toString());

                tROIImageData = [];
                tROIData = [];
                // draw transformed ROI for getting image data
                for (var numseg = 0; numseg < currId.length; numseg++) {
                    createImageBitmap(ROIImageData[numseg]).then(img => {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.save();
                        var cx = dragFinishX - ROIcenterX, cy = dragFinishY - ROIcenterY;
                        var rotang = rotateAngle * Math.PI / 180;
                        ctx.translate(ROIcenterX, ROIcenterY);
                        ctx.rotate(rotang);
                        ctx.translate(-ROIcenterX, -ROIcenterY);
                        // Decompose the offset to new directions
                        var cx_new = cx / Math.cos(Math.atan2(cy, cx)) * Math.cos(Math.atan2(cy, cx) - rotang);
                        var cy_new = cy / Math.sin(Math.atan2(cy, cx)) * Math.sin(Math.atan2(cy, cx) - rotang);
                        ctx.drawImage(img, cx_new, cy_new);
                        ctx.restore();
                        tROIImageData.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
                    });
                }
                createImageBitmap(dragFinishImageData).then(img => ctx.drawImage(img, 0, 0));

                // Push the end point
                while (two_d_points.length > 1) {
                    two_d_points.pop();
                }
                two_d_points.push(dragFinishX.toString() + " " + dragFinishY.toString());
                if (isEverDragged) document.getElementById("addframe_button").disabled = false;
                isDragging2D = false;
            }, true);
            // keydown listener attached to window, not working for canvas
            canvas.addEventListener("keydown", function(e) {
                if (!isEverDragged) return; // user has to drag before rotating the ROI
                // console.log("Zach keydown: " + e.keyCode);
                if (e.keyCode == 81) { // press Q: rotate counter-clockwise
                    rotateAngle += -5;
                }
                if (e.keyCode == 69) { // press E: rotate clockwise
                    rotateAngle += 5;
                }
                if (e.keyCode == 81 || e.keyCode == 69) { // update canvas
                    tROIImageData = [];
                    tROIData = [];
                    // draw transformed ROI first time for getting image data
                    for (var numseg = 0; numseg < currId.length; numseg++) {
                        createImageBitmap(ROIImageData[numseg]).then(img => {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            ctx.save();
                            var cx = dragFinishX - ROIcenterX, cy = dragFinishY - ROIcenterY;
                            var rotang = rotateAngle * Math.PI / 180;
                            ctx.translate(ROIcenterX, ROIcenterY);
                            ctx.rotate(rotang);
                            ctx.translate(-ROIcenterX, -ROIcenterY);
                            // Decompose the offset to new directions
                            var cx_new = cx / Math.cos(Math.atan2(cy, cx)) * Math.cos(Math.atan2(cy, cx) - rotang);
                            var cy_new = cy / Math.sin(Math.atan2(cy, cx)) * Math.sin(Math.atan2(cy, cx) - rotang);
                            ctx.drawImage(img, cx_new, cy_new);
                            ctx.restore();
                            tROIImageData.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
                        });
                    }
                    // draw non-ROI image
                    createImageBitmap(prevImageData).then(img => ctx.drawImage(img, 0, 0));
                    // draw transformed ROI again
                    for (var numseg = 0; numseg < currId.length; numseg++) {
                        createImageBitmap(ROIImageData[numseg]).then(img => {
                            ctx.save();
                            var cx = dragFinishX - ROIcenterX, cy = dragFinishY - ROIcenterY;
                            var rotang = rotateAngle * Math.PI / 180;
                            ctx.translate(ROIcenterX, ROIcenterY);
                            ctx.rotate(rotang);
                            ctx.translate(-ROIcenterX, -ROIcenterY);
                            // Decompose the offset to new directions
                            var cx_new = cx / Math.cos(Math.atan2(cy, cx)) * Math.cos(Math.atan2(cy, cx) - rotang);
                            var cy_new = cy / Math.sin(Math.atan2(cy, cx)) * Math.sin(Math.atan2(cy, cx) - rotang);
                            ctx.drawImage(img, cx_new, cy_new);
                            ctx.restore();
                        });
                    }
                    document.getElementById("rotateAngle").innerHTML = rotateAngle;
                }
            }, true);
            is2DEventListenersAdded = 1;
        }

        // console.log("Zach two_d_points: " + two_d_points[0] + ", " + two_d_points[1]);
        return;
    }

    // do not allow choosing other segments when one of animation modes is on
    if (two_d || three_d || clr || ann) return;
    // do not allow segment -1 to be selected (black hole)
    if (pixelsDict[X + Y * gcols] < 0) return;

    if (currId.includes(pixelsDict[X + Y * gcols])) {
    	currId.splice(currId.indexOf(pixelsDict[X + Y * gcols]), 1);
    	exists = true;
    }
    else {
    	currId.push(pixelsDict[X + Y * gcols]);
    }

    var all_segs = "";
    for (var i = 0; i < currId.length; i++) {
    	if (all_segs.length == 0)
    		all_segs += currId[i];
    	else
    		all_segs = all_segs + ", " + currId[i];
    }

    // display segment #
    document.getElementById("segment#").innerHTML = currId.length;


    // change segment color in image
    var canvas = document.getElementById("bgcanvas");
    var ctx = canvas.getContext("2d");
    var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var canvasData = canvasImageData.data;

    var newImageData = ctx.createImageData(gcols, grows);
    var newData = newImageData.data;

    var segImageData = segResultImage.data;

    for (var i = 0; i < newData.length; i += 4) {
        // highlight segment
        if (!exists && pixelsDict[i/4] == pixelsDict[X + Y * gcols]) { 
            newData[i]     = (255 * 100 + canvasData[i] * 255) / 355; // red
            newData[i + 1] = canvasData[i + 1] * 0.75; // green
            newData[i + 2] = canvasData[i + 2] * 0.75; // blue
            newData[i + 3] = 255; // alpha
        }
        // unhighlight segment
        else if (exists && pixelsDict[i/4] == pixelsDict[X + Y * gcols]) {
            newData[i]     = (canvasData[i] - 25500/355) * 355/255; // red
            newData[i + 1] = canvasData[i + 1] / 0.75; // green
            newData[i + 2] = canvasData[i + 2] / 0.75; // blue
            newData[i + 3] = 255 // alpha
        }
        // else same keep image same
        else {
            newData[i]     = canvasData[i]; // red
            newData[i + 1] = canvasData[i + 1]; // green
            newData[i + 2] = canvasData[i + 2]; // blue
            newData[i + 3] = canvasData[i + 3]; // alpha
        }
    }

    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    createImageBitmap(newImageData).then(img => ctx.drawImage(img, 0, 0));
}



// highlight points for 2d and 3d transformations
function highlight_points(points, X, Y, highlight) {
    var canvas = document.getElementById("bgcanvas");
    var ctx = canvas.getContext("2d");
    var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var canvasData = canvasImageData.data;

    newImageData = ctx.createImageData(gcols, grows);
    var newData = newImageData.data;

    var segImageData = segResultImage.data;
    var currY = 0;


    for (var i = 0; i < newData.length; i += 4) {
        // get segment #
        var currX = i/4 % 640;
        if (currX == 0)
            currY++;


        // highlight point
        if (highlight) {
            if ((currX == X && currY == Y) || (currX == X+1 && currY == Y+1) ||
                (currX == X+1 && currY == Y) || (currX == X+1 && currY == Y-1) ||
                (currX == X-1 && currY == Y+1) || (currX == X-1 && currY == Y) ||
                (currX == X-1 && currY == Y-1) || (currX == X && currY == Y-1) ||
                (currX == X && currY == Y+1)) { 
                if ((three_d && points.length > 4) || (two_d && points.length > 1)) {
                    newData[i]     = 0; // red
                    newData[i + 1] = 0; // green
                    newData[i + 2] = 255; // blue
                    newData[i + 3] = segImageData[i + 3]; // alpha
                }
                else {
                    newData[i]     = 0; // red
                    newData[i + 1] = 255; // green
                    newData[i + 2] = 0; // blue
                    newData[i + 3] = segImageData[i + 3]; // alpha
                }

            }
            // else same keep image same
            else {
                newData[i]     = canvasData[i]; // red
                newData[i + 1] = canvasData[i + 1]; // green
                newData[i + 2] = canvasData[i + 2]; // blue
                newData[i + 3] = canvasData[i + 3]; // alpha
            }
        }

        // unhighlight point
        else { 
            if((canvasData[i] == 0 && canvasData[i + 1] == 0 && canvasData[i + 2] == 255) || 
                (canvasData[i] == 0 && canvasData[i + 1] == 255 && canvasData[i + 2] == 0)) {
                newData[i]     = segImageData[i]; // red
                newData[i + 1] = segImageData[i+1]; // green
                newData[i + 2] = segImageData[i+2]; // blue
                newData[i + 3] = segImageData[i + 3]; // alpha
            }

        }
    }

    ctx.globalAlpha = 1;
    createImageBitmap(newImageData).then(img => ctx.drawImage(img, 0, 0));
}


var color, rotation = 0;



// ADD_FRAME
// move selected segment
$("#addframe_button").click(function() {
    line = "";
    var duration = document.getElementById("duration").value;
    if (duration.length == 0) {
        alert("Please enter duration");
        return;
    }
    if (frame_count >= 7) {
        alert("Too many frames, click finish");
        currId = [];
        document.getElementById("undo_button").disabled = true;
        return;
    }
    if (currId.length == 0) {
        alert("Select at least one segment");
        return;
    }
    if (!(two_d || three_d || clr || ann)) {
        alert("Please specify animation");
        return;
    }

    frame_count++;
    document.getElementById("frameCount").innerHTML = frame_count;

    // get info for all selected segments
    for (var i=0; i < currId.length; i++) {
        var info = segInfo[currId[i]];
        var x_center = info[0];
        var y_center = info[1];
        var area = info[2];

        line = line + x_center + " " + y_center + " " + area + " ";
    }

    var timeline = document.getElementById("timeline");
    var tctx = timeline.getContext("2d");
    // 2D transformation
    if (two_d) {
        // reset animation scheme mode
        two_d = false;
        document.getElementById("2d_button").style.background = "#4CAF50";
        document.getElementById("twod_table").style.display = "none";

        rotation = document.getElementById("rotateAngle").innerHTML;
        rotation = -rotation; // due to inconsistency between UI and binary

        // compute dx and dy
        targetX = two_d_points[1].split(" ")[0] - two_d_points[0].split(" ")[0];
        targetY = two_d_points[1].split(" ")[1] - two_d_points[0].split(" ")[1];

        if (document.getElementById("quadratic").checked)
            line = line + "4 " + targetX + " " + targetY + " " + rotation + " " + duration;
        else
            line = line + "0 " + targetX + " " + targetY + " " + rotation + " " + duration;

        two_d = false;
        two_d_points = [];

        var canvas = document.getElementById("bgcanvas");
        var ctx = canvas.getContext("2d");
        var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var canvasData = canvasImageData.data;
        // go over every segment inside the ROI
        for (var numseg = 0; numseg < currId.length; numseg++) {
            tROIData[numseg] = tROIImageData[numseg].data;
            for (var i = 0; i < tROIData[numseg].length; i += 4) {
                if (pixelsDict[i/4] == currId[numseg]) {
                    if (pixelsDict[i/4] == pixelsDictOri[i/4]) { // mark the previous ROI pixels as segment -1
                        pixelsDict[i/4] = -1;
                    } else { // or mark them as the original values
                        pixelsDict[i/4] = pixelsDictOri[i/4];
                    }
                }
            }
            for (var i = 0; i < tROIData[numseg].length; i += 4) {
                // unhighlight pixels in the selected ROI
                if (tROIData[numseg][i + 3] >= 128) {
                    canvasData[i] = (canvasData[i] - 25500/355) * 355/255;
                    canvasData[i + 1] = canvasData[i + 1] / 0.75;
                    canvasData[i + 2] = canvasData[i + 2] / 0.75;
                    canvasData[i + 3] = 255;
                    // overlay segment ID to the transformed ROI
                    pixelsDict[i/4] = currId[numseg];
                }
            }
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        createImageBitmap(canvasImageData).then(img => {
            ctx.drawImage(img, 0, 0);
            // update timeline
            tctx.drawImage(img, frame_count * 165, 0, 160, 120);
            undoImageList.push(img);
        });

        // remove all event listeners
        clearPrevEventlisteners();
    }
    // 3D transformation
    else if (three_d) {
        // reset animation scheme mode
        three_d = false;
        document.getElementById("3d_button").style.background = "#4CAF50";
        document.getElementById("threed_table").style.display = "none";

        if (document.getElementById("quadratic").checked)
            line = line + "5 ";
        else
            line = line + "1 ";

        for (var point of three_d_points) {
            line = line + point + " ";
        }

        line += duration;

        three_d = false;
        three_d_points = [];

        // unhighlight points
        var canvas = document.getElementById("top"),
        context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);

        canvas = document.getElementById("bgcanvas");
        var ctx = canvas.getContext("2d");
        var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var canvasData = canvasImageData.data;
        // go over every segment inside the ROI
        for (var numseg = 0; numseg < currId.length; numseg++) {
            tROIData[numseg] = tROIImageData[numseg].data;
            for (var i = 0; i < tROIData[numseg].length; i += 4) {
                if (pixelsDict[i/4] == currId[numseg]) {
                    if (pixelsDict[i/4] == pixelsDictOri[i/4]) { // mark the previous ROI pixels as segment -1
                        pixelsDict[i/4] = -1;
                    } else { // or mark them as the original values
                        pixelsDict[i/4] = pixelsDictOri[i/4];
                    }
                }
            }
            for (var i = 0; i < tROIData[numseg].length; i += 4) {
                // unhighlight pixels in the selected ROI
                if (tROIData[numseg][i + 3] >= 128) {
                    canvasData[i] = (canvasData[i] - 25500/355) * 355/255;
                    canvasData[i + 1] = canvasData[i + 1] / 0.75;
                    canvasData[i + 2] = canvasData[i + 2] / 0.75;
                    canvasData[i + 3] = 255;
                    // overlay segment ID to the transformed ROI
                    pixelsDict[i/4] = currId[numseg];
                }
            }
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        createImageBitmap(canvasImageData).then(img => {
            ctx.drawImage(img, 0, 0);
            // update timeline
            tctx.drawImage(img, frame_count * 165, 0, 160, 120);
            undoImageList.push(img);
        });

        // remove all event listeners
        clearPrevEventlisteners();

    }
    // color
    else if (clr) {
        // reset animation scheme mode
        clr = false;
        document.getElementById("color_button").style.background = "#4CAF50";
        document.getElementById("color_table").style.display = "none";

        if (document.getElementById("quadratic").checked)
            line = line + "6 " + del_hue + " " + duration;
        else
            line = line + "2 " + del_hue + " " + duration;

        var canvas = document.getElementById("bgcanvas");
        var ctx = canvas.getContext("2d");
        var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        createImageBitmap(canvasImageData).then(img => {
            ctx.drawImage(img, 0, 0);
            // update timeline
            tctx.drawImage(img, frame_count * 165, 0, 160, 120);
            undoImageList.push(img);
        });
    }
    // annotation
    else if (ann) {
        // reset animation scheme mode
        ann = false;
        document.getElementById("annotation_button").style.background = "#4CAF50";
        document.getElementById("annotation_table").style.display = "none";

        annotation = document.getElementById("annotation").value;
        if (annotation == "") annotation = "Note"; // put default value in case binary fails
        // trim whitespaces and replace those in the middle to underscores
        annotation = annotation.trim().replace(/ /g, "_");
        line = line + "3 " + annotation + " " + duration;
        document.getElementById("annotation").value = "";

        // unhighlight the ROI
        var canvas = document.getElementById("bgcanvas");
        var ctx = canvas.getContext("2d");
        var canvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var canvasData = canvasImageData.data;
        // go over every segment inside the ROI
        for (var i = 0; i < canvasData.length; i += 4) {
            // unhighlight pixels in the selected ROI
            if (currId.includes(pixelsDict[i/4])) {
                canvasData[i] = (canvasData[i] - 25500/355) * 355/255;
                canvasData[i + 1] = canvasData[i + 1] / 0.75;
                canvasData[i + 2] = canvasData[i + 2] / 0.75;
                canvasData[i + 3] = 255;
            }
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        createImageBitmap(canvasImageData).then(img => {
            ctx.drawImage(img, 0, 0);
            // update timeline
            tctx.drawImage(img, frame_count * 165, 0, 160, 120);
            undoImageList.push(img);
        });
    }

    line = currId.length + " " + line;
    line += "\n";
    file_output += line;

    // print encoded texts
    console.log("frame added");
    // console.log(file_output);
    currId = [];
    tROIImageData = [];
    tROIData = [];
    ROIImageData3D = [];
    document.getElementById("segment#").innerHTML = currId.length;

    undoPixelsDict.push(jQuery.extend([], pixelsDict)); // deep copy
});



// WRITE_FRAMES
// write frames to file
$("#writeframes_button").click(function() {
    // do nothing if no frame added
    if (frame_count == 0) return;
    if (currId.length > 0) {
        alert("Please add the current frame before finish");
        return; // disable finish if any segment selected
    }

    // information before the keyframes: QR code landmarks, segmentation parameters, frame count
    var file_output_prefix = qr_landmarks + "\n";
    file_output_prefix += (20*document.getElementById("param1").value).toString() + " ";
    file_output_prefix += "0.0" + (25*document.getElementById("param2").value).toString() + " ";
    file_output_prefix += "20 ";
    file_output_prefix += (3*document.getElementById("param4").value).toString() + "\n";
    file_output_prefix += frame_count + "\n";
    file_output = file_output_prefix + file_output;

    // remove last newline
    // file_output = file_output.replace(/\n$/, "");
    // var blob = new Blob([file_output], {type: "text/plain;charset=utf-8"});
    // saveAs(blob, "qr.txt");

    // generate and download qr code
    var segs = qrcodegen.QrSegment.makeSegments(file_output);
    var qrcode = qrcodegen.QrCode.encodeSegments(segs, qrcodegen.QrCode.Ecc.LOW, 13, 13);
    var canvas = document.getElementById("qrcanvas");
    // qrcode.drawCanvas(11, 0, canvas);

    // run binary to create video
    // $.ajax({
    //     type: "POST",
    //     url: "video.php",
    //     data: {"scene_name": scene_name},
    //     success: function() {
    //         console.log("Message sent to php: " + scene_name);
    //     }
    // });
    let finish_form = document.createElement("form");
    finish_form.action = "finish";
    finish_form.method = "post";
    finish_form.innerHTML = "<input type='hidden' name='authored_qr'>";
    finish_form.authored_qr.value = file_output;
    document.body.append(finish_form);
    finish_form.submit();

    file_output = "";
    frame_count = 0;
    frame_preview = "";
});


$("#undo_button").click(function() {
    if (frame_count == 0) return;
    if (currId.length > 0) {
        alert("Please add the current frame before undo");
        return; // disable undo if any segment selected
    }
    console.log("Frame undone");
    frame_count--;
    document.getElementById("frameCount").innerHTML = frame_count;
    undoImageList.pop();
    // recover main canvas
    var canvas = document.getElementById("bgcanvas");
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(undoImageList[frame_count], 0, 0);
    // recover timeline
    var timeline = document.getElementById("timeline");
    var tctx = timeline.getContext("2d");
    tctx.clearRect((frame_count+1) * 165, 0, 160, 120);
    // recover pixelsDict
    undoPixelsDict.pop();
    pixelsDict = undoPixelsDict[frame_count];
    // remove the last line
    file_output = file_output.split("\n").slice(0, -2).join("\n") + "\n";
    if (frame_count == 0) file_output = "";
    console.log(file_output);
});



// read index_matrix.csv
function readSegments(segmentsdata) {
    segments = $.csv.toArrays(segmentsdata);
    parseSegments();

    // read from file
    // var reader = new FileReader();
    // var csv = "";
    // reader.onload = function() {
    //     csv = this.result;
    //     segments = $.csv.toArrays(csv);
    //     parseSegments();
    // };
    // reader.readAsText(segmentsfile);

}


// store each segment ID with its coordinate
function parseSegments() {
    var rows = segments.length;
    var cols = segments[0].length;
    
    // keeps track of existing segments when initializing image map
    var existingSegments = [];
    var count = 0;

    for (var i = 0; i < rows; i++) {
        for (var j = 0; j < cols; j++) {
            // add segment IDs
            var id = segments[i][j];
            if (id.length != 0) {
               pixelsDict[count] = id;
               pixelsDictOri[count] = id;
               count++;
           }

       }
   }
   undoPixelsDict = [];
   undoPixelsDict.push(jQuery.extend([], pixelsDict)); // deep copy
   console.log("segment parsing complete");
}

// read raw_matching_input.csv
function readSegmentsInfo(segmentsinfodata) {

    segmentsinfo = $.csv.toArrays(segmentsinfodata);
    parseSegmentsInfo();

    // read from file
    // var reader = new FileReader();
    // var csv = "";
    // reader.onload = function() {
    //     csv = this.result;
    //     segmentsinfo = $.csv.toArrays(csv);
    //     parseSegmentsInfo();
    // };
    // reader.readAsText(segmentsinfofile);

}

function parseSegmentsInfo() {
    var rows = segmentsinfo.length;
    var cols = segmentsinfo[0].length;
    

    for (var i=0; i < rows; i++) {
        for (var j=0; j < cols; j++) {
            // get segment info
            var id = segmentsinfo[i][j];
            var x_center = segmentsinfo[i][++j];
            var y_center = segmentsinfo[i][++j];
            var area = segmentsinfo[i][++j];
            
            // create list, add to dictionary
            var info = [x_center, y_center, area];
            segInfo[id] = info;
        }
    }

    console.log("segment info parsing complete");
}

// try segmentation parameters
function update() {
    document.getElementById("setseg_button").disabled = false;

    filename = scene_name + "seg_";
    if (document.getElementById("param1").value == 1) {
        filename += "20_";
        seg_param.splice(0, 1, 20);
    } else if (document.getElementById("param1").value == 2) {
        filename += "40_";
        seg_param.splice(0, 1, 40);
    } else if (document.getElementById("param1").value == 3) {
        filename += "60_";
        seg_param.splice(0, 1, 60);
    } else if (document.getElementById("param1").value == 4) {
        filename += "80_";
        seg_param.splice(0, 1, 80);
    } else {
        filename += "100_";
        seg_param.splice(0, 1, 100);
    }
    if (document.getElementById("param2").value == 1) {
        filename += "0.025000_";
        seg_param.splice(1, 1, 0.025);
    } else if (document.getElementById("param2").value == 2) {
        filename += "0.050000_";
        seg_param.splice(1, 1, 0.050);
    } else {
        filename += "0.075000_";
        seg_param.splice(1, 1, 0.075);
    }
    // if (document.getElementById("param3").value == 1) {
        filename += "20_";
    // }
    if (document.getElementById("param4").value == 1) {
        filename += "3_";
        seg_param.splice(3, 1, 3);
    } else if (document.getElementById("param4").value == 2) {
        filename += "6_";
        seg_param.splice(3, 1, 6);
    } else {
        filename += "9_";
        seg_param.splice(3, 1, 9);
    }
    var seg_result = filename + "result.png";

    var img = new Image();
    img.addEventListener("load", function() {
        var canvas = document.getElementById("bgcanvas");
        context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        segResultImage = context.getImageData(0, 0, canvas.width, canvas.height);
        newImageData = segResultImage;
        oriImageData = context.getImageData(0, 0, canvas.width, canvas.height);
        oriData = oriImageData.data;

        var timeline = document.getElementById("timeline");
        var tctx = timeline.getContext("2d");
        tctx.drawImage(img, 0, 0, 160, 120);
        undoImageList = [];
        undoImageList.push(img);
    }, false);
    // img.src = seg_result;
    img.src = "http://tracer.cs.yale.edu:2018/get_userdata?file=" + seg_result;
}


// set segmentation parameters
$("#setseg_button").click(function() {
    // REMOVE testing
    // filename = "../PATH/seg_40_0.015000_20_9_";
    $.ajax({
        // url: filename + "index.csv"
        url: "http://tracer.cs.yale.edu:2018/get_userdata?file=" + filename + "index.csv"
    }).done(function(data) {
        readSegments(data);
    });

    $.ajax({
        // url: filename + "feature.csv"
        url: "http://tracer.cs.yale.edu:2018/get_userdata?file=" + filename + "feature.csv"
    }).done(function(data) {
        readSegmentsInfo(data);
    });

    // disable the paramter sliders
    document.getElementById("param1").disabled = true;
    document.getElementById("param2").disabled = true;
    document.getElementById("param4").disabled = true;
    document.getElementById("setseg_button").disabled = true;

    // disable the scene picker
    // document.getElementById("test").disabled = true;
    // document.getElementById("blocks").disabled = true;
    // document.getElementById("coffee").disabled = true;
    // document.getElementById("ink").disabled = true;
    // document.getElementById("map").disabled = true;
    // document.getElementById("vase").disabled = true;
});
