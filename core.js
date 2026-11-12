/**
 * core.js — 纯逻辑层（沙粒模拟），不碰 DOM，可在浏览器和 Node 里共用
 *
 * 坐标体系：
 *   方块用「格」为单位（COLS x ROWS）
 *   沙粒用「颗粒」为单位（W x H = COLS*SUB x ROWS*SUB）
 *   一格 = SUB x SUB 颗粒
 */
(function (global) {
  'use strict';

  var COLS = 10;
  var ROWS = 20;
  var SUB = 8;                 // 每格切成 SUB x SUB 颗粒（改这里可以调沙子的粗细）
  var W = COLS * SUB;          // 颗粒网格宽 = 10 * 8 = 80
  var H = ROWS * SUB;          // 颗粒网格高 = 20 * 8 = 160

  // 四种颜色，每色三档：主色 / 暗部 / 高光
  // 注意：加减颜色只改这个数组即可，方块颜色会自动按数量循环
  var COLORS = [
    { base: '#f2c53d', dark: '#8a6710', light: '#ffeaa6' }, // 0 黄
    { base: '#4cd35c', dark: '#1f6f2a', light: '#b7f7bd' }, // 1 绿
    { base: '#e8453c', dark: '#8b1f19', light: '#ffada5' }, // 2 红
    { base: '#3b6df0', dark: '#1d3a86', light: '#b4c6ff' }  // 3 蓝
  ];

  // 七种方块共用上面的颜色，颜色数少于方块数时自动循环取色
  var PIECES = [
    { shape: [[1, 1, 1, 1]] },
    { shape: [[1, 1], [1, 1]] },
    { shape: [[0, 1, 0], [1, 1, 1]] },
    { shape: [[0, 1, 1], [1, 1, 0]] },
    { shape: [[1, 1, 0], [0, 1, 1]] },
    { shape: [[1, 0, 0], [1, 1, 1]] },
    { shape: [[0, 0, 1], [1, 1, 1]] }
  ].map(function (p, i) {
    p.color = i % COLORS.length;
    return p;
  });

  function createGrid() {
    return new Uint8Array(W * H);   // 0 = 空，n = 颜色序号 + 1
  }

  function rotateCW(shape) {
    var rows = shape.length;
    var cols = shape[0].length;
    var out = [];
    for (var x = 0; x < cols; x++) {
      var row = [];
      for (var y = rows - 1; y >= 0; y--) row.push(shape[y][x]);
      out.push(row);
    }
    return out;
  }

  /** 方块（格坐标）与已有沙粒是否重叠 / 越界 */
  function collides(grid, shape, cx, cy) {
    for (var j = 0; j < shape.length; j++) {
      for (var i = 0; i < shape[j].length; i++) {
        if (!shape[j][i]) continue;
        var baseX = (cx + i) * SUB;
        var baseY = (cy + j) * SUB;
        if (baseX < 0 || baseX + SUB > W) return true;
        if (baseY + SUB > H) return true;
        for (var dy = 0; dy < SUB; dy++) {
          var py = baseY + dy;
          if (py < 0) continue;
          var rowBase = py * W;
          for (var dx = 0; dx < SUB; dx++) {
            if (grid[rowBase + baseX + dx]) return true;
          }
        }
      }
    }
    return false;
  }

  /** 把方块「炸」进沙粒网格，返回写入的颗粒数 */
  function paintPiece(grid, shape, cx, cy, colorIdx, slides) {
    var value = colorIdx + 1;
    var count = 0;
    for (var j = 0; j < shape.length; j++) {
      for (var i = 0; i < shape[j].length; i++) {
        if (!shape[j][i]) continue;
        var baseX = (cx + i) * SUB;
        var baseY = (cy + j) * SUB;
        for (var dy = 0; dy < SUB; dy++) {
          var py = baseY + dy;
          if (py < 0 || py >= H) continue;
          var rowBase = py * W;
          for (var dx = 0; dx < SUB; dx++) {
            var px = baseX + dx;
            if (px < 0 || px >= W) continue;
            grid[rowBase + px] = value;
            if (slides) slides[rowBase + px] = 0;   // 新落下的沙子滑行计数从 0 开始
            count++;
          }
        }
      }
    }
    return count;
  }

  // 沙子能横向流动的距离：每颗粒子最多往左右溜几次就停（单位是「颗粒」，1 格 = SUB 颗 = 8）
  //   8  → 明显更黏，堆得较陡、边缘站得住
  //   16 → 默认，和原始（不限流）几乎看不出差别，只压掉那些拉很长的细尾巴
  //   24 以上 / 99 → 等同于原来的干沙，会一路摊到边上
  var MAX_SLIDE = 16;

  /**
   * 一步沙粒模拟：自下而上扫，能落就落，落不了就斜着往下溜（受 MAX_SLIDE 限制）
   * @param {Uint8Array} grid   颗粒网格
   * @param {Function}   rng    随机源（测试可注入）
   * @param {Uint8Array} slides 滑动计数（与 grid 同尺寸；不传则不限流）
   * @returns {number} 本步移动的颗粒数（0 表示已经稳定）
   */
  function stepSand(grid, rng, slides, maxSlide) {
    var random = rng || Math.random;
    var limit = maxSlide == null ? MAX_SLIDE : maxSlide;
    var moved = 0;

    for (var y = H - 2; y >= 0; y--) {
      var rowBase = y * W;
      var belowBase = rowBase + W;
      var leftFirst = random() < 0.5;

      for (var k = 0; k < W; k++) {
        var x = leftFirst ? k : W - 1 - k;
        var p = rowBase + x;
        var v = grid[p];
        if (v === 0) continue;

        var below = belowBase + x;
        if (grid[below] === 0) {
          grid[below] = v;
          grid[p] = 0;
          if (slides) {
            slides[below] = slides[p];
            slides[p] = 0;
          }
          moved++;
          continue;
        }

        // 下面被挡住了，才考虑往斜下方溜；溜够次数就停住
        if (slides && slides[p] >= limit) continue;

        var leftD = x > 0 ? belowBase + x - 1 : -1;
        var rightD = x < W - 1 ? belowBase + x + 1 : -1;
        var first = leftFirst ? leftD : rightD;
        var second = leftFirst ? rightD : leftD;

        if (first >= 0 && grid[first] === 0) {
          grid[first] = v;
          grid[p] = 0;
          if (slides) {
            slides[first] = slides[p] + 1;
            slides[p] = 0;
          }
          moved++;
          continue;
        }
        if (second >= 0 && grid[second] === 0) {
          grid[second] = v;
          grid[p] = 0;
          if (slides) {
            slides[second] = slides[p] + 1;
            slides[p] = 0;
          }
          moved++;
        }
      }
    }
    return moved;
  }

  /**
   * 找出「同色连通块同时贴住左右两边」的区域
   * 返回 [{ color, cells: [扁平下标...] }]
   */
  function findSpans(grid) {
    var seen = new Uint8Array(W * H);
    var spans = [];
    var stack = new Int32Array(W * H);

    for (var start = 0; start < W * H; start++) {
      var value = grid[start];
      if (value === 0 || seen[start]) continue;

      var top = 0;
      stack[top++] = start;
      seen[start] = 1;
      var cells = [];
      var minX = W;
      var maxX = -1;

      while (top > 0) {
        var p = stack[--top];
        cells.push(p);
        var px = p % W;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;

        var x = px;
        var y = (p - px) / W;

        if (x + 1 < W) {
          var r = p + 1;
          if (!seen[r] && grid[r] === value) { seen[r] = 1; stack[top++] = r; }
        }
        if (x > 0) {
          var l = p - 1;
          if (!seen[l] && grid[l] === value) { seen[l] = 1; stack[top++] = l; }
        }
        if (y + 1 < H) {
          var d = p + W;
          if (!seen[d] && grid[d] === value) { seen[d] = 1; stack[top++] = d; }
        }
        if (y > 0) {
          var u = p - W;
          if (!seen[u] && grid[u] === value) { seen[u] = 1; stack[top++] = u; }
        }
      }

      if (minX === 0 && maxX === W - 1) {
        spans.push({ color: value - 1, cells: cells });
      }
    }
    return spans;
  }

  function clearCells(grid, cells) {
    for (var i = 0; i < cells.length; i++) grid[cells[i]] = 0;
  }

  function countParticles(grid) {
    var n = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i]) n++;
    return n;
  }

  global.TrisCore = {
    COLS: COLS,
    ROWS: ROWS,
    SUB: SUB,
    W: W,
    H: H,
    MAX_SLIDE: MAX_SLIDE,
    COLORS: COLORS,    PIECES: PIECES,
    createGrid: createGrid,
    rotateCW: rotateCW,
    collides: collides,
    paintPiece: paintPiece,
    stepSand: stepSand,
    findSpans: findSpans,
    clearCells: clearCells,
    countParticles: countParticles
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
