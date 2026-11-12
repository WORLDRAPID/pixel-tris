/**
 * game.js — 沙粒版渲染 / 输入 / 循环
 *
 * 渲染路线：把 60x120 的颗粒网格写进 ImageData，再最近邻放大到画布
 *          （比逐个 fillRect 快得多，而且天然是硬边像素）
 */
(function () {
  'use strict';

  var C = window.TrisCore;
  var COLS = C.COLS, ROWS = C.ROWS, SUB = C.SUB, W = C.W, H = C.H;

  // ---------------- DOM ----------------
  var boardCanvas = document.getElementById('board');
  var ctx = boardCanvas.getContext('2d');
  var nextCanvas = document.getElementById('next');
  var nctx = nextCanvas.getContext('2d');
  var elScore = document.getElementById('stat-score');
  var elClears = document.getElementById('stat-clears');
  var elLevel = document.getElementById('stat-level');
  var elTime = document.getElementById('stat-time');
  var elBest = document.getElementById('stat-best');
  var elDebug = document.getElementById('stat-debug');
  var BUILD = 'v7';            // 构建标记：换代码时一起改，用来确认浏览器加载的是哪一版
  var frameCount = 0;
  var overlay = document.getElementById('overlay');
  var ovTitle = document.getElementById('ov-title');
  var ovText = document.getElementById('ov-text');
  var ovBtn = document.getElementById('ov-btn');
  var btnSound = document.getElementById('btn-sound');

  // ---------------- 颜色表 ----------------
  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  var RGB = C.COLORS.map(function (c) {
    return { base: hex2rgb(c.base), dark: hex2rgb(c.dark), light: hex2rgb(c.light) };
  });

  // ---------------- 尺寸 ----------------
  var dpr = 1;
  var cellPx = 32;
  var boardW = 320;
  var boardH = 640;
  var nextCell = 20;

  var buffer = document.createElement('canvas');
  buffer.width = W;
  buffer.height = H;
  var bufferCtx = buffer.getContext('2d');
  var imgData = bufferCtx.createImageData(W, H);
  var pix = imgData.data;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var narrow = window.innerWidth < 640;
    var head = 52;
    var padH = narrow ? 118 : 0;
    var outer = 28;
    var availH = window.innerHeight - head - padH - outer;
    var availW = narrow ? window.innerWidth - outer : window.innerWidth - 176 - outer;

    var cssCell = Math.floor(Math.min(availW / COLS, availH / ROWS));
    cssCell = Math.max(8, Math.min(cssCell, 46));
    cellPx = Math.max(8, Math.floor(cssCell * dpr));

    boardW = COLS * cellPx;
    boardH = ROWS * cellPx;
    boardCanvas.width = boardW;
    boardCanvas.height = boardH;
    boardCanvas.style.width = (boardW / dpr) + 'px';
    boardCanvas.style.height = (boardH / dpr) + 'px';

    nextCell = Math.max(6, Math.floor(cellPx * 0.62));
    nextCanvas.width = 4 * nextCell;
    nextCanvas.height = 4 * nextCell;
    nextCanvas.style.width = (4 * nextCell / dpr) + 'px';
    nextCanvas.style.height = (4 * nextCell / dpr) + 'px';

    render();
  }

  // ---------------- 声音 ----------------
  var audioCtx = null;
  var soundOn = true;

  function beep(freq, dur, type, vol) {
    if (!soundOn) return;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.value = vol == null ? 0.04 : vol;
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* 忽略 */ }
  }

  // ---------------- 状态 ----------------
  var grid = C.createGrid();
  var slides = new Uint8Array(W * H);   // 每颗粒子已经横向溜了几次（限流用）
  var piece = null;
  var nextPiece = null;
  var phase = 'ready';       // ready | playing | paused | over
  var score = 0;
  var clears = 0;
  var level = 1;
  var elapsed = 0;
  var chain = 0;

  var dropTimer = 0;
  var lockTimer = 0;
  var lockDelay = 0.2;
  var spawnDelay = 0;

  var physicsAcc = 0;
  var stableTicks = 0;
  var pendingCheck = false;

  var flying = [];           // 消除时飞散的粒子（纯装饰）

  var best = 0;
  try {
    best = parseInt(window.localStorage.getItem('pixeltris.best') || '0', 10) || 0;
  } catch (e) { best = 0; }
  elBest.textContent = String(best);

  var bag = [];

  function nextFromBag() {
    if (!bag.length) {
      bag = [0, 1, 2, 3, 4, 5, 6];
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
      }
    }
    var idx = bag.pop();
    return {
      shape: C.PIECES[idx].shape.map(function (r) { return r.slice(); }),
      color: C.PIECES[idx].color
    };
  }

  function dropInterval() {
    return Math.max(0.09, 0.72 - (level - 1) * 0.052);
  }

  function updateHud() {
    elScore.textContent = String(score);
    elClears.textContent = String(clears);
    elLevel.textContent = String(level);
    var m = Math.floor(elapsed / 60);
    var s = Math.floor(elapsed % 60);
    elTime.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    if (score > best) elBest.textContent = String(score);
  }

  // ---------------- 方块 ----------------
  function spawnPiece() {
    var p = nextPiece || nextFromBag();
    nextPiece = nextFromBag();
    p.cx = Math.floor((COLS - p.shape[0].length) / 2);
    p.cy = 0;
    piece = p;
    dropTimer = 0;
    lockTimer = 0;

    if (C.collides(grid, piece.shape, piece.cx, piece.cy)) {
      gameOver();
      return false;
    }
    drawNext();
    return true;
  }

  function tryMove(dx, dy) {
    if (!piece) return false;
    if (C.collides(grid, piece.shape, piece.cx + dx, piece.cy + dy)) return false;
    piece.cx += dx;
    piece.cy += dy;
    if (dx !== 0) lockTimer = 0;
    return true;
  }

  function tryRotate() {
    if (!piece) return false;
    var rot = C.rotateCW(piece.shape);
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      if (!C.collides(grid, rot, piece.cx + kicks[i], piece.cy)) {
        piece.shape = rot;
        piece.cx += kicks[i];
        lockTimer = 0;
        beep(640, 0.03, 'square', 0.02);
        return true;
      }
    }
    return false;
  }

  function lockPiece() {
    if (!piece) return;
    C.paintPiece(grid, piece.shape, piece.cx, piece.cy, piece.color, slides);
    piece = null;

    chain = 0;
    pendingCheck = true;
    stableTicks = 0;
    spawnDelay = 0.12;
    beep(180, 0.06, 'square', 0.035);
    updateHud();
  }

  function hardDrop() {
    if (!piece) return;
    var moved = 0;
    while (!C.collides(grid, piece.shape, piece.cx, piece.cy + 1)) {
      piece.cy++;
      moved++;
    }
    score += moved * 2;
    lockPiece();
  }

  // ---------------- 沙粒物理 ----------------
  var STEP = 1 / 67; //更改沙子的流速

  function runPhysics(dt) {
    physicsAcc += dt;
    var guard = 0;
    var movedTotal = 0;

    while (physicsAcc >= STEP && guard < 5) {
      physicsAcc -= STEP;
      var moved = C.stepSand(grid, null, slides);
      movedTotal += moved;
      if (moved === 0) stableTicks++;
      else stableTicks = 0;
      guard++;
    }

    if (movedTotal === 0 && stableTicks > 0) stableTicks = Math.min(stableTicks + 1, 99);

    if (pendingCheck && stableTicks >= 3 && phase === 'playing') {
      var spans = C.findSpans(grid);
      if (spans.length) {
        doClear(spans);
      } else {
        pendingCheck = false;
      }
    }
  }

  function doClear(spans) {
    var particlesCleared = 0;
    for (var i = 0; i < spans.length; i++) {
      particlesCleared += spans[i].cells.length;
      C.clearCells(grid, spans[i].cells);
    }

    chain += 1;
    clears += spans.length;
    score += Math.round(particlesCleared * 2.5 * chain);
    level = 1 + Math.floor(clears / 6);

    if (score > best) {
      best = score;
      try { window.localStorage.setItem('pixeltris.best', String(best)); } catch (e) { /* 忽略 */ }
    }

    // 少量飞散颗粒做冲击感（真正的沙粒在网格里继续塌）
    var budget = Math.min(260, Math.ceil(particlesCleared / 3));
    for (var k = 0; k < budget; k++) {
      var idx = spans[i % spans.length].cells[(Math.random() * spans[i % spans.length].cells.length) | 0];
      var gx = idx % W;
      var gy = (idx - gx) / W;
      var scale = boardW / W;
      flying.push({
        x: gx * scale,
        y: gy * scale,
        vx: (Math.random() - 0.5) * 260,
        vy: -Math.random() * 220 - 40,
        life: 0.35 + Math.random() * 0.4,
        t: 0,
        size: Math.max(2, scale * 1.4),
        color: C.COLORS[spans[i % spans.length].color].base
      });
    }

    pendingCheck = true;
    stableTicks = 0;
    beep(520 + chain * 90, 0.1, 'square', 0.045);
    updateHud();
  }

  function updateFlying(dt) {
    for (var i = flying.length - 1; i >= 0; i--) {
      var p = flying[i];
      p.t += dt;
      if (p.t >= p.life) { flying.splice(i, 1); continue; }
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ---------------- 主循环 ----------------
  function update(dt) {
    updateFlying(dt);
    runPhysics(dt);

    if (phase !== 'playing') return;

    elapsed += dt;

    if (spawnDelay > 0) {
      spawnDelay -= dt;
      if (spawnDelay <= 0) spawnPiece();
      updateHud();
      return;
    }

    if (piece) {
      if (!C.collides(grid, piece.shape, piece.cx, piece.cy + 1)) {
        lockTimer = 0;
        dropTimer += dt;
        if (dropTimer >= dropInterval()) {
          dropTimer = 0;
          piece.cy += 1;
        }
      } else {
        lockTimer += dt;
        if (lockTimer >= lockDelay) lockPiece();
      }
    }
    updateHud();
  }

  // ---------------- 渲染 ----------------
  function renderSand() {
    for (var i = 0; i < W * H; i++) {
      var v = grid[i];
      var o = i << 2;
      if (v === 0) {
        pix[o + 3] = 0;
        continue;
      }
      var pal = RGB[v - 1];
      var hash = ((i * 1103515245 + 12345) >>> 0) % 10;
      var col = hash < 2 ? pal.dark : (hash < 4 ? pal.light : pal.base);
      pix[o] = col[0];
      pix[o + 1] = col[1];
      pix[o + 2] = col[2];
      pix[o + 3] = 255;
    }
    bufferCtx.putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, boardW, boardH);
    ctx.drawImage(buffer, 0, 0, W, H, 0, 0, boardW, boardH);
  }

  function drawBlock(g, gx, gy, colorIdx) {
    var pal = C.COLORS[colorIdx];
    var x = gx * cellPx;
    var y = gy * cellPx;
    var edge = Math.max(1, Math.round(cellPx * 0.14));

    g.fillStyle = pal.base;
    g.fillRect(x, y, cellPx, cellPx);
    g.fillStyle = pal.light;
    g.fillRect(x, y, cellPx, edge);
    g.fillRect(x, y, edge, cellPx);
    g.fillStyle = pal.dark;
    g.fillRect(x, y + cellPx - edge, cellPx, edge);
    g.fillRect(x + cellPx - edge, y, edge, cellPx);
  }

  function render() {
    renderSand();

    // 正在下落的方块：还没碎，画成完整的块
    if (piece) {
      for (var j = 0; j < piece.shape.length; j++) {
        for (var i = 0; i < piece.shape[j].length; i++) {
          if (!piece.shape[j][i]) continue;
          drawBlock(ctx, piece.cx + i, piece.cy + j, piece.color);
        }
      }
    }

    // 飞散颗粒
    for (var k = 0; k < flying.length; k++) {
      var p = flying[k];
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawNext() {
    var w = 4 * nextCell;
    nctx.clearRect(0, 0, w, w);
    if (!nextPiece) return;

    var shape = nextPiece.shape;
    var sw = shape[0].length;
    var sh = shape.length;
    var ox = (4 - sw) / 2 * nextCell;
    var oy = (4 - sh) / 2 * nextCell;
    var pal = C.COLORS[nextPiece.color];
    var edge = Math.max(1, Math.round(nextCell * 0.14));

    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        if (!shape[y][x]) continue;
        var px = ox + x * nextCell;
        var py = oy + y * nextCell;
        nctx.fillStyle = pal.base;
        nctx.fillRect(px, py, nextCell, nextCell);
        nctx.fillStyle = pal.light;
        nctx.fillRect(px, py, nextCell, edge);
        nctx.fillStyle = pal.dark;
        nctx.fillRect(px, py + nextCell - edge, nextCell, edge);
      }
    }
  }

  var lastTime = 0;
  var fatalMode = false;

  function frame(t) {
    if (!lastTime) lastTime = t;
    var dt = (t - lastTime) / 1000;
    lastTime = t;
    if (dt > 0.05) dt = 0.05;

    try {
      update(dt);
      render();
      frameCount++;

      // 每 15 帧刷一次体检信息：版本 / 帧数 / 沙粒数 / 有无方块 / 棋盘尺寸
      if (elDebug && frameCount % 15 === 1) {
        var n = 0;
        for (var di = 0; di < grid.length; di++) if (grid[di]) n++;
        elDebug.textContent = BUILD + ' f' + frameCount +
          ' n' + n + ' p' + (piece ? 1 : 0) +
          ' ' + boardW + 'x' + boardH;
      }
    } catch (err) {
      // 出错时把异常显示在页面上，而不是让画面悄悄冻住
      if (!fatalMode) {
        fatalMode = true;
        showOverlay(
          '出错了',
          '渲染时出现异常，已暂停：<br><b>' + String((err && err.message) || err) + '</b><br><br>' +
          '多半是浏览器用了旧缓存，按 F5 或 Ctrl+F5 强制刷新。',
          '重新加载'
        );
      }
    }
    window.requestAnimationFrame(frame);
  }

  // ---------------- 覆盖层 / 流程 ----------------
  function showOverlay(title, text, btn) {
    ovTitle.textContent = title;
    ovText.innerHTML = text;
    ovBtn.textContent = btn;
    overlay.classList.add('show');
  }

  function hideOverlay() {
    overlay.classList.remove('show');
  }

  function startGame() {
    grid = C.createGrid();
    slides = new Uint8Array(W * H);
    piece = null;
    nextPiece = nextFromBag();
    flying = [];
    score = 0;
    clears = 0;
    level = 1;
    elapsed = 0;
    chain = 0;
    dropTimer = 0;
    lockTimer = 0;
    spawnDelay = 0;
    physicsAcc = 0;
    stableTicks = 0;
    pendingCheck = false;
    phase = 'playing';
    if (!spawnPiece()) return;
    hideOverlay();
    updateHud();
    beep(440, 0.08, 'square', 0.04);
  }

  function gameOver() {
    phase = 'over';
    piece = null;
    var isBest = score >= best && score > 0;
    showOverlay(
      'GAME OVER',
      '得分 <b>' + score + '</b>　消除 <b>' + clears + '</b> 次<br>' +
      (isBest ? '新纪录！' : '最高分 ' + best),
      '再来一局'
    );
    beep(150, 0.3, 'sawtooth', 0.05);
  }

  function togglePause() {
    if (phase === 'playing') {
      phase = 'paused';
      showOverlay('PAUSED', '沙子在等你回来。', '继续游戏');
    } else if (phase === 'paused') {
      phase = 'playing';
      hideOverlay();
    }
  }

  // ---------------- 输入 ----------------
  function doAction(act) {
    if (phase !== 'playing' || !piece) return;
    if (act === 'left') tryMove(-1, 0);
    else if (act === 'right') tryMove(1, 0);
    else if (act === 'down') tryMove(0, 1);   // 软降不加分
    else if (act === 'rotate') tryRotate();
    else if (act === 'drop') hardDrop();
  }

  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowUp' || k === ' ') {
      e.preventDefault();
    }
    if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; }
    if (phase === 'ready' || phase === 'over') {
      if (k === 'Enter' || k === ' ') startGame();
      return;
    }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') doAction('left');
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') doAction('right');
    else if (k === 'ArrowDown' || k === 's' || k === 'S') doAction('down');
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') doAction('rotate');
    else if (k === 'z' || k === 'Z') doAction('rotate');
    else if (k === ' ') doAction('drop');
  }, { passive: false });

  var holdTimer = null;
  var holdInterval = null;

  function bindHold(btn, act) {
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      doAction(act);
      if (act === 'rotate' || act === 'drop') return;
      holdTimer = window.setTimeout(function () {
        holdInterval = window.setInterval(function () { doAction(act); }, 90);
      }, 220);
    });
    function stop() {
      if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
      if (holdInterval) { window.clearInterval(holdInterval); holdInterval = null; }
    }
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  }

  var padBtns = document.querySelectorAll('.pad button[data-act]');
  for (var i = 0; i < padBtns.length; i++) {
    bindHold(padBtns[i], padBtns[i].getAttribute('data-act'));
  }

  ovBtn.addEventListener('click', function () {
    if (fatalMode) {
      window.location.reload();
      return;
    }
    if (phase === 'paused') {
      phase = 'playing';
      hideOverlay();
    } else {
      startGame();
    }
  });

  btnSound.addEventListener('click', function () {
    soundOn = !soundOn;
    btnSound.textContent = soundOn ? '♪' : '✕';
    btnSound.classList.toggle('off', !soundOn);
    if (soundOn) beep(600, 0.06, 'square', 0.04);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && phase === 'playing') togglePause();
  });

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () {
    window.setTimeout(layout, 120);
  });

  // ---------------- 启动 ----------------
  layout();
  nextPiece = nextFromBag();
  drawNext();
  updateHud();
  showOverlay(
    'PIXEL TRIS',
    '方块落地会炸成沙粒，<br>顺着坡度往两边溜。<br><br>同色沙粒连通、并且<br>同时贴住左右两侧，就能消除。',
    '开始游戏'
  );
  window.requestAnimationFrame(frame);
})();
