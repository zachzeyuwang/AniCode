// https://github.com/simonsarris/Canvas-tutorials/blob/master/shapes.js


// Constructor for Shape objects to hold data for all drawn objects.
// For now they will just be defined as rectangles.
function Shape(x, y, w, h, i, m) {
  // This is a very simple and unsafe constructor. All we're doing is checking if the values exist.
  // "x || 0" just means "if there is a value for x, use that. Otherwise use 0."
  // But we aren't checking anything else! We could put "Lalala" for the value of x 
  this.x = x || 0;
  this.y = y || 0;
  this.w = w || 1;
  this.h = h || 1;
  this.index = i;
  this.moved = m;
  if (x == 300)
    this.fill = '#00ff7f';
  else
    this.fill = '#ff00fe';
}

// Draws this shape to a given context
Shape.prototype.draw = function(ctx) {
  ctx.fillStyle = this.fill;
  ctx.fillRect(this.x, this.y, this.w, this.h);
}

// Determine if a point is inside the shape's bounds
Shape.prototype.contains = function(mx, my) {
  // All we have to do is make sure the Mouse X,Y fall in the area between
  // the shape's X and (X + Width) and its Y and (Y + Height)
  return  (this.x <= mx) && (this.x + this.w >= mx) &&
          (this.y <= my) && (this.y + this.h >= my);
}

// erase rectangle
Shape.prototype.clear = function(ctx) {
  ctx.clearRect(this.x, this.y, this.w, this.h);
}



function CanvasState(canvas, document) {
  // **** First some setup! ****
  
  this.canvas = canvas;
  this.width = canvas.width;
  this.height = canvas.height;
  this.ctx = canvas.getContext('2d');

  // Some pages have fixed-position bars (like the stumbleupon bar) at the top or left of the page
  // They will mess up mouse coordinates and this fixes that
  var html = document.body.parentNode;
  this.htmlTop = html.offsetTop;
  this.htmlLeft = html.offsetLeft;

  // **** Keep track of state! ****
  
  this.valid = false; // when set to false, the canvas will redraw everything
  this.shapes = [];  // the collection of things to be drawn
  this.prevshapes = [];
  this.dragging = false; // Keep track of when we are dragging
  // the current selected object. In the future we could turn this into an array for multiple selection
  this.selection = null;
  this.dragoffx = 0; // See mousedown and mousemove events for explanation
  this.dragoffy = 0;
  this.ptsclicked = 0;
  this.origdatasaved = false;
  this.set_green = false;
  this.show_purple = false;

  var myState = this;

  // draw 8 rectangles
  this.shapes.push(new Shape(300,300,12,12, 1, false));
  this.shapes.push(new Shape(300,320,12,12, 2, false));
  this.shapes.push(new Shape(300,340,12,12, 3, false));
  this.shapes.push(new Shape(300,360,12,12, 4, false));
  

  // myState.clear();
  
  // Up, down, and move are for dragging
  canvas.addEventListener('mousedown', function(e) {
    var mouse = myState.getMouse(e);
    var mx = mouse.x;
    var my = mouse.y;
    var shapes = myState.shapes;
    var l = shapes.length;
    for (var i = l-1; i >= 0; i--) {
      if (shapes[i].contains(mx, my)) {
        var mySel = shapes[i];
        mySel.moved = true;

        // don't move green pins if original 4 pins are set
        if (myState.set_green && mySel.index < 5)
          return;

        // Keep track of where in the object we clicked
        // so we can move it smoothly (see mousemove)
        myState.dragoffx = mx - mySel.x;
        myState.dragoffy = my - mySel.y;
        myState.dragging = true;
        myState.selection = mySel;
        myState.valid = false;
        return;
      }
    }
    // havent returned means we have failed to select anything.
    // If there was an object selected, we deselect it
    if (myState.selection) {
      myState.selection = null;
      myState.valid = false; // Need to clear the old selection border
    }
  }, true);
  canvas.addEventListener('mousemove', function(e) {
    if (myState.dragging){
      var mouse = myState.getMouse(e);
      // We don't want to drag the object by its top-left corner, we want to drag it
      // from where we clicked. Thats why we saved the offset and use it here
      myState.selection.x = mouse.x - myState.dragoffx;
      myState.selection.y = mouse.y - myState.dragoffy;   
      myState.valid = false; // Something's dragging so we must redraw


      // compute homography
      var shapes = myState.shapes;
      var l = shapes.length;
      var pts1 = [];
      var pts2 = [];
      for (var i = l-1; i >= 0; i--) { 
          var shape = shapes[i];
          if (shape.index < 5) {
            if (shape.index == 1 || shape.index == 5) {
              pts1.push(shape.x+6); 
              pts1.push(shape.y+6);
            }
            if (shape.index == 2 || shape.index == 6) {
              pts1.push(shape.x+6); 
              pts1.push(shape.y+6);
            }
            if (shape.index == 3 || shape.index == 7) {
              pts1.push(shape.x+6); 
              pts1.push(shape.y+6);
            }
            if (shape.index == 4 || shape.index == 8) {
              pts1.push(shape.x+6); 
              pts1.push(shape.y+6);
            }
            
          }
          else {
            if (shape.index == 1 || shape.index == 5) {
              pts2.push(shape.x+6); 
              pts2.push(shape.y+6);
            }
            if (shape.index == 2 || shape.index == 6) {
              pts2.push(shape.x+6); 
              pts2.push(shape.y+6);
            }
            if (shape.index == 3 || shape.index == 7) {
              pts2.push(shape.x+6); 
              pts2.push(shape.y+6);
            }
            if (shape.index == 4 || shape.index == 8) {
              pts2.push(shape.x+6); 
              pts2.push(shape.y+6);
            }
          }
      }

      if (myState.set_green) {
        myState.origdatasaved = true;
        myState.homography(pts1, pts2);
      }

    }
  }, true);
  canvas.addEventListener('mouseup', function(e) {
    myState.dragging = false;
    three_d_points = [];
    var shapes = myState.shapes;
    var l = shapes.length;
    
    for (var i = 0; i < l; i++) { 
        var shape = shapes[i];
        var x, y; 
        // shift coordinates to middle
        if (shape.index == 1 || shape.index == 5) {
          x = shape.x + 6;
          y = shape.y + 6;
        }
        if (shape.index == 2 || shape.index == 6) {
          x = shape.x + 6;
          y = shape.y + 6;
        }
        if (shape.index == 3 || shape.index == 7) {
          x = shape.x + 6;
          y = shape.y + 6;
        }
        if (shape.index == 4 || shape.index == 8) {
          x = shape.x + 6;
          y = shape.y + 6;
        }

        var c = x + " " + y;
        three_d_points.push(c);

    }

  }, true);

  canvas.addEventListener('keydown', function(e) {
    var keyCode = e.keyCode;
    var shapes = myState.shapes;
    var all_moved = true;
    if (keyCode == 87) {
        for (var i = 0; i < shapes.length; i++) {
          if (!shapes[i].moved) all_moved = false;
        }
        if (all_moved) {
          myState.set_green = true;
          document.getElementById("addframe_button").disabled = false;
        }
        else {
          alert("Please move all 4 green points");
          return;
        }
    }
    simulate_click();

  }, true);


  this.interval = 30;
  setInterval(function() { myState.draw(); }, myState.interval);
}


