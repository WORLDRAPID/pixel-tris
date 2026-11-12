/**
 * 对比不同 MAX_SLIDE 下沙堆的高度分布
 * node tests/diag.js
 */
require('../core.js');
var C = globalThis.TrisCore;
var W = C.W, H = C.H, SUB = C.SUB;

function settle(grid, slides, limit) {
  var t = 0;
  while (t < 60000) { t++; if (C.stepSand(grid, null, slides, limit) === 0) break; }
  return t;
}

function drop(grid, slides, shape, cx, color, limit) {
  var cy = 0;
  while (!C.collides(grid, shape, cx, cy + 1)) cy++;
  C.paintPiece(grid, shape, cx, cy, color, slides);
  return settle(grid, slides, limit);
}

function heights(grid) {
  var hs = [];
  for (var cx = 0; cx < C.COLS; cx++) {
    var top = H;
    for (var y = 0; y < H; y++) {
      var has = false;
      for (var dx = 0; dx < SUB; dx++) if (grid[y * W + cx * SUB + dx]) { has = true; break; }
      if (has) { top = y; break; }
    }
    hs.push(Math.round((H - top) / SUB));
  }
  return hs;
}

var shapes = [
  [[1, 1], [1, 1]],
  [[1, 1, 1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [0, 1, 1]],
  [[1, 0, 0], [1, 1, 1]]
];
var seq = [4, 8, 0, 6, 3, 8, 5, 1, 7, 2, 8, 6];

[1, 2, 3, 6, 99].forEach(function (limit) {
  var g = C.createGrid();
  var s = new Uint8Array(W * H);
  for (var i = 0; i < seq.length; i++) {
    var sh = shapes[i % shapes.length];
    drop(g, s, sh, Math.min(seq[i], 10 - sh[0].length), i % 4, limit);
  }
  var hs = heights(g);
  var flat = hs.filter(function (v) { return v <= 1; }).length;
  console.log('MAX_SLIDE=' + String(limit).padStart(2) +
    ' | 高度 ' + hs.join('') +
    ' | 贴底(<=1格)的列 ' + flat + '/' + C.COLS);
});
