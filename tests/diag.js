/**
 * 标定 MAX_SLIDE：用「单块铺开宽度」衡量沙子能流多远
 * node tests/diag.js
 */
require('../core.js');
var C = globalThis.TrisCore;
var W = C.W, H = C.H, SUB = C.SUB;

function settle(grid, slides, limit) {
  var t = 0;
  while (t < 200000) { t++; if (C.stepSand(grid, null, slides, limit) === 0) break; }
  return t;
}

function drop(grid, slides, shape, cx, color, limit) {
  var cy = 0;
  while (!C.collides(grid, shape, cx, cy + 1)) cy++;
  C.paintPiece(grid, shape, cx, cy, color, slides);
  return settle(grid, slides, limit);
}

function footprint(grid) {
  var minX = W, maxX = -1, maxH = 0;
  for (var x = 0; x < W; x++) {
    for (var y = 0; y < H; y++) {
      if (grid[y * W + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        var h = H - y;
        if (h > maxH) maxH = h;
        break;
      }
    }
  }
  return { width: maxX - minX + 1, height: maxH };
}

var O = [[1, 1], [1, 1]];

console.log('单块 O 落在中间，看铺开宽度（1 格 = ' + SUB + ' 颗粒）\n');
console.log('MAX_SLIDE | 铺开宽度(颗粒) | 宽度(格) | 最高(颗粒) | 最高(格)');
console.log('----------|---------------|---------|-----------|---------');

[4, 6, 8, 12, 16, 24, 32, 48, 99].forEach(function (limit) {
  var g = C.createGrid();
  var s = new Uint8Array(W * H);
  drop(g, s, O, 4, 1, limit);
  var f = footprint(g);
  console.log(
    String(limit).padStart(9) + ' |' +
    String(f.width).padStart(15) + ' |' +
    (f.width / SUB).toFixed(1).padStart(8) + ' |' +
    String(f.height).padStart(10) + ' |' +
    (f.height / SUB).toFixed(1).padStart(9)
  );
});