// Creates an object with x and y defined, set to the mouse position relative to the state's canvas
// If you wanna be super-correct this can be tricky, we have to worry about padding and borders
CanvasState.prototype.getMouse = function(e) {
  var element = this.canvas, offsetX = 0, offsetY = 0, mx, my;
  
  // Compute the total offset
  if (element.offsetParent !== undefined) {
    do {
      offsetX += element.offsetLeft;
      offsetY += element.offsetTop;
    } while ((element = element.offsetParent));
  }

  // Add padding and border style widths to offset
  // Also add the <html> offsets in case there's a position:fixed bar
  // offsetX += this.stylePaddingLeft + this.styleBorderLeft + this.htmlLeft;
  // offsetY += this.stylePaddingTop + this.styleBorderTop + this.htmlTop;
  offsetX += this.htmlLeft;
  offsetY += this.htmlTop;

  mx = e.pageX - offsetX;
  my = e.pageY - offsetY;
  
  // We return a simple javascript object (a hash) with x and y defined
  return {x: mx, y: my};
}

CanvasState.prototype.getShape = function(i) {
  for (var idx = 0; idx < this.shapes.length; idx++) {
    if (this.shapes[idx].index == i)
      return this.shapes[idx];
  }
  
}

// While draw is called as often as the INTERVAL variable demands,
// It only ever does something if the canvas gets invalidated by our code
CanvasState.prototype.draw = function() {

  // if our state is invalid, redraw and validate!
  if (!this.valid) {
    var ctx = this.ctx;
    var shapes = this.shapes;
    this.clear();
    
    // ** Add stuff you want drawn in the background all the time here **

    if (this.set_green) {

      // if no purple points rendered then create points in same locations as green points
      if (!this.show_purple) {
        this.show_purple = true;

        this.shapes.push(new Shape(this.getShape(1).x,this.getShape(1).y,12,12, 5, false));
        this.shapes.push(new Shape(this.getShape(2).x,this.getShape(2).y,12,12, 6, false));
        this.shapes.push(new Shape(this.getShape(3).x,this.getShape(3).y,12,12, 7, false));
        this.shapes.push(new Shape(this.getShape(4).x,this.getShape(4).y,12,12, 8, false));
      }

      // show all pins
      var l = shapes.length;
      for (var i = 0; i < l; i++) {
        var shape = shapes[i];
        // We can skip the drawing of elements that have moved off the screen:
        if (shape.x > this.width || shape.y > this.height ||
            shape.x + shape.w < 0 || shape.y + shape.h < 0) continue;

          // don't show green points
          if (shapes[i].index > 4)
            shapes[i].draw(ctx);
        }

    }
    
    else {
      // show green pins
      var l = shapes.length;
      for (var i = 0; i < l; i++) {
        var shape = shapes[i];
        // We can skip the drawing of elements that have moved off the screen:
        if (shape.x > this.width || shape.y > this.height ||
            shape.x + shape.w < 0 || shape.y + shape.h < 0) continue;
        if (shapes[i].index < 5)
          shapes[i].draw(ctx);
      }

    }
    

    // store current shapes as previous shapes
    for (var i = 0; i < l; i++) {
      var shape = shapes[i];
      // We can skip the drawing of elements that have moved off the screen:
      if (shape.x > this.width || shape.y > this.height ||
          shape.x + shape.w < 0 || shape.y + shape.h < 0) continue;
      this.prevshapes.push(new Shape(shape.x,shape.y,shape.w,shape.h, false));
    }

    
    // ** Add stuff you want drawn on top all the time here **
    
    this.valid = true;
  }
}


CanvasState.prototype.clear = function() {

  // clear canvas and repopulate with base image
  this.ctx.clearRect(0, 0, this.width, this.height);
}

CanvasState.prototype.homography = function(src, dst) {

  var perspT = PerspT(src, dst);
  var mat = perspT.coeffs;
  homography = mat;

  apply_homography(src, dst);
}

