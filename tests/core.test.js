/**
 * 沙粒逻辑测试：node tests/core.test.js
 */
require('../core.js');

var C = globalThis.TrisCore;
var W = C.W, H = C.H, SUB = C.SUB;
var pass = 0, fail = 0;

function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

function at(g, x, y) { return g[y * W + x]; }
function set(g, x, y, v) { g[y * W + x] = v; }

console.log('\n[旋转]');
var i = C.rotateCW([[1, 1, 1, 1]]);
ok('I 横转竖变 4x1', i.length === 4 && i[0].length === 1);

console.log('\n[碰撞]');
var g0 = C.createGrid();
ok('空网格不碰撞', C.collides(g0, [[1, 1], [1, 1]], 4, 18) === false);
ok('触底碰撞', C.collides(g0, [[1, 1], [1, 1]], 4, 19) === true);
ok('出左边界', C.collides(g0, [[1, 1], [1, 1]], -1, 10) === true);
ok('出右边界', C.collides(g0, [[1, 1], [1, 1]], 9, 10) === true);

console.log('\n[方块落地炸成颗粒]');
var g1 = C.createGrid();
var painted = C.paintPiece(g1, [[1, 1], [1, 1]], 4, 18, 2);
ok('O 块写入 4 格 = 4*SUB*SUB 颗粒', painted === 4 * SUB * SUB);
ok('颗粒颜色值正确', at(g1, 4 * SUB, 18 * SUB) === 3);
ok('空白处仍为空', at(g1, 0, 0) === 0);
ok('颗粒总数一致', C.countParticles(g1) === painted);

console.log('\n[沙粒下落]');
var g2 = C.createGrid();
set(g2, 5, 10, 1);
C.stepSand(g2);
ok('单个颗粒下落一行', at(g2, 5, 11) === 1 && at(g2, 5, 10) === 0);

var g3 = C.createGrid();
set(g3, 5, H - 2, 1);
C.stepSand(g3);
ok('落到底部不再动', at(g3, 5, H - 1) === 1);

var g4 = C.createGrid();
for (var x = 0; x < W; x++) set(g4, x, H - 1, 1);
ok('稳定后返回 0', C.stepSand(g4) === 0);

console.log('\n[像沙子一样往低处溜]');
var g5 = C.createGrid();
for (var x2 = 0; x2 < W; x2++) set(g5, x2, H - 1, 1);
set(g5, 30, H - 2, 2);   // 下面那个颗粒挡住
set(g5, 30, H - 3, 3);   // 上面这个应该往旁边溜
C.stepSand(g5);
ok('被挡住后向斜下方滑走',
  at(g5, 30, H - 2) === 2 && at(g5, 30, H - 3) === 0 &&
  (at(g5, 29, H - 2) === 3 || at(g5, 31, H - 2) === 3));

console.log('\n[消除判定]');
var g6 = C.createGrid();
for (var y6 = H - 3; y6 < H; y6++) {
  for (var x6 = 0; x6 < W; x6++) set(g6, x6, y6, 5);
}
var sp6 = C.findSpans(g6);
ok('同色满宽 → 消除', sp6.length === 1 && sp6[0].cells.length === 3 * W);

var g7 = C.createGrid();
for (var y7 = H - 3; y7 < H; y7++) {
  for (var x7 = 0; x7 < 30; x7++) set(g7, x7, y7, 5);
}
ok('只贴左边 → 不消除', C.findSpans(g7).length === 0);

var g8 = C.createGrid();
for (var y8 = H - 2; y8 < H; y8++) {
  for (var x8 = 0; x8 < W; x8++) set(g8, x8, y8, 5);
}
for (var y8b = H - 2; y8b < H; y8b++) set(g8, 30, y8b, 9);  // 中间竖着切断
ok('中间被异色切断 → 不消除', C.findSpans(g8).length === 0);

console.log('\n[彻底清除]');
var g9 = C.createGrid();
for (var x9 = 0; x9 < W; x9++) set(g9, x9, H - 1, 4);
var sp9 = C.findSpans(g9);
C.clearCells(g9, sp9[0].cells);
ok('消除后该区域清零', C.countParticles(g9) === 0);

console.log('\n[颜色表完整性]');
ok('每种方块都能取到调色板（改颜色数量后的回归测试）',
  C.PIECES.every(function (p) { return C.COLORS[p.color] && C.COLORS[p.color].base; }));
ok('调色板三档齐全',
  C.COLORS.every(function (c) { return c.base && c.dark && c.light; }));
ok('方块颜色索引在范围内',
  C.PIECES.every(function (p) { return p.color >= 0 && p.color < C.COLORS.length; }));

var gAll = C.createGrid();
var allPainted = C.PIECES.every(function (p, i) {
  var n = C.paintPiece(gAll, p.shape, i, 16, p.color);
  return n > 0;
});
ok('七种方块都能写进颗粒网格', allPainted);

console.log('\n[流动距离限制 MAX_SLIDE]');
var gA = C.createGrid();
var sA = new Uint8Array(W * H);
for (var xa = 0; xa < W; xa++) set(gA, xa, H - 1, 1);
set(gA, 30, H - 2, 2);
set(gA, 30, H - 3, 3);
C.stepSand(gA, null, sA, 2);
ok('预算未用完时会滑走',
  at(gA, 30, H - 3) === 0 &&
  (at(gA, 29, H - 2) === 3 || at(gA, 31, H - 2) === 3));

var gB = C.createGrid();
var sB = new Uint8Array(W * H);
for (var xb = 0; xb < W; xb++) set(gB, xb, H - 1, 1);
set(gB, 30, H - 2, 2);
set(gB, 30, H - 3, 3);
sB[(H - 3) * W + 30] = 2;              // 已经滑满 2 次
C.stepSand(gB, null, sB, 2);
ok('预算用完后原地不动', at(gB, 30, H - 3) === 3);

var gC = C.createGrid();
var sC = new Uint8Array(W * H);
C.paintPiece(gC, [[1, 1], [1, 1]], 4, 18, 1, sC);
var allZero = true;
for (var ci = 0; ci < W * H; ci++) if (sC[ci] !== 0) { allZero = false; break; }
ok('新落下的沙子滑行计数从 0 开始', allZero);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败\n');
process.exit(fail === 0 ? 0 : 1);
