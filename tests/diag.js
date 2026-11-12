/**
 * 诊断：连续在中间丢 15 块，看沙堆会不会堆成山
 * node tests/diag.js
 */
require('../core.js');
var C = globalThis.TrisCore;
var W = C.W, H = C.H, SUB = C.SUB;

function settle(grid, slides, limit) {
  var t = 0;
  while (t < 400000) { t++; if (C.stepSand(grid, null, slides, limit) === 0) break; }
  return t;
}

function drop(grid, slides, shape, cx, color, limit) {
  var cy = 0;
  while (!C.collides(grid, shape, cx, cy + 1)) cy++;
  C.paintPiece(grid, shape, cx, cy, color, slides);
  settle(grid, slides, limit);
}

function profile(grid) {
  var maxH = 0, minX = W, maxX = -1;
  for (var x = 0; x < W; x++) {
    for (var y = 0; y < H; y++) {
      if (grid[y * W + x]) {
        var h = H - y;
        if (h > maxH) maxH = h;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        break;
      }
    }
  }
  return { h: maxH, w: maxX - minX + 1 };
}

var O = [[1, 1], [1, 1]];

console.log('连续 15 块全部丢在正中间\n');
console.log('MAX_SLIDE | 堆高(格) | 底宽(格) | 平均坡度');
console.log('----------|----------|----------|----------');

[0, 8, 16, 32, 99].forEach(function (limit) {
  var g = C.createGrid();
  var s = new Uint8Array(W * H);
  for (var i = 0; i < 15; i++) drop(g, s, O, 4, 1, limit);
  var p = profile(g);
  var hc = p.h / SUB, wc = p.w / SUB;
  console.log(
    String(limit === 0 ? '不限流' : limit).padStart(9) + ' |' +
    hc.toFixed(1).padStart(9) + ' |' +
    wc.toFixed(1).padStart(9) + ' |' +
    (hc / (wc / 2)).toFixed(2).padStart(9)
  );
});
