/**
 * 浏览器冒烟测试：用最小 DOM 桩把 game.js 跑起来，抓真实异常
 * node tests/smoke.js
 */
var path = require('path');

var errors = [];
var drawCalls = 0;
var fillCalls = [];

function makeCtx() {
  return {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect: function (x, y, w, h) { drawCalls++; if (fillCalls.length < 4000) fillCalls.push([this.fillStyle, x, y, w, h]); },
    clearRect: function () {},
    drawImage: function () { drawCalls++; },
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData: function () {},
    save: function () {},
    restore: function () {},
    beginPath: function () {}
  };
}

function makeEl(id) {
  var handlers = {};
  var classes = {};
  return {
    id: id,
    width: 0,
    height: 0,
    style: {},
    textContent: '',
    innerHTML: '',
    classList: {
      add: function (c) { classes[c] = 1; },
      remove: function (c) { delete classes[c]; },
      toggle: function (c) { if (classes[c]) delete classes[c]; else classes[c] = 1; },
      contains: function (c) { return !!classes[c]; }
    },
    hasClass: function (c) { return !!classes[c]; },
    addEventListener: function (t, f) { handlers[t] = f; },
    dispatch: function (t, ev) { if (handlers[t]) handlers[t](ev || {}); },
    getContext: function () { return this._ctx || (this._ctx = makeCtx()); },
    getBoundingClientRect: function () { return { width: 320, height: 640, left: 0, top: 0 }; }
  };
}

var els = {};
['board', 'next', 'stat-score', 'stat-clears', 'stat-level', 'stat-time', 'stat-best', 'stat-debug',
 'overlay', 'ov-title', 'ov-text', 'ov-btn', 'btn-sound',
 'confirm', 'cf-title', 'cf-text', 'cf-yes', 'cf-no', 'countdown',
 'restart-block', 'btn-restart'].forEach(function (id) {
  els[id] = makeEl(id);
});

var rafCallback = null;

global.window = {
  innerWidth: 900,
  innerHeight: 800,
  devicePixelRatio: 1,
  requestAnimationFrame: function (fn) { rafCallback = fn; return 1; },
  addEventListener: function () {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  localStorage: {
    _d: {},
    getItem: function (k) { return this._d[k] == null ? null : this._d[k]; },
    setItem: function (k, v) { this._d[k] = v; }
  }
};
var docHandlers = {};
global.document = {
  getElementById: function (id) { return els[id] || null; },
  querySelectorAll: function () { return []; },
  addEventListener: function (t, f) { docHandlers[t] = f; },
  createElement: function () { return makeEl('tmp'); },
  hidden: false
};

process.on('uncaughtException', function (e) {
  errors.push(e);
  console.log('!!! 未捕获异常: ' + e.message);
  console.log(e.stack.split('\n').slice(0, 4).join('\n'));
});

require('../core.js');
// 浏览器里 globalThis === window，这里手动对齐
global.window.TrisCore = globalThis.TrisCore;
try {
  require('../game.js');
  console.log('game.js 加载成功');
} catch (e) {
  console.log('!!! 加载时抛异常: ' + e.message);
  console.log(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}

// 模拟点击「开始游戏」
console.log('\n--- 点击开始 ---');
try {
  els['ov-btn'].dispatch('click');
  console.log('点击处理完成，当前 HUD 分数 = ' + els['stat-score'].textContent);
} catch (e) {
  console.log('!!! 点击时抛异常: ' + e.message);
}

// 跑 30 帧
console.log('\n--- 跑 30 帧 ---');
drawCalls = 0;
fillCalls.length = 0;
var t = 0;
for (var i = 0; i < 30; i++) {
  if (!rafCallback) { console.log('!!! 没有下一帧回调，循环已停止'); break; }
  var cb = rafCallback;
  rafCallback = null;
  t += 16;
  try {
    cb(t);
  } catch (e) {
    console.log('!!! 第 ' + i + ' 帧抛异常: ' + e.message);
    console.log(e.stack.split('\n').slice(0, 4).join('\n'));
    break;
  }
}
console.log('绘制调用次数 = ' + drawCalls);
console.log('fillRect 次数 = ' + fillCalls.length);
if (fillCalls.length) {
  var colors = {};
  fillCalls.forEach(function (c) { colors[c[0]] = (colors[c[0]] || 0) + 1; });
  console.log('用到的颜色: ' + JSON.stringify(colors));
}

console.log('\n--- 连按 10 次 ↓，分数不应该变 ---');
var before = els['stat-score'].textContent;
if (!docHandlers.keydown) {
  console.log('!!! 没抓到键盘监听');
} else {
  for (var k = 0; k < 10; k++) {
    try {
      docHandlers.keydown({ key: 'ArrowDown', preventDefault: function () {} });
    } catch (e) {
      console.log('!!! 按键处理抛异常: ' + e.message);
      break;
    }
  }
  var after = els['stat-score'].textContent;
  console.log('按键前分数 = ' + before + '，按键后分数 = ' + after +
    (before === after ? '  ✓ 软降不加分' : '  ✗ 软降仍然加分'));
  if (before !== after) errors.push(new Error('软降加分'));
}

console.log('\n--- 重新开始流程 ---');
try {
  els['btn-restart'].dispatch('click');
  var shown = els['confirm'].hasClass('show');
  console.log('点重新开始 → 弹窗显示: ' + (shown ? '✓' : '✗'));
  if (!shown) errors.push(new Error('确认弹窗没弹出'));

  els['cf-no'].dispatch('click');
  var closed = !els['confirm'].hasClass('show');
  var cd = els['countdown'].hasClass('show');
  console.log('点「否」→ 弹窗关闭: ' + (closed ? '✓' : '✗') +
    '，倒计时出现: ' + (cd ? '✓ (' + els['countdown'].textContent + ')' : '✗'));
  if (!closed) errors.push(new Error('确认弹窗没关闭'));
  if (!cd) errors.push(new Error('倒计时没出现'));
} catch (e) {
  console.log('!!! 重新开始流程抛异常: ' + e.message);
  errors.push(e);
}

console.log('\n异常总数 = ' + errors.length);
process.exit(errors.length ? 1 : 0);
