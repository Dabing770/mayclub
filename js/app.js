(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var CHARS = {
    kitty: { name: '凯蒂猫', hue: 352, h: 112, img: 'assets/characters/kitty.webp' },
    kuromi: { name: '酷洛米', hue: 268, h: 120, img: 'assets/characters/kuromi.webp' },
    melody: { name: '美乐蒂', hue: 328, h: 128, img: 'assets/characters/melody.webp' },
    cinnamoroll: { name: '大耳狗', hue: 200, h: 92, img: 'assets/characters/cinnamoroll.webp' },
    badtz: { name: '酷企鹅', hue: 46, h: 118, img: 'assets/characters/badtz.webp' },
    purin: { name: '布丁狗', hue: 34, h: 106, img: 'assets/characters/purin.webp' },
    kaikai: { name: '开开', hue: 262, h: 112, img: 'assets/characters/kaikai.webp' },
    xiaowei: { name: '小尾', hue: 344, h: 110, img: 'assets/characters/xiaowei.webp' },
    lulu: { name: '噜噜', hue: 38, h: 116, img: 'assets/characters/lulu.webp' },
    mianqiu: { name: '棉球猫', hue: 16, h: 92, img: 'assets/characters/mianqiu.webp' },
    chii: { name: '吉伊卡哇', hue: 196, h: 86, img: 'assets/characters/chii.webp' },
    yuexin: { name: '月薪喵', hue: 52, h: 104, img: 'assets/characters/yuexin.webp' }
  };

  /* 店名、盖章固定，不进存档 */
  var CLUB_CN = 'May Club', LOGO_MARK = 'MC', STAMP_TEXT = 'May';
  var TICKET_TITLE = '玖璃专属结单小票';
  var SLOGAN = '按单结清 · 谢绝挂账';

  function pad2(n) { return String(n).padStart(2, '0'); }
  function toLocalInput(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function num(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  /* ---------- 按需加载第三方库：导出时才下载，不拖慢首屏 ---------- */
  var scriptLoads = {};
  function loadScript(src) {
    if (!scriptLoads[src]) {
      scriptLoads[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = resolve;
        s.onerror = function () { delete scriptLoads[src]; reject(new Error('无法加载 ' + src)); };
        document.head.appendChild(s);
      });
    }
    return scriptLoads[src];
  }
  function needHtml2canvas() { return window.html2canvas ? Promise.resolve() : loadScript('js/vendor/html2canvas.min.js'); }
  function needGifEnc() { return window.GIFEnc ? Promise.resolve() : loadScript('js/vendor/gifenc.js'); }
  function needGifReader() { return typeof window.GifReader === 'function' ? Promise.resolve() : loadScript('js/vendor/omggif.js'); }

  /* ---------- 图片存储：原图 Blob 放 IndexedDB，localStorage 只存文字设置 ----------
     以前把 base64 图片塞进 localStorage，存满（Safari 约 5MB）后所有改动都会静默丢失。 */
  var MEDIA_KEYS = ['themeImg', 'logoImg', 'bgImg'];
  var media = { themeImg: null, logoImg: null, bgImg: null };   /* 运行时：{ blob, url, mime } */
  var mediaDb = (function () {
    var opening = null;
    function open() {
      if (!opening) {
        opening = new Promise(function (resolve, reject) {
          if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
          var req = indexedDB.open('mayclub', 1);
          req.onupgradeneeded = function () { req.result.createObjectStore('media'); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        });
      }
      return opening;
    }
    function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('media', mode);
          var req = fn(tx.objectStore('media'));
          tx.oncomplete = function () { resolve(req ? req.result : undefined); };
          tx.onerror = tx.onabort = function () { reject(tx.error); };
        });
      });
    }
    return {
      get: function (k) { return run('readonly', function (s) { return s.get(k); }); },
      put: function (k, v) { return run('readwrite', function (s) { return s.put(v, k); }); },
      del: function (k) { return run('readwrite', function (s) { return s.delete(k); }); }
    };
  })();
  var mediaWarned = false;
  /* 旧版 base64 图片转存 IndexedDB 失败时，暂时继续留在 localStorage 存档里 */
  var keepInLocal = {};
  /* 设置 / 清除一张图：state[key] 在运行时是 blob: 地址，不会写进 localStorage */
  function setMedia(key, blob, opts) {
    delete keepInLocal[key];
    var old = media[key];
    if (old && old.url) URL.revokeObjectURL(old.url);
    if (!blob) {
      media[key] = null; state[key] = '';
      mediaDb.del(key).catch(function () {});
      return;
    }
    var url = URL.createObjectURL(blob);
    media[key] = { blob: blob, url: url, mime: (blob.type || '').toLowerCase() };
    state[key] = url;
    if (!(opts && opts.restored)) {
      mediaDb.put(key, blob).catch(function () {
        if (!mediaWarned) { mediaWarned = true; toast('这台浏览器不允许保存图片，图片只在本次打开有效'); }
      });
    }
  }
  function dataUrlToBlob(dataUrl) {
    var m = /^data:([^;,]+)/.exec(String(dataUrl));
    return new Blob([dataUrlToBytes(dataUrl)], { type: m ? m[1] : 'application/octet-stream' });
  }
  function blobToBytes(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /* 自动抠图：把近白/近灰背景透明化，保留主体，边缘做羽化；done(pngBlob, w, h) */
  function cutoutToTransparent(img, done) {
    function finish() { cv.toBlob(function (blob) { done(blob, w, h); }, 'image/png'); }
    var maxSide = 420;
    var w = img.width, h = img.height;
    var k = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    var data;
    try { data = ctx.getImageData(0, 0, w, h); } catch (e) { finish(); return; }
    var px = data.data, n = px.length;
    var corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
    var br=[],bg=[],bb=[];
    corners.forEach(function(c){var i=(c[1]*w+c[0])*4;br.push(px[i]);bg.push(px[i+1]);bb.push(px[i+2]);});
    br.sort((a,b)=>a-b);bg.sort((a,b)=>a-b);bb.sort((a,b)=>a-b);
    var R=br[1],G=bg[1],B=bb[1];
    var thHi=235, thLo=205;
    for (var i=0;i<n;i+=4) {
      var r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];
      if (a===0) continue;
      var dr=r-R, dg=g-G, db=b-B;
      var dist=Math.sqrt(dr*dr+dg*dg+db*db);
      var lum=(r+g+b)/3;
      var bgScore = (dist < 34) && (lum > thLo);
      if (bgScore) {
        var t = lum > thHi || dist < 18 ? 1 : (lum-thLo)/(thHi-thLo);
        px[i+3] = Math.round(a*(1-Math.max(0,Math.min(1,t))));
      }
    }
    ctx.putImageData(data,0,0);
    finish();
  }
  function fmt(n) {
    if (!isFinite(n)) return '0';
    return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2);
  }
  function money(n, spaced) {
    var cur = state.cur || '';
    return cur ? (spaced ? cur + ' ' : cur) + fmt(n) : fmt(n);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatTicket(v) {
    var d = v ? new Date(v) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return {
      day: d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()),
      min: pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    };
  }

  /* ---------- 下单时间：没手动改过就跟着「打印」走，避免印出几天前的时间 ---------- */
  var whenManual = false, autoTimeAt = 0;
  function refreshAutoTime(force) {
    if (whenManual) return false;
    /* 导出时如果 10 分钟内刚自动取过时间（比如刚打印），就不再改，保证打印和存图一致 */
    if (!force && Date.now() - autoTimeAt < 10 * 60 * 1000) return false;
    state.when = toLocalInput(new Date());
    autoTimeAt = Date.now();
    var el = $('#when'); if (el) el.value = state.when;
    return true;
  }
  function syncWhenHint() {
    var h = $('#whenHint');
    if (h) h.textContent = whenManual ? '已手动设定 · 清空后恢复自动' : '打印时取当前';
  }

  /* ---------- 小票编号：MC + 年月日 + 当天流水号（按设备计数） ---------- */
  var SEQ_KEY = 'mayclub-seq';
  function nextTicketNo() {
    var d = new Date();
    var day = String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
    var seq = {};
    try { seq = JSON.parse(localStorage.getItem(SEQ_KEY) || '{}') || {}; } catch (e) {}
    var n = seq.day === day ? (Number(seq.n) || 0) + 1 : 1;
    try { localStorage.setItem(SEQ_KEY, JSON.stringify({ day: day, n: n })); } catch (e) {}
    return 'MC' + day + '-' + String(n).padStart(3, '0');
  }
  function assignNewNo() {
    state.no = nextTicketNo();
    var el = $('#no'); if (el) el.value = state.no;
    return state.no;
  }

  /* ---------- 金额 ---------- */
  function autoTotal() {
    return state.items.reduce(function (s, it) { return s + num(it.amt); }, 0);
  }
  function effTotal() {
    return state.total.trim() === '' ? autoTotal() : num(state.total);
  }
  function discountRate() {
    var r = parseFloat(state.discount);
    return isFinite(r) && r > 0 && r <= 1 ? r : 1;
  }
  var DISCOUNT_LABELS = {
    '1': '不打折', '0.99': '99 折', '0.98': '98 折', '0.96': '96 折',
    '0.95': '95 折', '0.92': '92 折', '0.90': '9 折', '0.85': '85 折', '0.80': '8 折'
  };
  function discountLabel() {
    return DISCOUNT_LABELS[String(state.discount)] || (discountRate() >= 1 ? '不打折' : '');
  }
  function afterDiscount() {
    return effTotal() * discountRate();
  }
  function effPaid() {
    return state.paid.trim() === '' ? afterDiscount() : num(state.paid);
  }
  function blessText() {
    if (state.tail.trim()) return state.tail.trim();
    var n = state.name.trim() || '你';
    return '祝' + n + '在' + CLUB_CN + '玩得开心';
  }

  /* ---------- 条码 ---------- */
  function barcodeSVG(seed) {
    var s = String(seed || '0'), h = 2166136261 >>> 0, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    function rnd() { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }
    var parts = '<rect x="0" y="0" width="4" height="46"/><rect x="7" y="0" width="4" height="46"/>';
    var x = 14;
    while (x < 284) {
      var w = 1 + Math.floor(rnd() * 3);
      if (x + w > 286) break;
      parts += '<rect x="' + x + '" y="0" width="' + w + '" height="46"/>';
      x += w + 1 + Math.floor(rnd() * 2);
    }
    parts += '<rect x="290" y="0" width="4" height="46"/><rect x="296" y="0" width="4" height="46"/>';
    return '<svg viewBox="0 0 300 46" preserveAspectRatio="none" fill="currentColor" aria-hidden="true">' + parts + '</svg>';
  }

  var tileCache = {};
  /* 票面波点：html2canvas 1.4.1 不渲染 radial-gradient 圆点，改用 canvas 画点阵平铺，导出图片才带波点。
     返回的是小画布本身，createPattern 可以同步使用，不用等图片加载。 */
  var dotTileCache = {};
  var DOT_SHAPES = ['circle', 'heart', 'diamond', 'bow', 'star'];
  /* 大小系数：dotScale 控制点阵单元与图形整体尺寸 */
  function dotTile(hue, shape, scale) {
    hue = Number(hue) || 0;
    shape = DOT_SHAPES.indexOf(shape) >= 0 ? shape : 'circle';
    scale = Math.min(1.6, Math.max(0.7, Number(scale) || 1));
    var key = hue + '|' + shape + '|' + scale.toFixed(2);
    if (dotTileCache[key]) return dotTileCache[key];
    /* 单元边长随大小缩放，图形以单元中心为基准等比缩放 */
    var S = Math.round(18 * scale);
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var x = c.getContext('2d');
    x.clearRect(0, 0, S, S);
    x.fillStyle = 'hsla(' + hue + ',24%,91%,.45)';
    var cx = S / 2, cy = S / 2, k = scale;
    if (shape === 'circle') {
      x.beginPath();
      x.arc(cx, cy, 2 * k, 0, Math.PI * 2);
      x.fill();
    } else if (shape === 'heart') {
      x.beginPath();
      x.moveTo(cx, cy + 3.4 * k);
      x.bezierCurveTo(cx - 4.6 * k, cy - 0.4 * k, cx - 2.6 * k, cy - 3.4 * k, cx, cy - 1.2 * k);
      x.bezierCurveTo(cx + 2.6 * k, cy - 3.4 * k, cx + 4.6 * k, cy - 0.4 * k, cx, cy + 3.4 * k);
      x.fill();
    } else if (shape === 'diamond') {
      x.beginPath();
      x.moveTo(cx, cy - 3.2 * k);
      x.lineTo(cx + 3.2 * k, cy);
      x.lineTo(cx, cy + 3.2 * k);
      x.lineTo(cx - 3.2 * k, cy);
      x.closePath();
      x.fill();
    } else if (shape === 'bow') {
      x.beginPath();
      x.moveTo(cx - 0.6 * k, cy);
      x.lineTo(cx - 4.4 * k, cy - 2.6 * k);
      x.lineTo(cx - 4.4 * k, cy + 2.6 * k);
      x.closePath();
      x.fill();
      x.beginPath();
      x.moveTo(cx + 0.6 * k, cy);
      x.lineTo(cx + 4.4 * k, cy - 2.6 * k);
      x.lineTo(cx + 4.4 * k, cy + 2.6 * k);
      x.closePath();
      x.fill();
      x.beginPath();
      x.arc(cx, cy, 1.5 * k, 0, Math.PI * 2);
      x.fill();
    } else if (shape === 'star') {
      /* 五角星：外半径 3.6k，内半径 1.6k */
      var R = 3.6 * k, r = 1.6 * k, pts = [];
      for (var i = 0; i < 10; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / 5;
        var rad = i % 2 === 0 ? R : r;
        pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
      }
      x.beginPath();
      x.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < pts.length; j++) x.lineTo(pts[j][0], pts[j][1]);
      x.closePath();
      x.fill();
    }
    dotTileCache[key] = c;
    return c;
  }
  /* 格纹只画半透明条纹，颜色由 .tk-hero 的 background-color 跟随主题色 */
  var ginghamTile = null;
  function gingham() {
    if (ginghamTile) return ginghamTile;
    var c = document.createElement('canvas');
    c.width = 22; c.height = 22;
    var x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,.62)';
    x.fillRect(0, 0, 22, 9);
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.fillRect(0, 0, 9, 22);
    ginghamTile = c.toDataURL('image/png');
    return ginghamTile;
  }
  /* 奶油上下色带波点瓦片 */
  function bandTile(hue) {
    var bk = 'band' + hue;
    if (tileCache[bk]) return tileCache[bk];
    var c = document.createElement('canvas'); c.width = 13; c.height = 13;
    var x = c.getContext('2d');
    x.fillStyle = 'hsla(' + hue + ',32%,56%,.9)';
    x.beginPath(); x.arc(6.5, 6.5, 1.6, 0, 6.2832); x.fill();
    tileCache[bk] = c.toDataURL('image/png'); return tileCache[bk];
  }
  /* 活页打孔孔位瓦片（竖排重复） */
  function holeStrip(hue) {
    var key = 'hole' + hue;
    if (tileCache[key]) return tileCache[key];
    var c = document.createElement('canvas'); c.width = 16; c.height = 20;
    var x = c.getContext('2d');
    x.fillStyle = 'hsla(' + hue + ',32%,40%,.92)';
    x.beginPath(); x.arc(8, 10, 4.2, 0, 6.2832); x.fill();
    x.strokeStyle = 'hsla(' + hue + ',20%,72%,.7)'; x.lineWidth = 1;
    x.beginPath(); x.arc(8, 10, 4.2, 0, 6.2832); x.stroke();
    tileCache[key] = c.toDataURL('image/png'); return tileCache[key];
  }
  /* 邮票齿孔瓦片（白色半圆孔，横排重复） */
  function perfStrip() {
    if (tileCache.perf) return tileCache.perf;
    var c = document.createElement('canvas'); c.width = 20; c.height = 16;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(10, 8, 7, 0, 6.2832); x.fill();
    tileCache.perf = c.toDataURL('image/png'); return tileCache.perf;
  }

  /* ---------- 渲染小票 ---------- */
  function syncCardUI() {
    var hasCard = state.hasCard !== false;
    var sw = $('#hasCard'); if (!sw) return;
    sw.setAttribute('aria-pressed', String(hasCard));
    $('#hasCardText').textContent = hasCard ? '有卡 · 自动扣实付' : '无卡 · 小票不显示余额';
    $('#balanceRow').hidden = !hasCard;
    var note = $('#balanceNote');
    note.hidden = !hasCard;
    if (!hasCard) return;
    var before = num(state.balance), paid = effPaid(), left = before - paid;
    note.classList.toggle('warn', left < 0);
    note.textContent = left < 0
      ? '余额不足：' + money(before, false) + ' − 实付 ' + money(paid, false) + '，还差 ' + money(-left, false)
      : '结单后剩余 ' + money(left, false) + '（' + money(before, false) + ' − 实付 ' + money(paid, false) + '）';
  }
  /* 连续输入时合并到下一帧再重绘，避免每敲一个字就整张重建 */
  var renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    var flush = function () { if (renderQueued) renderSlip(); };
    requestAnimationFrame(flush);
    setTimeout(flush, 120);   /* 页面在后台时 rAF 会暂停，用定时器兜底 */
  }
  function renderSlip() {
    renderQueued = false;
    syncCardUI();
    var STYLE_LIST = ['classic', 'cream', 'bakery', 'panel', 'pixel'];
    var st = STYLE_LIST.indexOf(state.style) >= 0 ? state.style : 'classic';
    state.style = st;
    var slipEl = $('#slip');
    slipEl.className = 'slip s-' + st;
    slipEl.style.backgroundImage = 'none'; slipEl.style.backgroundSize = 'auto';
    var t = effTotal(), paid = effPaid();
    var lines = state.items.map(function (it, i) {
      return '<div class="tk-item">' +
          '<div class="tk-no">' + String(i + 1).padStart(2, '0') + '</div>' +
          '<div class="tk-main">' +
            '<div class="tk-type">' + esc(it.type || '—') +
              (it.sub ? '<em>' + esc(it.sub) + '</em>' : '') +
            '</div>' +
            '<div class="tk-sub">' + ROLE_LABEL(it.role) + ' · ' + esc(it.name || '—') + '</div>' +
            (it.note && it.note.trim() ? '<div class="tk-note">留言 · ' + esc(it.note.trim()) + '</div>' : '') +
          '</div>' +
          '<div class="tk-amt"><b>' + money(num(it.amt), false) + '</b>' +
            '<small>' + esc(it.qty || '0') + ' ' + esc(it.unit || '件') + '</small>' +
          '</div>' +
        '</div>';
    }).join('');

    var quote = state.quote.trim();
    if (quote) quote = '「' + quote.replace(/^-+|-+$/g, '') + '」';

    var tk = formatTicket(state.when);
    var count = state.items.length;
    var ch = CHARS[state.character] || CHARS.kitty;
    var customImg = state.themeImg || '';
    var heroSrc, heroName, heroStyle;
    if (customImg) {
      var hh = 112, ww = null;
      if (state.themeW > 0 && state.themeH > 0) {
        hh = Math.min(128, state.themeH);
        ww = Math.round(state.themeW * (hh / state.themeH));
      }
      heroSrc = customImg;
      heroName = String(state.themeName || '').trim() || '自定义形象';
      heroStyle = 'height:' + hh + 'px' + (ww ? ';width:' + ww + 'px' : '');
    } else {
      heroSrc = ch.img;
      heroName = ch.name;
      heroStyle = 'height:' + ch.h + 'px';
    }


    var stampBlock = '<div class="tk-stamp"><b>' + esc(STAMP_TEXT) + '</b><small>CLUB</small></div>';
    var logoBlock = state.logoImg
      ? '<div class="tk-logo tk-logo-img"><img src="' + esc(state.logoImg) + '" alt="徽章头像"></div>'
      : '<div class="tk-logo">' + esc(LOGO_MARK) + '</div>';
    var bgBlock = state.bgImg
      ? '<div class="tk-bglayer"><img src="' + esc(state.bgImg) + '" style="opacity:' + Number(state.bgOpacity) + '" alt="小票背景"></div>'
      : '';
    var fBrand = '<div class="tk-brand">' + logoBlock +
      '<div class="tk-name"><h3>' + esc(CLUB_CN) + '</h3><p>' + esc(TICKET_TITLE) + '</p><em>' + esc(SLOGAN) + '</em></div></div>';
    var fMeta = '<div class="tk-meta"><span>SETTLEMENT · 结单凭证</span><span>NO. ' + esc(state.no) + '</span></div>';
    var heroImg = '<img src="' + esc(heroSrc) + '" style="' + heroStyle + '" alt="' + esc(heroName) + '">';
    var fHeroClassic = '<div class="tk-hero" style="background-image:url(' + gingham() + ')">' + heroImg + '<p>' + esc(heroName) + ' · CHARACTER</p></div>';
    var fHero = '<div class="tk-hero">' + heroImg + '<p>' + esc(heroName) + ' · CHARACTER</p></div>';
    var fTime = '<div class="tk-time"><span>' + tk.day + '</span><i></i><span>' + tk.min + '</span><i></i><span>共 ' + count + ' 项</span></div>';
    var fCols = '<div class="tk-cols"><span>明细 ITEM</span><span>数量 · 金额</span></div>';
    var fLines = '<div class="tk-lines">' + lines + '</div>';
    var discSmall = discountRate() < 1 ? '<small style="margin-left:6px;color:var(--tk-ink-2)">' + discountLabel() + '</small>' : '';
    var fSum = '<div class="tk-split"></div><div class="tk-sum">' +
      '<div class="tk-sum-l"><small>TOTAL · 合计</small><b>' + money(t, false) + '</b>' + discSmall + '</div>' +
      stampBlock + '</div>';
    var hasCard = state.hasCard !== false;
    var left = num(state.balance) - paid;
    /* 余额不足时不印负数，改印「不足 · 差多少」 */
    var short = hasCard && left < -0.004;
    var balText = short ? '不足 · 差 ' + money(-left, false) : money(left, false);
    var fChips = '<div class="tk-two' + (hasCard ? '' : ' one') + '">' +
      '<div class="tk-chip a"><small>实付 PAID</small><b>' + money(paid, false) + '</b></div>' +
      (hasCard ? '<div class="tk-chip b' + (short ? ' short' : '') + '"><small>卡内余额 BALANCE</small><b>' + balText + '</b></div>' : '') + '</div>';

    function ledgerRow(k, en, v, cls) {
      return '<div class="tk-row' + (cls ? ' ' + cls : '') + '"><span class="tk-row-k">' + esc(k) + '<em>' + esc(en) + '</em></span><i class="tk-dots"></i><b class="tk-row-v">' + v + '</b></div>';
    }
    var ledgerRows = ledgerRow('总单合计', 'TOTAL', money(t, false), '') +
      ledgerRow('实付金额', 'PAID', money(paid, false), 'hl') +
      (hasCard ? ledgerRow('卡内余额', 'BALANCE', balText, short ? 'short' : '') : '');
    var fLedger = '<div class="tk-ledger">' +
      '<div class="tk-ledger-head"><span>项目金额</span>' + stampBlock + '</div>' +
      '<p class="tk-ledger-note">此次结单金额如下，如有疑问可向客服咨询</p>' +
      '<div class="tk-rows">' + ledgerRows + '</div></div>';
    var fQuote = '<div class="tk-quote">' + esc(quote) + '</div>';

    var inner;
    if (st === 'classic') {
      inner = fMeta + fBrand + fHeroClassic + fTime + fCols + fLines + fSum + fChips + fQuote;
    } else if (st === 'cream' || st === 'panel') {
      inner = fBrand + fMeta + fCols + fLines + fHero + fLedger + fQuote;
    } else {
      inner = fBrand + fMeta + fCols + fLines + fHero + fSum + fChips + fQuote;
    }

    var barInner = st === 'pixel' ? '<div class="tk-winbtns"><i></i><i></i><i class="x"></i></div>' : '';
    var deco = '';
    if (st === 'panel') {
      deco = '<div class="tk-paper"></div>' +
        '<div class="tk-holes" style="background-image:url(' + holeStrip(state.hue) + ')"></div>' +
        '<div class="tk-clip" aria-hidden="true"><svg viewBox="0 0 24 36" width="20" height="30" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 31.5 16.5 9.5a2.6 2.6 0 0 0-4.6-2.4L5.5 22.5a4 4 0 0 0 7 3.9l5.3-10.2a2.2 2.2 0 0 0-3.9-2.1L10.3 21.6"/></svg></div>';
    } else if (st === 'bakery') {
      deco = '<div class="tk-perf tk-perf-t" style="background-image:url(' + perfStrip() + ')"></div>' +
        '<div class="tk-perf tk-perf-b" style="background-image:url(' + perfStrip() + ')"></div>';
    }
    $('#slip').innerHTML = '<div class="tk-basebg"></div>' + bgBlock + '<canvas class="tk-dotlayer" id="dotLayer"></canvas>' + deco +
      '<div class="tk-bar">' + barInner + '</div>' +
      '<div class="tk-in">' + inner + '</div>' +
      '<div class="tk-code">' + barcodeSVG(state.no) + '<p>' + esc(state.no) + '</p></div>' +
      '<div class="tk-in"><div class="tk-end"><p>' + esc(blessText()) + '</p></div></div>' +
      '<div class="tk-tail"></div>';

    paintDotLayer();

    if (st === 'cream') {
      var bt = bandTile(state.hue);
      var cbar = slipEl.querySelector('.tk-bar'), ctail = slipEl.querySelector('.tk-tail');
      if (cbar) cbar.style.backgroundImage = 'url(' + bt + ')';
      if (ctail) ctail.style.backgroundImage = 'url(' + bt + ')';
    }

    var totalInput = $('#total');
    if (totalInput) totalInput.placeholder = fmt(autoTotal());
    var manual = state.total.trim() !== '';
    $('#totalNote').textContent = manual ? '已手动填写合计' : '按明细自动汇总';
    $('#totalReset').hidden = !manual;
    var paidInput = $('#paid');
    if (paidInput) paidInput.placeholder = fmt(afterDiscount());
  }

  /* ---------- 渲染项目编辑区 ---------- */
  function renderItems() {
    $('#items').innerHTML = state.items.map(function (it, i) {
      var idx = String(i + 1).padStart(2, '0');
      var del = state.items.length > 1
        ? '<button class="item-del" type="button" data-del="' + i + '" aria-label="删除第' + idx + '项">&times;</button>' : '';
      return '<div class="item-card" data-idx="' + i + '">' +
        '<div class="item-head"><span class="item-index">#' + idx + '</span>' +
          '<span class="item-label">点单明细</span>' +
          '<button class="pick-btn" type="button" data-pickfor="' + i + '">' + (it.type ? '换项目' : '选择项目') + '</button>' + del + '</div>' +
        '<div class="grid3">' +
          '<div class="field"><label>点单类型</label>' +
            '<input class="control" data-k="type" value="' + esc(it.type) + '" autocomplete="off" placeholder="点「选择项目」或自己填" aria-label="点单类型"></div>' +
          '<div class="field"><label>副标 · 拼音</label>' +
            '<input class="control" data-k="sub" value="' + esc(it.sub) + '" autocomplete="off" aria-label="副标"></div>' +
        '</div>' +
        '<div class="field"><label>身份<span class="hint">陪陪 / 场控 / 直属</span></label>' +
          '<div class="role-seg" data-role="' + esc(it.role || 'peipei') + '">' +
            ROLE_OPTS.map(function (r) {
              return '<button type="button" data-role="' + r.v + '"' + ((it.role || 'peipei') === r.v ? ' class="active"' : '') + '>' + r.label + '</button>';
            }).join('') +
          '</div></div>' +
        '<div class="field"><label>' + ROLE_LABEL(it.role) + '名称</label>' +
          '<input class="control" data-k="name" value="' + esc(it.name) + '" autocomplete="off" aria-label="' + ROLE_LABEL(it.role) + '名称"></div>' +
        '<div class="field"><label>陪陪留言<span class="hint">显示在小票对应单项下方</span></label>' +
          '<input class="control" data-k="note" value="' + esc(it.note || '') + '" autocomplete="off" placeholder="陪陪结单备注" aria-label="陪陪留言"></div>' +
        '<div class="grid3">' +
          '<div class="field"><label>数量</label>' +
            '<input class="control" data-k="qty" inputmode="numeric" value="' + esc(it.qty) + '" autocomplete="off" aria-label="数量"></div>' +
          '<div class="field"><label>金额</label>' +
            '<input class="control" data-k="amt" inputmode="decimal" value="' + esc(it.amt) + '" autocomplete="off" aria-label="金额"></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ---------- 主题 ---------- */
  function applyTheme() {
    document.documentElement.style.setProperty('--hue', state.hue);
    document.documentElement.dataset.night = state.night ? 'on' : 'off';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.night ? 'hsl(' + state.hue + ' 30% 13%)' : 'hsl(' + state.hue + ' 42% 96%)';
    $('#hue').value = state.hue;
    var slip = $('#slip');
    if (slip) paintDotLayer();
    $('#nightBtn').setAttribute('aria-pressed', state.night ? 'true' : 'false');
    $$('.swatch').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.hue) === Number(state.hue)));
    });
    $$('.shape-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.shape === state.dotShape));
    });
    var sizeSlider = $('#dotSize');
    if (sizeSlider) sizeSlider.value = state.dotScale || 1;
    var sizeVal = $('#dotSizeVal');
    if (sizeVal) sizeVal.textContent = Math.round((state.dotScale || 1) * 100) + '%';
    syncChars();
  }
  function toPinyinUpper(text) {
    if (!text) return '';
    var dict = window.PINYIN_DICT || {};   /* js/pinyin.js：GB2312 常用字，生僻字会被跳过 */
    var py = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (dict[ch]) py.push(dict[ch]);
      else if (/[a-zA-Z0-9]/.test(ch)) py.push(ch.toLowerCase());
    }
    return py.join(' ').toUpperCase();
  }
  var STYLES = [
    { k: 'classic', name: '经典', en: 'CLASSIC' },
    { k: 'cream', name: '奶油信笺', en: 'CREAM' },
    { k: 'bakery', name: '黑白烘焙', en: 'BAKERY' },
    { k: 'panel', name: '活页本', en: 'NOTEBOOK' },
    { k: 'pixel', name: '像素风', en: 'PIXEL' }
  ];
  function buildStyles() {
    $('#styleGrid').innerHTML = STYLES.map(function (s) {
      return '<button class="style-btn" type="button" data-style="' + s.k + '" aria-pressed="false">' +
        '<span>' + s.name + '</span><small>' + s.en + '</small></button>';
    }).join('');
  }
  function syncStyles() {
    $$('.style-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.style === state.style));
    });
  }

  /* 波点层按小票的「当前」尺寸画；尺寸变化（字体/图片加载完、窗口缩放、转屏）由 ResizeObserver 触发重画 */
  function paintDotLayer() {
    var slip = $('#slip');
    var cv = $('#dotLayer');
    if (!slip || !cv) return;
    var DW = slip.clientWidth, DH = slip.clientHeight, DPR = 2;
    cv.width = Math.max(1, Math.round(DW * DPR)); cv.height = Math.max(1, Math.round(DH * DPR));
    var x = cv.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, DW, DH);
    if (state.dotOn === false) return;
    var sc = Math.min(1.6, Math.max(0.7, Number(state.dotScale) || 1));
    var pat = x.createPattern(dotTile(state.hue, state.dotShape, sc), 'repeat');
    if (!pat) return;
    x.fillStyle = pat; x.fillRect(0, 0, DW, DH);
  }
  function watchSlipSize() {
    var slip = $('#slip'), last = '';
    function check() {
      var k = slip.clientWidth + 'x' + slip.clientHeight;
      var cv = $('#dotLayer');
      if (k !== last || (cv && cv.width !== Math.max(1, Math.round(slip.clientWidth * 2)))) { last = k; paintDotLayer(); }
    }
    if (window.ResizeObserver) new ResizeObserver(check).observe(slip);
    else window.addEventListener('resize', check);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
  }

  function buildChars() {
    $('#charGrid').innerHTML = Object.keys(CHARS).map(function (k) {
      var c = CHARS[k];
      return '<button class="char-btn" type="button" data-ch="' + k + '" aria-pressed="false" ' +
        'style="--ch-hue:' + c.hue + '" aria-label="' + c.name + ' 主题">' +
        '<img src="' + c.img + '" alt=""><span>' + c.name + '</span></button>';
    }).join('');
  }
  function syncChars() {
    $$('.char-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.ch === state.character));
    });
  }
  function buildSwatches() {
    $('#swatches').innerHTML = PRESETS.map(function (p) {
      return '<button class="swatch" type="button" data-hue="' + p.h + '" title="' + p.name + ' 配色" aria-label="' + p.name + ' 配色" aria-pressed="false" ' +
        'style="background:linear-gradient(150deg, hsl(' + p.h + ' 70% 74%), hsl(' + p.h + ' 62% 54%))"></button>';
    }).join('');
  }

  /* 票面纹理：五种形状，图标用主题色描边/填充 */
  var DOT_META = [
    { shape: 'circle', label: '圆点', icon: '<circle cx="11" cy="11" r="5" />' },
    { shape: 'heart',  label: '爱心', icon: '<path d="M11 15.6C6.8 12.7 5 10.4 5 8.1 5 6 6.6 4.5 8.6 4.5c1 0 1.9.4 2.4 1.2.5-.8 1.4-1.2 2.4-1.2 2 0 3.6 1.5 3.6 3.6 0 2.3-1.8 4.6-6 7.5Z" />' },
    { shape: 'diamond',label: '菱形', icon: '<path d="M11 4.5 15.5 11 11 17.5 6.5 11Z" />' },
    { shape: 'bow',    label: '蝴蝶结', icon: '<path d="M10.4 11 5.2 7.6 5.2 14.4Z" /><path d="M11.6 11 16.8 7.6 16.8 14.4Z" /><circle cx="11" cy="11" r="1.7" />' },
    { shape: 'star',   label: '星星', icon: '<path d="M11 4.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L11 15.7l-4.2 2.2.8-4.7L4.2 9.2l4.7-.7Z" />' }
  ];
  function buildShapeRow() {
    $('#shapeRow').innerHTML = DOT_META.map(function (m) {
      return '<button class="shape-btn" type="button" data-shape="' + m.shape + '" aria-pressed="false" aria-label="' + m.label + '纹理">' +
        '<svg viewBox="0 0 22 22" fill="hsl(var(--hue) 62% 62%)" aria-hidden="true">' + m.icon + '</svg>' +
        '<span>' + m.label + '</span></button>';
    }).join('');
  }

  /* ---------- 提示 ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- 状态存取 ----------
     存档带版本号 v；图片不进 localStorage（在 IndexedDB），下单时间不存（每次打开取当前时间）。 */
  var SCHEMA = 3;
  var NOT_SAVED = MEDIA_KEYS.concat(['when']);
  var saveTimer, saveWarned = false;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var out = { v: SCHEMA };
      Object.keys(state).forEach(function (k) { if (NOT_SAVED.indexOf(k) < 0) out[k] = state[k]; });
      Object.keys(keepInLocal).forEach(function (k) { out[k] = keepInLocal[k]; });
      try {
        localStorage.setItem(KEY, JSON.stringify(out));
        saveWarned = false;
      } catch (e) {
        if (!saveWarned) { saveWarned = true; toast('保存失败：浏览器存储空间不足，刚才的改动只在本次有效'); }
      }
    }, 220);
  }
  /* 旧存档按版本逐步迁移，每一步只跑一次 */
  function migrate(saved) {
    var v = Number(saved.v) || 1;
    if (v < 2) {
      /* V2.0 之前留下的示例数据 */
      if (saved.name === '小满') saved.name = '';
      var it0 = Array.isArray(saved.items) && saved.items.length === 1 ? saved.items[0] : null;
      if (it0 && it0.type === '王者 · 王者以下 技术' && it0.name === '栗子' && it0.amt === '45') saved.items = [];
    }
    if (v < 3) {
      /* 2026-11：店名/盖章改为固定常量；编号改为自动生成；下单时间不再存档；图片移到 IndexedDB（见 restoreMedia） */
      ['clubCn', 'clubEn', 'stampOn', 'stampText', 'when'].forEach(function (k) { delete saved[k]; });
      if (saved.no === 'HP-206031') saved.no = '';
    }
    saved.v = SCHEMA;
    return saved;
  }
  var legacyMedia = {};   /* 旧存档里的 base64 图片，启动后转存到 IndexedDB */
  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    MEDIA_KEYS.forEach(function (k) {
      if (typeof saved[k] === 'string' && saved[k].indexOf('data:') === 0) legacyMedia[k] = saved[k];
      delete saved[k];
    });
    saved = migrate(saved);
    var m = {};
    Object.keys(DEFAULTS).forEach(function (k) { m[k] = saved[k] !== undefined ? saved[k] : DEFAULTS[k]; });
    m.when = toLocalInput(new Date());
    if (!m.no) m.no = nextTicketNo();
    m.bgOpacity = Math.min(1, Math.max(0.1, Number(m.bgOpacity) || 1));
    if (DOT_SHAPES.indexOf(m.dotShape) < 0) m.dotShape = 'circle';
    var sc = Number(m.dotScale);
    m.dotScale = (sc >= 0.7 && sc <= 1.6) ? sc : 1;
    if (!Array.isArray(m.items) || !m.items.length) {
      m.items = DEFAULTS.items.map(function (x) { return Object.assign({}, x); });
    } else {
      m.items.forEach(function (it) {
        if (it.note === undefined) it.note = '';
        if (!it.role || !ROLE_LABELS[it.role]) it.role = 'peipei';
      });
    }
    if (!STYLES.some(function (x) { return x.k === m.style; })) m.style = 'classic';
    return m;
  }
  /* 启动时从 IndexedDB 取回图片；旧版存在 localStorage 里的 base64 图片顺手转存过去 */
  function restoreMedia() {
    var jobs = MEDIA_KEYS.map(function (k) {
      if (legacyMedia[k]) {
        var dataUrl = legacyMedia[k], blob;
        try { blob = dataUrlToBlob(dataUrl); } catch (e) { return Promise.resolve(); }
        setMedia(k, blob, { restored: true });
        /* 确认存进 IndexedDB 之后才从 localStorage 去掉；存不进去就继续留在原处，不丢图 */
        return mediaDb.put(k, blob).catch(function () { keepInLocal[k] = dataUrl; });
      }
      return mediaDb.get(k).then(function (blob) {
        if (blob instanceof Blob && !media[k]) setMedia(k, blob, { restored: true });
      }).catch(function () {});
    });
    return Promise.all(jobs).then(function () {
      legacyMedia = {};
      save();   /* 按新格式写一次存档：已转存的旧 base64 大图从 localStorage 清掉，新单号也落盘 */
      var th = media.themeImg;
      if (th) {
        if (!(state.themeW > 0)) probeThemeSize(th.url);
        if (th.mime === 'image/gif') decodeThemeGif(th.blob);
      }
      refreshThemeUI(); refreshLogoUI(); refreshBgUI();
      renderSlip();
    });
  }
  function probeThemeSize(url) {
    var img = new Image();
    img.onload = function () {
      if (state.themeImg !== url) return;
      state.themeW = img.naturalWidth; state.themeH = img.naturalHeight;
      renderSlip(); save();
    };
    img.src = url;
  }
  function syncForm() {
    $('#when').value = state.when || toLocalInput(new Date());
    syncWhenHint();
    $('#cur').value = state.cur;
    $('#no').value = state.no;
    $('#total').value = state.total;
    $('#paid').value = state.paid;
    $('#discount').value = state.discount || '1';
    $('#balance').value = state.balance;
    $('#quote').value = state.quote;
    $('#name').value = state.name;
    $('#tail').value = state.tail;
    $$('[data-cur]').forEach(function (el) { el.textContent = state.cur; });
    var dotT = $('#dotToggle'); if (dotT) dotT.setAttribute('aria-pressed', String(!!state.dotOn));
  }

  /* ---------- 打印 ---------- */
  var printing = false;
  function runPrint() {
    if (printing) return;
    printing = true;
    refreshAutoTime(true);
    renderSlip();
    var shortBy = effPaid() - num(state.balance);
    if (state.hasCard !== false && shortBy > 0.004) toast('注意：卡内余额不足，还差 ' + money(shortBy, false));
    var mask = $('#paperMask'), printer = $('#printer'), btn = $('#printBtn');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mask.classList.remove('is-fed', 'is-printing', 'is-torn');
    $('#slip').getBoundingClientRect();
    /* 强制重排，让动画从头开始 */
    void mask.offsetWidth;
    mask.classList.add('is-printing');
    printer.classList.add('is-printing');
    btn.disabled = true;
    btn.textContent = '出票中…';
    var dur = reduce ? 60 : 1620;
    setTimeout(function () {
      mask.classList.remove('is-printing');
      mask.classList.add('is-fed');
      printer.classList.remove('is-printing');
      btn.textContent = '撕下小票…';
      setTimeout(function () {
        mask.classList.add('is-torn');
        setTimeout(function () {
          btn.disabled = false;
          btn.textContent = '再打一张';
          printing = false;
          $('#hintLine').textContent = '小票撕下来了，可以存成图片、视频或动图';
        }, reduce ? 40 : 900);
      }, reduce ? 30 : 300);
    }, dur);
  }
  function printWithPosition() {
    var printer = $('#printer');
    var r = printer.getBoundingClientRect();
    var needScroll = r.top < 0 || r.bottom > window.innerHeight + 40;
    if (needScroll) {
      printer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(runPrint, 420);
    } else {
      runPrint();
    }
  }

  /* ---------- 导出：图片 / 视频 / 动图 ---------- */
  var exporting = false;

  /* 截小票：先把待重绘的内容画完、等字体就绪、按当前尺寸重画波点，再交给 html2canvas（首次导出时才加载） */
  function slipCanvas(scale) {
    if (refreshAutoTime(false) || renderQueued) renderSlip();
    return Promise.all([needHtml2canvas(), document.fonts && document.fonts.ready]).then(function () {
      paintDotLayer();
      return window.html2canvas($('#slip'), {
        scale: scale || 2, backgroundColor: '#ffffff', useCORS: true, logging: false
      });
    });
  }
  /* 已解码的 GIF 帧（仅内存，不持久化）：{frames:[{cv,delay}], w,h, loop} */
  var themeGif = null;

  function dataUrlToBytes(dataUrl) {
    var base = String(dataUrl).split(',')[1] || '';
    var bin = atob(base);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decodeGifFrames(bytes) {
    try {
      if (typeof window.GifReader !== 'function') return null;
      var reader = new GifReader(bytes);
      var W = reader.width, H = reader.height;
      if (!W || !H || reader.numFrames() < 1) return null;
      var acc = document.createElement('canvas'); acc.width = W; acc.height = H;
      var actx = acc.getContext('2d');
      var accImg = actx.createImageData(W, H);
      var frames = [], loop = 0, prev = null;
      for (var i = 0; i < reader.numFrames(); i++) {
        var fi = reader.frameInfo(i);
        if (prev && prev.disposal === 2) {
          actx.clearRect(prev.x, prev.y, prev.width, prev.height);
          var refreshed = actx.getImageData(0, 0, W, H);
          accImg.data.set(refreshed.data);
        }
        var buf = new Uint8Array(W * H * 4);
        reader.decodeAndBlitFrameRGBA(i, buf);
        var ad = accImg.data;
        for (var p = 0; p < buf.length; p += 4) {
          if (buf[p + 3] !== 0) {
            ad[p] = buf[p]; ad[p + 1] = buf[p + 1]; ad[p + 2] = buf[p + 2]; ad[p + 3] = buf[p + 3];
          }
        }
        actx.putImageData(accImg, 0, 0);
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        cv.getContext('2d').drawImage(acc, 0, 0);
        var delay = (fi.delay || 10) * 10;
        frames.push({ cv: cv, delay: delay });
        loop += delay;
        prev = fi;
      }
      return { frames: frames, w: W, h: H, loop: loop || 1 };
    } catch (e) { return null; }
  }

  /* 解出 GIF 主题的每一帧（导出动图/视频时逐帧绘制）；刷新页面后也会重新解码 */
  function decodeThemeGif(blob) {
    needGifReader().then(function () { return blobToBytes(blob); }).then(function (bytes) {
      if (!media.themeImg || media.themeImg.blob !== blob) return;   /* 期间已换了别的图 */
      themeGif = decodeGifFrames(bytes);
    }).catch(function () { themeGif = null; });
  }

  function pickGifFrame(gif, t) {
    if (!gif || !gif.frames.length) return null;
    var d = ((t % gif.loop) + gif.loop) % gif.loop;
    var acc = 0;
    for (var i = 0; i < gif.frames.length; i++) {
      acc += gif.frames[i].delay;
      if (d < acc) return gif.frames[i];
    }
    return gif.frames[gif.frames.length - 1];
  }

  function heroOverlay(scale) {
    var img = document.querySelector('#slip .tk-hero img');
    if (!img || !img.src) return null;
    /* 只有自定义上传的动图需要逐帧叠加；内置角色是静态 webp，html2canvas 已经画好 */
    var mime = state.themeImg && media.themeImg ? media.themeImg.mime : '';
    var isGif = mime === 'image/gif';
    var animated = isGif || mime === 'image/webp' || mime === 'image/apng';
    if (!animated) return null;
    var slip = document.getElementById('slip');
    var sr = slip.getBoundingClientRect();
    var ir = img.getBoundingClientRect();
    var k = scale || 2;
    var ov = {
      x: (ir.left - sr.left) * k,
      y: (ir.top - sr.top) * k,
      w: ir.width * k,
      h: ir.height * k
    };
    if (isGif && themeGif) ov.gif = themeGif; else ov.img = img;
    return ov;
  }


  /* ---------- BGM（仅本次会话内存，不写入本地存储） ---------- */
  var PRESET_BGMS = [
    { name: '可爱 1', src: 'assets/bgm/cute-1.m4a' },
    { name: '可爱 2', src: 'assets/bgm/cute-2.m4a' },
    { name: '可爱 3', src: 'assets/bgm/cute-3.m4a' }
  ];
  var bgmBuffer = null;
  var bgmName = '';
  var bgmPreset = -1;
  var bgmCtx = null, bgmDest = null, bgmSource = null;
  var audioEl = null, previewUrl = null, pvPlaying = false;
  var bgmToken = 0;   /* 连续切换时只认最后一次的解码结果 */

  function ensureAudioEl() {
    if (!audioEl) audioEl = $('#bgmAudio');
    return audioEl;
  }

  function refreshBgmUI() {
    var presets = document.querySelectorAll('.bgm-preset');
    presets.forEach(function (btn, i) { btn.classList.toggle('is-active', bgmPreset === i); });
    var has = !!bgmName;
    var clearBtn = $('#bgmClearBtn'), upBtn = $('#bgmUploadBtn'), pvBtn = $('#bgmPreviewBtn');
    if (clearBtn) clearBtn.hidden = !has;
    if (upBtn) upBtn.textContent = has ? '换一首' : '上传 BGM';
    if (pvBtn) { pvBtn.hidden = !has; pvBtn.textContent = pvPlaying ? '暂停试听' : '试听'; }
  }

  /* 暂停试听（保留音源，可以再点「试听」继续） */
  function pausePreview() {
    var el = ensureAudioEl();
    try { if (el) el.pause(); } catch (e) {}
    pvPlaying = false;
  }
  /* 换歌 / 移除时：彻底卸掉音源 */
  function stopPreview() {
    var el = ensureAudioEl();
    try { if (el) { el.pause(); el.removeAttribute('src'); el.load(); } } catch (e) {}
    if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} previewUrl = null; }
    pvPlaying = false;
  }

  function playPreview() {
    var el = ensureAudioEl();
    if (!el || !el.src) { pvPlaying = false; refreshBgmUI(); return; }
    el.loop = true;
    var p = el.play();
    if (p && p.then) {
      p.then(function () { pvPlaying = true; refreshBgmUI(); })
       .catch(function () { pvPlaying = false; refreshBgmUI(); toast('试听被浏览器拦截，再点一次试听'); });
    } else { pvPlaying = true; refreshBgmUI(); }
  }

  function togglePreview() {
    if (pvPlaying) { pausePreview(); } else { playPreview(); }
    refreshBgmUI();
  }

  function _decodeBgm(ab, name, presetIdx, token) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var tmp = new AC();
    tmp.decodeAudioData(ab, function (buf) {
      tmp.close();
      if (token !== bgmToken) return;
      bgmBuffer = buf; bgmName = name; bgmPreset = presetIdx;
      refreshBgmUI();
    }, function () { tmp.close(); if (token === bgmToken) toast('音频解析失败，存视频将不带 BGM'); });
  }

  /* 预设 BGM 是独立的音频文件，点到才下载 */
  function loadPresetBgm(i) {
    var p = PRESET_BGMS[i]; if (!p) return;
    var el = ensureAudioEl();
    var token = ++bgmToken;
    stopPreview();
    bgmBuffer = null;
    el.src = p.src;
    bgmPreset = i; bgmName = p.name;
    refreshBgmUI(); playPreview();
    fetch(p.src).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) { _decodeBgm(ab, p.name, i, token); })
      .catch(function () { if (token === bgmToken) toast('预设 BGM 加载失败，检查一下网络'); });
  }

  function loadBgmFile(file) {
    if (!file) return;
    var el = ensureAudioEl();
    var token = ++bgmToken;
    stopPreview();
    bgmBuffer = null;
    previewUrl = URL.createObjectURL(file);
    el.src = previewUrl;
    bgmPreset = -1; bgmName = file.name || 'BGM';
    refreshBgmUI(); playPreview();
    blobToBytes(file).then(function (u8) { _decodeBgm(u8.buffer, file.name || 'BGM', -1, token); })
      .catch(function () { toast('音频读取失败'); });
  }

  function clearBgm() {
    ++bgmToken;
    stopPreview();
    bgmBuffer = null; bgmName = ''; bgmPreset = -1;
    stopBgmForRecord();
    refreshBgmUI();
  }

  function startBgmForRecord() {
    if (!bgmBuffer) return null;
    pausePreview(); refreshBgmUI();
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      bgmCtx = new AC();
      bgmDest = bgmCtx.createMediaStreamDestination();
      bgmSource = bgmCtx.createBufferSource();
      bgmSource.buffer = bgmBuffer;
      bgmSource.loop = true;
      var gain = bgmCtx.createGain();
      gain.gain.value = 0.9;
      bgmSource.connect(gain); gain.connect(bgmDest);
      bgmSource.start();
      return bgmDest.stream;
    } catch (e) { bgmCtx = bgmDest = bgmSource = null; return null; }
  }

  function stopBgmForRecord() {
    try { if (bgmSource) bgmSource.stop(); } catch (e) {}
    try { if (bgmCtx) bgmCtx.close(); } catch (e) {}
    bgmCtx = bgmDest = bgmSource = null;
  }


  var saveObj = null;

  function closeSheet() {
    $('#saveSheet').hidden = true;
    $('#saveStage').innerHTML = '';
    $('#saveShare').hidden = true;
    $('#saveOpen').hidden = true;
    if (saveObj) { URL.revokeObjectURL(saveObj.url); saveObj = null; }
  }

  function showSave(blob, name, kind) {
    closeSheet();
    var url = URL.createObjectURL(blob);
    saveObj = { url: url, blob: blob, name: name };
    var stage = $('#saveStage');
    stage.innerHTML = '';
    var el;
    if (kind === 'video') {
      el = document.createElement('video');
      el.src = url; el.controls = true; el.loop = true; el.muted = true;
      el.playsInline = true; el.autoplay = true; el.setAttribute('playsinline', '');
    } else {
      el = document.createElement('img');
      el.src = url; el.alt = '结单小票';
    }
    stage.appendChild(el);

    var file = null;
    try { file = new File([blob], name, { type: blob.type || 'application/octet-stream' }); } catch (e) { file = null; }
    var canShare = !!(navigator.canShare && file && navigator.canShare({ files: [file] }));
    $('#saveShare').hidden = !canShare;
    $('#saveOpen').hidden = kind !== 'video';
    var isMp4 = /mp4/i.test(blob.type || '');
    $('#saveTip').textContent = kind === 'video'
      ? (!isMp4
          ? 'WebM 格式（这个浏览器录不了 MP4），部分手机相册打不开 WebM；需要 MP4 请用 Chrome 或 Safari 再存一次，或先「下载文件」。'
          : canShare
          ? 'MP4 格式（H.264），点「保存到相册」调起系统面板选「存储视频」即可。'
          : 'MP4 格式（H.264，相册可直接读）。点「新窗口打开」用系统分享存进相册，或「下载文件」。')
      : (canShare
          ? '长按上方图片，选「存储图像／保存图片」就能进相册；也可以点「保存到相册」。'
          : '长按上方图片，选「存储图像／保存图片」即可存进相册；电脑上点「下载文件」。');
    $('#saveSheet').hidden = false;

    $('#saveShare').onclick = function () {
      if (!canShare || !file) return;
      navigator.share({ files: [file], title: '结单小票 · ' + (state.no || '') }).catch(function () {});
    };
    $('#saveOpen').onclick = function () {
      if (!saveObj) return;
      window.open(saveObj.url, '_blank');
    };
    $('#saveDownload').onclick = function () {
      if (!saveObj) return;
      var a = document.createElement('a');
      a.href = saveObj.url; a.download = saveObj.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
  }

  /* 把「出纸 → 停一下 → 撕下」画在一张画布上，视频和动图共用 */
  function makeStage(base, hero) {
    var pw = base.width, ph = base.height;
    var mx = Math.round(pw * 0.09);
    var slotH = Math.round(pw * 0.08);
    var gap = Math.round(pw * 0.02);
    var mb = Math.round(pw * 0.12);
    var W = pw + mx * 2;
    var slotTop = Math.round(slotH * 0.3);
    var slotBottom = slotTop + slotH;
    var H = slotBottom + gap + ph + mb;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var feed = 1500, hold = 420, tearMs = 860, tail = 320;
    var total = feed + hold + tearMs + tail;

    function draw(t) {
      var hue = state.hue || 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'hsl(' + hue + ', 34%, 94%)');
      g.addColorStop(1, 'hsl(' + hue + ', 26%, 99%)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      var p = Math.min(1, t / feed);
      var e = 1 - Math.pow(1 - p, 2.6);
      var topY = slotBottom + gap - (ph + gap) * (1 - e);

      var after = Math.max(0, t - feed - hold);
      var q = Math.min(1, after / tearMs);
      var lift = q > 0 ? 26 * (1 - Math.pow(1 - q, 2)) : 0;
      var rot = q > 0 ? -1.9 * q : 0;

      ctx.save();
      ctx.translate(W / 2, topY + ph * 0.05 - lift);
      ctx.rotate(rot * Math.PI / 180);
      ctx.shadowColor = 'rgba(70,45,30,' + (0.10 + 0.16 * q) + ')';
      ctx.shadowBlur = 9 + 18 * q;
      ctx.shadowOffsetY = 4 + 9 * q;
      ctx.drawImage(base, -pw / 2, -ph * 0.05, pw, ph);
      if (hero) {
        try {
          var frame = hero.gif ? pickGifFrame(hero.gif, t) : null;
          var paint = frame ? frame.cv : hero.img;
          if (paint) ctx.drawImage(paint, -pw / 2 + hero.x, -ph * 0.05 + hero.y, hero.w, hero.h);
        } catch (e) {}
      }
      ctx.restore();

      /* 撕下来的纸头还挂在槽口 */
      if (q > 0.15) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (q - 0.15) * 5);
        ctx.fillStyle = '#fff';
        ctx.fillRect(W / 2 - pw / 2, slotBottom + gap, pw, 9 + 7 * (1 - q));
        ctx.restore();
      }

      /* 出纸槽 */
      var sw = W - mx * 0.6 * 2;
      var sx = mx * 0.6;
      ctx.save();
      var sg = ctx.createLinearGradient(0, slotTop, 0, slotBottom);
      sg.addColorStop(0, 'hsl(' + hue + ', 24%, 34%)');
      sg.addColorStop(1, 'hsl(' + hue + ', 20%, 20%)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sx, slotTop, sw, slotH, slotH * 0.35);
      else ctx.rect(sx, slotTop, sw, slotH);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(sx + sw * 0.06, slotBottom - 3, sw * 0.88, 3);
      ctx.restore();
    }
    return { canvas: cv, total: total, draw: draw };
  }

  function savePng() {
    if (exporting) return;
    exporting = true;
    var mask = $('#paperMask');
    if (!mask.classList.contains('is-fed')) mask.classList.add('is-fed');
    toast('正在生成图片…');
    slipCanvas(2).then(function (canvas) {
      canvas.toBlob(function (blob) {
        if (!blob) { toast('生成失败，试试直接截图'); exporting = false; return; }
        showSave(blob, '小票-' + (state.no || 'receipt') + '.png', 'image');
        toast('图片好了，长按存进相册');
        exporting = false;
      }, 'image/png');
    }).catch(function () { toast('生成失败，可长按小票保存'); exporting = false; });
  }

  function saveVideo() {
    if (exporting) return;
    if (!window.MediaRecorder || !document.createElement('canvas').captureStream) {
      toast('这台浏览器不支持录视频');
      return;
    }
    exporting = true;
    toast('正在录视频，约 3 秒…');
    slipCanvas(2).then(function (base) {
      var hero = heroOverlay(2);
      if (hero && hero.gif) base.getContext('2d').clearRect(hero.x, hero.y, hero.w, hero.h);
      var st = makeStage(base, hero);
      /* 优先 MP4(H.264)，相册、微信、剪辑软件都能直接读；WebM 只作兜底 */
      var mimes = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      var mime = mimes.filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0];
      if (!mime) { toast('这台浏览器不支持录视频'); exporting = false; return; }
      var stream = st.canvas.captureStream(30);
      var audioStream = startBgmForRecord();
      if (audioStream) audioStream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
      var chunks = [];
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = function () {
        stopBgmForRecord();
        var mp4 = mime.indexOf('mp4') > -1;
        showSave(new Blob(chunks, { type: mime }), '小票-' + (state.no || 'receipt') + (mp4 ? '.mp4' : '.webm'), 'video');
        toast(mp4 ? '视频好了，点保存到相册' : '视频好了，长按存进相册');
        st.canvas.width = st.canvas.height = 0;
        exporting = false;
      };
      rec.start();
      var t0 = performance.now();
      (function loop() {
        var t = performance.now() - t0;
        st.draw(Math.min(t, st.total));
        if (t < st.total) requestAnimationFrame(loop);
        else setTimeout(function () {
          rec.stop();
          stream.getTracks().forEach(function (tr) { tr.stop(); });
        }, 140);
      })();
    }).catch(function () { toast('生成失败'); exporting = false; });
  }

  function saveGif() {
    if (exporting) return;
    exporting = true;
    toast('正在生成动图…');
    /* 必须用 2 倍图：html2canvas 在 1 倍像素比下会把纸底渲染成灰色 */
    needGifEnc().then(function () { return slipCanvas(2); }).then(function (base) {
      var hero = heroOverlay(2);
      if (hero && hero.gif) base.getContext('2d').clearRect(hero.x, hero.y, hero.w, hero.h);
      var st = makeStage(base, hero);
      var W = st.canvas.width, H = st.canvas.height;
      var k = Math.min(1, 300 / W);
      var cw = Math.round(W * k), ch = Math.round(H * k);
      var tmp = document.createElement('canvas');
      tmp.width = cw; tmp.height = ch;
      var tctx = tmp.getContext('2d', { willReadFrequently: true });
      var fps = 12, delay = Math.round(1000 / fps);
      var frames = Math.round(st.total / 1000 * fps);
      var enc = window.GIFEnc.GIFEncoder();
      /* 取「纸面刚完全出来、还没开始撕」的一帧做调色板：没有阴影灰、白底最干净 */
      st.draw(1660);
      tctx.clearRect(0, 0, cw, ch);
      tctx.drawImage(st.canvas, 0, 0, cw, ch);
      var pal = window.GIFEnc.quantize(tctx.getImageData(0, 0, cw, ch).data, 256);
      for (var i = 0; i < frames; i++) {
        st.draw(i / fps * 1000);
        tctx.clearRect(0, 0, cw, ch);
        tctx.drawImage(st.canvas, 0, 0, cw, ch);
        var data = tctx.getImageData(0, 0, cw, ch).data;
        var idx = window.GIFEnc.applyPalette(data, pal);
        enc.writeFrame(idx, cw, ch, {
          palette: pal,
          delay: delay,
          repeat: i === 0 ? 0 : -1,
          transparent: false,
          dispose: 1
        });
      }
      enc.finish();
      var bytes = enc.bytesView();
      showSave(new Blob([bytes], { type: 'image/gif' }), '小票-' + (state.no || 'receipt') + '.gif', 'gif');
      toast('动图好了，长按存进相册');
      exporting = false;
    }).catch(function (e) { console.error('gif-err', (e&&e.stack)||e); toast('生成失败，检查一下网络后再试'); exporting = false; });
  }

  /* ---------- 上传图片相关按钮的显示状态 ---------- */
  function refreshThemeUI() {
    var has = !!state.themeImg;
    $("#themeClearBtn").hidden = !has;
    $("#themeNameField").hidden = !has;
    $("#themeName").value = has ? (state.themeName || '') : '';
  }
  function refreshLogoUI() {
    var has = !!state.logoImg;
    $('#logoPreview').hidden = !has;
    $('#logoClearBtn').hidden = !has;
    if (has) $('#logoPreviewImg').src = state.logoImg;
  }
  function refreshBgUI() {
    var has = !!state.bgImg;
    $("#bgClearBtn").hidden = !has;
    $("#bgOpacityRow").hidden = !has;
    var pct = Math.round((state.bgOpacity || 1) * 100);
    var slider = $("#bgOpacity");
    if (slider) slider.value = pct;
    var val = $("#bgOpacityVal");
    if (val) val.textContent = pct + '%';
  }
  /* ---------- 绑定 ---------- */
  function bind() {
    /* ---------- 背景图裁剪 ---------- */
    var cropState = { srcImg: null, natW: 0, natH: 0, url: '', stageRect: null, imgRect: null, dragging: false, sx: 0, sy: 0, done: null };
    var cropStage = $('#cropStage'), cropImg = $('#cropImg'), cropBox = $('#cropBox');
    function cropReloadRect() {
      cropState.stageRect = cropStage.getBoundingClientRect();
      cropState.imgRect = cropImg.getBoundingClientRect();
    }
    function cropBoxRect() {
      var st = cropState.stageRect, ir = cropState.imgRect;
      return { ix: ir.left - st.left, iy: ir.top - st.top, iw: ir.width, ih: ir.height };
    }
    function cropSetBox(x, y, w, h) {
      cropBox.hidden = false;
      cropBox.style.left = x + 'px';
      cropBox.style.top = y + 'px';
      cropBox.style.width = Math.max(0, w) + 'px';
      cropBox.style.height = Math.max(0, h) + 'px';
    }
    function cropOpen(file, done) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        cropState.srcImg = img;
        cropState.natW = img.naturalWidth;
        cropState.natH = img.naturalHeight;
        cropState.url = url;
        cropState.done = done;
        cropImg.onload = function () {
          $('#cropSheet').hidden = false;
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              cropReloadRect();
              var r = cropBoxRect();
              cropSetBox(r.ix, r.iy, r.iw, r.ih);
            });
          });
        };
        cropImg.src = url;
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('背景图读取失败，请换一张'); };
      img.src = url;
    }
    function cropPoint(ev) {
      var st = cropState.stageRect, ir = cropState.imgRect;
      var px = ev.clientX - st.left, py = ev.clientY - st.top;
      var ix = ir.left - st.left, iy = ir.top - st.top;
      px = Math.min(ir.right - st.left, Math.max(ix, px));
      py = Math.min(ir.bottom - st.top, Math.max(iy, py));
      return { x: px, y: py };
    }
    cropStage.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      cropReloadRect();
      var p = cropPoint(ev);
      cropState.dragging = true;
      cropState.sx = p.x; cropState.sy = p.y;
      cropBox.hidden = true;
      try { cropStage.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    cropStage.addEventListener('pointermove', function (ev) {
      if (!cropState.dragging) return;
      var p = cropPoint(ev);
      var x1 = Math.min(cropState.sx, p.x), y1 = Math.min(cropState.sy, p.y);
      var x2 = Math.max(cropState.sx, p.x), y2 = Math.max(cropState.sy, p.y);
      cropSetBox(x1, y1, x2 - x1, y2 - y1);
    });
    function cropEnd() {
      if (!cropState.dragging) return;
      cropState.dragging = false;
      if (cropBox.offsetWidth < 12 || cropBox.offsetHeight < 12) {
        var r = cropBoxRect();
        cropSetBox(r.ix, r.iy, r.iw, r.ih);
      }
    }
    cropStage.addEventListener('pointerup', cropEnd);
    cropStage.addEventListener('pointercancel', cropEnd);
    function cropCloseSheet() {
      $('#cropSheet').hidden = true;
      if (cropState.url) URL.revokeObjectURL(cropState.url);
      cropState.url = ''; cropState.srcImg = null; cropState.done = null;
      cropImg.removeAttribute('src');
    }
    function cropConfirm() {
      var img = cropState.srcImg;
      if (!img) { cropCloseSheet(); return; }
      /* 还没量过尺寸 / 没框选时（比如点得太快）：当场测量，默认整张图 */
      if (!cropState.stageRect || !cropState.imgRect) cropReloadRect();
      if (cropBox.hidden || cropBox.offsetWidth < 12 || cropBox.offsetHeight < 12) {
        var full = cropBoxRect();
        cropSetBox(full.ix, full.iy, full.iw, full.ih);
      }
      var st = cropState.stageRect, ir = cropState.imgRect;
      var bx = cropBox.offsetLeft, by = cropBox.offsetTop;
      var bw = cropBox.offsetWidth, bh = cropBox.offsetHeight;
      var ix = bx - (ir.left - st.left), iy = by - (ir.top - st.top);
      var sx = ix / ir.width * cropState.natW;
      var sy = iy / ir.height * cropState.natH;
      var sw = bw / ir.width * cropState.natW;
      var sh = bh / ir.height * cropState.natH;
      sx = Math.min(cropState.natW, Math.max(0, sx));
      sy = Math.min(cropState.natH, Math.max(0, sy));
      sw = Math.min(cropState.natW - sx, sw);
      sh = Math.min(cropState.natH - sy, sh);
      if (sw < 8 || sh < 8) { toast('选区太小，请重选'); return; }
      var max = 800, ow = sw, oh = sh;
      if (ow > max || oh > max) {
        var k = Math.min(max / ow, max / oh);
        ow = Math.round(ow * k); oh = Math.round(oh * k);
      }
      var cv = document.createElement('canvas');
      cv.width = ow; cv.height = oh;
      cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
      var done = cropState.done;
      cropCloseSheet();
      cv.toBlob(function (blob) {
        if (!blob) { toast('背景图处理失败，请换一张'); return; }
        if (done) done(blob);
      }, 'image/jpeg', 0.85);
    }
    $('#cropClose').addEventListener('click', cropCloseSheet);
    $('#cropCancel').addEventListener('click', cropCloseSheet);
    $('#cropOk').addEventListener('click', cropConfirm);
    $('#bgUploadBtn').addEventListener('click', function () { $('#bgFile').click(); });
    $('#bgFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      cropOpen(f, function (blob) {
        setMedia('bgImg', blob);
        if (!(state.bgOpacity > 0)) state.bgOpacity = 1;
        refreshBgUI(); renderSlip(); save();
        toast('小票背景已更新');
      });
      e.target.value = '';
    });
    $('#bgClearBtn').addEventListener('click', function () {
      setMedia('bgImg', null);
      refreshBgUI(); renderSlip(); save();
      toast('已恢复默认背景');
    });
    $('#bgOpacity').addEventListener('input', function () {
      state.bgOpacity = Math.min(1, Math.max(0.1, Number(this.value) / 100));
      var pct = Math.round(state.bgOpacity * 100);
      var val = $('#bgOpacityVal'); if (val) val.textContent = pct + '%';
      var img = document.querySelector('.tk-bglayer img');
      if (img) img.style.opacity = state.bgOpacity;
      save();
    });
    $('#items').addEventListener('input', function (e) {
      var card = e.target.closest('.item-card');
      var k = e.target.dataset.k;
      if (!card || !k) return;
      var _idx = Number(card.dataset.idx);
      state.items[_idx][k] = e.target.value;
      if (k === 'amt') { delete state.items[_idx].up; }
      if (k === 'qty' && state.items[_idx].up) {
        var _amt = fmtPrice(state.items[_idx].up * num(e.target.value));
        state.items[_idx].amt = _amt;
        var _amtEl = card.querySelector('[data-k="amt"]');
        if (_amtEl) _amtEl.value = _amt;
      }
      if (k === 'type') {
        var _py = toPinyinUpper(e.target.value);
        state.items[_idx].sub = _py;
        var _subEl = card.querySelector('[data-k="sub"]');
        if (_subEl) _subEl.value = _py;
      }
      scheduleRender(); save();
    });
    $('#items').addEventListener('click', function (e) {
      var pf = e.target.closest('[data-pickfor]');
      if (pf) { openPrices(Number(pf.dataset.pickfor)); return; }
      var segBtn = e.target.closest('.role-seg button');
      if (segBtn) {
        var segCard = segBtn.closest('.item-card');
        if (segCard) {
          state.items[Number(segCard.dataset.idx)].role = segBtn.dataset.role;
          renderItems(); renderSlip(); save();
        }
        return;
      }
      var del = e.target.closest('[data-del]');
      if (!del) return;
      if (state.items.length <= 1) return;
      state.items.splice(Number(del.dataset.del), 1);
      renderItems(); renderSlip(); save();
    });
    $('#openPrices').addEventListener('click', function () { openPrices(-1); });
    $('#closePrices').addEventListener('click', closePrices);
    $('#editPrices').addEventListener('click', function () { priceEditing = !priceEditing; renderPrices(); });
    $('#priceBody').addEventListener('input', function (e) { if (e.target.dataset.f) priceInput(e.target); });
    $('#priceUseNew').addEventListener('click', function () {
      if (!confirm('换成最新的默认价格表？你在这台设备上改过的价格会被覆盖。\n（想先留一份，可以先点「编辑」→「导出价格表」）')) return;
      useDefaultPrices(); renderPrices();
      toast('已换成最新价格表');
    });
    $('#priceKeepMine').addEventListener('click', function () {
      priceBase = PRICE_VERSION; savePrices(); renderPrices();
      toast('已保留你的价格表');
    });
    $('#priceImportFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importPricesFile(f);
      e.target.value = '';
    });
    $('#priceSheet').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) { closePrices(); return; }
      var actBtn = e.target.closest('[data-act]');
      if (actBtn) { priceAction(actBtn.dataset.act, actBtn); return; }
      var tab = e.target.closest('[data-zone]');
      if (tab) { priceZone = Number(tab.dataset.zone); renderPrices(); return; }
      var pick = e.target.closest('[data-pick]');
      if (pick) {
        var ab = pick.dataset.pick.split(':');
        pickPrice(Number(ab[0]), Number(ab[1]));
      }
    });
    $('#addItem').addEventListener('click', function () {
      state.items.push({ type: '', sub: '', role: 'peipei', name: '', note: '', qty: '1', amt: '' });
      renderItems(); renderSlip(); save();
      var last = $('#items').lastElementChild;
      if (last) { $('[data-k=name]', last).focus(); }
    });
    $('#clearItems').addEventListener('click', function () {
      if (!confirm('清空所有点单项目和结算内容，开始下一单？\n（会员卡余额保留，会自动换一个新单号）')) return;
      /* 清空所有点单项目，并重置合计/实付/折扣（会员卡余额保留）；换新单号，时间恢复自动 */
      state.items = [{ type: '', sub: '', role: 'peipei', name: '', note: '', qty: '1', amt: '' }];
      state.total = '';
      state.paid = '';
      state.discount = '1';
      whenManual = false;
      refreshAutoTime(true);
      assignNewNo();
      syncForm(); renderItems(); renderSlip(); save();
      toast('已清空，新单号 ' + state.no);
    });
    $('#newNoBtn').addEventListener('click', function () {
      assignNewNo(); renderSlip(); save();
      toast('新单号 ' + state.no);
    });
    $('#when').addEventListener('input', function (e) {
      state.when = e.target.value;
      whenManual = true; syncWhenHint();
      scheduleRender();
    });

    ['no', 'quote', 'name', 'tail'].forEach(function (id) {
      $('#' + id).addEventListener('input', function (e) {
        state[id] = e.target.value;
        scheduleRender(); save();
      });
    });
    $('#balance').addEventListener('input', function (e) {
      state.balance = e.target.value; scheduleRender(); save();
    });
    $('#hasCard').addEventListener('click', function () {
      state.hasCard = state.hasCard === false;
      renderSlip(); save();
    });
    $('#cur').addEventListener('change', function (e) {
      state.cur = e.target.value;
      $$('[data-cur]').forEach(function (el) { el.textContent = state.cur; });
      renderSlip(); save();
    });

    $('#total').addEventListener('input', function (e) {
      state.total = e.target.value; scheduleRender(); save();
    });
    $('#totalReset').addEventListener('click', function () {
      state.total = ''; $('#total').value = ''; renderSlip(); save();
    });
    $('#paid').addEventListener('input', function (e) {
      state.paid = e.target.value; scheduleRender(); save();
    });
    $('#discount').addEventListener('change', function (e) {
      state.discount = e.target.value; renderSlip(); save();
    });

    $('#charGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.char-btn');
      if (!b) return;
      state.character = b.dataset.ch;
      state.hue = CHARS[state.character].hue;
      setMedia('themeImg', null);
      state.themeName = ''; state.themeW = 0; state.themeH = 0;
      themeGif = null;
      refreshThemeUI();
      applyTheme(); syncForm(); renderSlip(); save();
      toast('已换成「' + CHARS[state.character].name + '」主题');
    });

    $('#shapeRow').addEventListener('click', function (e) {
      var b = e.target.closest('.shape-btn');
      if (!b) return;
      state.dotShape = b.dataset.shape;
      applyTheme(); renderSlip(); save();
      toast('已切换「' + (b.querySelector('span') ? b.querySelector('span').textContent : '') + '」纹理');
    });

    $('#dotSize').addEventListener('input', function (e) {
      state.dotScale = Number(e.target.value);
      applyTheme(); save();
    });
    $('#dotSizeReset').addEventListener('click', function () {
      state.dotScale = 1;
      applyTheme(); save();
      toast('波点大小已复位');
    });

    /* ---------- 徽章头像 ---------- */
    function compressLogo(file, done) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var max = 160;
        var w = img.width, h = img.height;
        if (w > max || h > max) {
          var k = Math.min(max / w, max / h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob(function (blob) {
          if (blob) done(blob); else toast('图片处理失败，请换一张');
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('图片读取失败，请换一张'); };
      img.src = url;
    }
    $('#logoUploadBtn').addEventListener('click', function () { $('#logoFile').click(); });
    $('#logoFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      compressLogo(f, function (blob) {
        setMedia('logoImg', blob);
        refreshLogoUI(); renderSlip(); save();
        toast('徽章头像已更新');
      });
      e.target.value = '';
    });
    $('#logoClearBtn').addEventListener('click', function () {
      setMedia('logoImg', null);
      refreshLogoUI(); renderSlip(); save();
      toast('已恢复默认徽章');
    });
    /* ---------- 自定义主题图（自动抠透明底 / 动图保留动效） ---------- */
    var MAX_ANIM_BYTES = 8 * 1024 * 1024;
    /* done(blob, w, h, animated)：动图原样保留，静态图自动抠成透明底 PNG */
    function loadThemeFile(file, done) {
      var mime = (file.type || '').toLowerCase();
      var animated = (mime === 'image/gif' || mime === 'image/webp' || mime === 'image/apng');
      if (animated && file.size > MAX_ANIM_BYTES) {
        toast('动图太大（超过 8MB），压缩一下再传，不然手机上会很卡');
        return;
      }
      if (!animated) toast('正在抠图…');
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        if (animated) { done(file, img.naturalWidth, img.naturalHeight, true); return; }
        cutoutToTransparent(img, function (blob, w, h) {
          if (blob) done(blob, w, h, false); else toast('抠图失败，请换一张');
        });
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('图片读取失败，请换一张'); };
      img.src = url;
    }
    $('#themeUploadBtn').addEventListener('click', function () { $('#themeFile').click(); });
    $('#themeFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      loadThemeFile(f, function (blob, w, h, animated) {
        themeGif = null;
        setMedia('themeImg', blob);
        state.themeW = w; state.themeH = h;
        if (media.themeImg && media.themeImg.mime === 'image/gif') decodeThemeGif(blob);
        refreshThemeUI(); renderSlip(); save();
        toast(animated ? '主题动图已更新（保留动效）' : '主题图片已更新（透明底）');
      });
      e.target.value = '';
    });
    $('#themeClearBtn').addEventListener('click', function () {
      setMedia('themeImg', null);
      state.themeName = ''; state.themeW = 0; state.themeH = 0;
      themeGif = null;
      refreshThemeUI(); renderSlip(); save();
      toast('已恢复默认角色');
    });
    $('#themeName').addEventListener('input', function () {
      state.themeName = this.value;
      scheduleRender(); save();
    });

    $('#swatches').addEventListener('click', function (e) {
      var b = e.target.closest('.swatch');
      if (!b) return;
      state.hue = Number(b.dataset.hue);
      applyTheme(); renderSlip(); save();
    });
    $('#hue').addEventListener('input', function (e) {
      state.hue = Number(e.target.value);
      document.documentElement.style.setProperty('--hue', state.hue);
      scheduleRender();
      $$('.swatch').forEach(function (b) {
        b.setAttribute('aria-pressed', String(Number(b.dataset.hue) === Number(state.hue)));
      });
      save();
    });
    $('#nightBtn').addEventListener('click', function () {
      state.night = !state.night;
      applyTheme(); save();
    });
    $('#dotToggle').addEventListener('click', function () {
      state.dotOn = !state.dotOn;
      this.setAttribute('aria-pressed', String(state.dotOn));
      applyTheme(); renderSlip(); save();
    });
    $('#styleGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.style-btn');
      if (!b) return;
      state.style = b.dataset.style;
      syncStyles(); renderSlip(); save();
      var s = STYLES.find(function (x) { return x.k === state.style; });
      toast('已换成「' + (s ? s.name : '经典') + '」小票样式');
    });

    $('#printBtn').addEventListener('click', printWithPosition);
    $('#saveClose').addEventListener('click', closeSheet);
    $('#saveSheet').addEventListener('click', function (e) { if (e.target && e.target.id === 'saveSheet') closeSheet(); });
    /* Esc 关掉当前打开的弹层（存相册 / 裁剪 / 价格表） */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#saveSheet').hidden) closeSheet();
      else if (!$('#cropSheet').hidden) cropCloseSheet();
      else if (!$('#priceSheet').hidden) closePrices();
    });
    $('#savePngBtn').addEventListener('click', savePng);
    $('#saveVideoBtn').addEventListener('click', saveVideo);
    $('#saveGifBtn').addEventListener('click', saveGif);
    document.querySelectorAll('.bgm-preset').forEach(function (btn) {
      btn.addEventListener('click', function () { loadPresetBgm(+btn.dataset.preset); });
    });
    $('#bgmUploadBtn').addEventListener('click', function () { $('#bgmFile').click(); });
    $('#bgmPreviewBtn').addEventListener('click', togglePreview);
    $('#bgmClearBtn').addEventListener('click', clearBgm);
    $('#bgmFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) loadBgmFile(f);
      e.target.value = '';
    });
    refreshBgmUI();
  }

  var KEY = 'mayclub-v2';
  var PRESETS = [
    { h: 212, name: '云朵蓝' },
    { h: 340, name: '樱花粉' },
    { h: 160, name: '薄荷绿' },
    { h: 272, name: '香芋紫' },
    { h: 28, name: '奶油橘' },
    { h: 186, name: '海盐青' }
  ];

  /* ================= May Club 价格表（来自价格表图片） =================
     o: [选项名, 单价, 计价单位]
     ⚠ 改了 DEFAULT_PRICES 之后，把 PRICE_VERSION 改成当天日期：
       自己改过价格表的设备会收到「默认价格表已更新」提示，没改过的设备直接用新价格。 */
  var PRICE_VERSION = '2026-11-26';
  var DEFAULT_PRICES = [
    { zone: '王者', note: '按局计价 · 娱乐匹配包赢不可带人 · 甜蜜 +5/局/人', items: [
      { n: '娱乐匹配', o: [['娱乐', 12, '局']] },
      { n: '王者以下', o: [['娱乐', 12, '局'], ['技术', 15, '局'], ['包赢', 20, '局']] },
      { n: '王者–荣耀', o: [['娱乐', 18, '局'], ['技术', 25, '局'], ['包赢', 30, '局']] },
      { n: '荣耀–100星', o: [['娱乐', 21, '局'], ['技术', 30, '局'], ['包赢', 40, '局']] },
      { n: '甜蜜', tip: '加价 · 每人', o: [['每局', 5, '局']] }
    ] },
    { zone: '和平', note: '按时长计价 · 和平无包赢 · 技术带人 +8/人 · 甜蜜 +5/局/半、+8/h，所有都一样', items: [
      { n: '娱乐 · 王牌以下', o: [['半小时', 15, '半小时'], ['1 小时', 30, '小时']] },
      { n: '娱乐 · 王牌以上', o: [['半小时', 20, '半小时'], ['1 小时', 40, '小时']] },
      { n: '技术 · 王牌以下', o: [['半小时', 18, '半小时'], ['1 小时', 36, '小时']] },
      { n: '技术 · 0–20星', o: [['半小时', 22, '半小时'], ['1 小时', 44, '小时']] },
      { n: '战神', o: [['半小时', 25, '半小时'], ['1 小时', 50, '小时']] },
      { n: '技术带人', tip: '加价', o: [['每人', 8, '人']] },
      { n: '甜蜜', tip: '加价 · 每人', o: [['局 / 半小时', 5, '份'], ['1 小时', 8, '小时']] }
    ] },
    { zone: '陪伴', note: '病 / 虐恋在无颜色的前提下', items: [
      { n: '语聊 / 哄睡', o: [['半小时', 15, '半小时'], ['1 小时', 30, '小时']] },
      { n: '叫醒', o: [['每次', 10, '次']] },
      { n: '虚恋', o: [['1 小时', 38, '小时']] },
      { n: '病 / 虐恋', o: [['1 小时', 40, '小时']] },
      { n: '歌单', tip: '每人', o: [['30 秒', 5, '人'], ['60 秒', 10, '人'], ['整首', 15, '人']] },
      { n: '指定头像', tip: '非情头', o: [['每天', 13.14, '天']] },
      { n: '情头单', o: [['每天', 26, '天']] }
    ] },
    { zone: '包陪', note: '包陪区除了吃饭睡觉时间，其余随叫随到', items: [
      { n: '包夜', o: [['6 小时', 350, '次']] },
      { n: '包天', o: [['8 小时', 520, '次']] },
      { n: '包周', o: [['每人', 2888, '人']] },
      { n: '包月', o: [['每人', 8888, '人']] },
      { n: '好友位', tip: '送 2h 王者娱乐 + 20 天群冠', gift: '送 2h 王者娱乐 + 20 天群冠', o: [['每人', 520, '人']] }
    ] }
  ];
  var PRICE_KEY = 'mayclub-prices-v1';
  /* 存档格式：{ base: 基于哪一版默认价格表, list: [...] }；没改过价格表的设备不存档，永远跟着默认走 */
  var priceBase = PRICE_VERSION;
  function clonePrices(list) { return JSON.parse(JSON.stringify(list)); }
  function loadPrices() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(PRICE_KEY) || 'null'); } catch (e) {}
    if (Array.isArray(saved)) saved = { base: '', list: saved };   /* 旧格式：直接存数组 */
    if (saved && Array.isArray(saved.list)) {
      var list = sanitizePrices(saved.list);
      if (list && JSON.stringify(list) !== JSON.stringify(sanitizePrices(DEFAULT_PRICES))) {
        priceBase = saved.base || '';
        return list;
      }
      /* 存的和默认一模一样：等于没改过，删掉存档，以后跟着默认更新 */
      try { localStorage.removeItem(PRICE_KEY); } catch (e) {}
    }
    priceBase = PRICE_VERSION;
    return clonePrices(DEFAULT_PRICES);
  }
  function savePrices() {
    try { localStorage.setItem(PRICE_KEY, JSON.stringify({ base: priceBase, list: PRICES })); }
    catch (e) { toast('价格表保存失败：浏览器存储空间不足'); }
  }
  function useDefaultPrices() {
    PRICES = clonePrices(DEFAULT_PRICES);
    priceBase = PRICE_VERSION;
    priceZone = 0;
    try { localStorage.removeItem(PRICE_KEY); } catch (e) {}
  }
  /* 默认价格表比本机存档新：本机改过价格，且改的时候基于的是旧版默认 */
  function pricesOutdated() {
    var has = false;
    try { has = localStorage.getItem(PRICE_KEY) !== null; } catch (e) {}
    return has && priceBase !== PRICE_VERSION;
  }
  /* 校验并规整价格表（导入文件、旧存档都走这里），结构不对返回 null */
  function sanitizePrices(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var z = list[i];
      if (!z || typeof z !== 'object' || !Array.isArray(z.items)) return null;
      var items = [];
      for (var j = 0; j < z.items.length; j++) {
        var it = z.items[j];
        if (!it || typeof it !== 'object' || !Array.isArray(it.o) || !it.o.length) return null;
        var opts = [];
        for (var k = 0; k < it.o.length; k++) {
          var o = it.o[k];
          if (!Array.isArray(o)) return null;
          opts.push([String(o[0] == null ? '' : o[0]), num(o[1]), String(o[2] == null || o[2] === '' ? '件' : o[2])]);
        }
        var row = { n: String(it.n == null ? '' : it.n), o: opts };
        if (it.tip) row.tip = String(it.tip);
        if (it.gift) row.gift = String(it.gift);
        items.push(row);
      }
      out.push({ zone: String(z.zone == null ? '' : z.zone), note: String(z.note == null ? '' : z.note), items: items });
    }
    return out;
  }
  function exportPrices() {
    var d = new Date();
    var day = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    var data = { app: 'mayclub-prices', exportedAt: d.toISOString(), base: priceBase, list: PRICES };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'MayClub-价格表-' + day + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('价格表已导出，发给其他设备导入即可');
  }
  function importPricesFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data = null;
      try { data = JSON.parse(String(fr.result)); } catch (e) {}
      var list = sanitizePrices(data && !Array.isArray(data) ? data.list : data);
      if (!list) { toast('文件格式不对：请选「导出价格表」得到的 .json 文件'); return; }
      if (!confirm('用导入的价格表（' + list.length + ' 个分区）替换这台设备上的价格表？')) return;
      PRICES = list;
      priceBase = PRICE_VERSION;
      priceZone = 0;
      savePrices(); renderPrices();
      toast('价格表已导入');
    };
    fr.onerror = function () { toast('文件读取失败'); };
    fr.readAsText(file);
  }
  var PRICES = loadPrices();
  var priceZone = 0, priceEditing = false, pickTarget = -1;
  function fmtPrice(n) {
    n = Math.round((n + Number.EPSILON) * 100) / 100;
    return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2);
  }
  function renderPriceTabs() {
    $('#priceTabs').innerHTML = PRICES.map(function (z, i) {
      return '<button type="button" role="tab" data-zone="' + i + '" aria-selected="' + (i === priceZone) + '">' + esc(z.zone || '未命名') + '</button>';
    }).join('') + (priceEditing ? '<button type="button" class="pe-tab-add" data-act="addZone">+ 分区</button>' : '');
  }
  function renderPrices() {
    if (priceZone >= PRICES.length) priceZone = Math.max(0, PRICES.length - 1);
    $('#priceUpdate').hidden = !pricesOutdated();
    var eb = $('#editPrices');
    eb.textContent = priceEditing ? '完成' : '编辑';
    eb.setAttribute('aria-pressed', String(priceEditing));
    $('#priceFoot').textContent = priceEditing
      ? '改动只保存在这台设备上；要同步到别的设备，用「导出 / 导入价格表」'
      : '点价格即可加入点单；之后改「数量」金额会自动按单价重算';
    renderPriceTabs();
    var z = PRICES[priceZone];
    if (!z) {
      $('#priceBody').innerHTML = '<div class="price-note">还没有分区' + (priceEditing ? '，点上方「+ 分区」新建' : '，点「编辑」添加') + '</div>' +
        (priceEditing ? '<div class="pe-actions"><button type="button" class="clear-item" data-act="reset">恢复默认价格表</button></div>' + PRICE_IO : '');
      return;
    }
    if (!priceEditing) {
      $('#priceBody').innerHTML = (z.note ? '<div class="price-note">' + esc(z.note) + '</div>' : '') +
        z.items.map(function (it, ii) {
          return '<div class="price-row"><div class="price-row-name">' + esc(it.n) +
            (it.tip ? '<small>' + esc(it.tip) + '</small>' : '') + '</div><div class="price-opts">' +
            it.o.map(function (o, oi) {
              return '<button type="button" class="price-opt" data-pick="' + ii + ':' + oi + '">' + esc(o[0]) +
                '<b>' + fmtPrice(num(o[1])) + '</b><i>/' + esc(o[2]) + '</i></button>';
            }).join('') + '</div></div>';
        }).join('');
      return;
    }
    $('#priceBody').innerHTML =
      '<div class="pe-line"><input class="control pe-in" data-f="zone" value="' + esc(z.zone) + '" placeholder="分区名" aria-label="分区名">' +
        '<button type="button" class="pe-del" data-act="delZone">删除分区</button></div>' +
      '<input class="control pe-in" data-f="note" value="' + esc(z.note || '') + '" placeholder="分区说明（可留空）" aria-label="分区说明">' +
      z.items.map(function (it, ii) {
        return '<div class="price-row pe-row" data-ii="' + ii + '">' +
          '<div class="pe-line"><input class="control pe-in" data-f="n" value="' + esc(it.n) + '" placeholder="项目名" aria-label="项目名">' +
            '<input class="control pe-in" data-f="tip" value="' + esc(it.tip || '') + '" placeholder="小字备注" aria-label="小字备注">' +
            '<button type="button" class="pe-x" data-act="delItem" aria-label="删除项目">&times;</button></div>' +
          '<div class="pe-sub">选项 · 价格 · 单位</div>' +
          it.o.map(function (o, oi) {
            return '<div class="pe-line pe-opt" data-oi="' + oi + '">' +
              '<input class="control pe-in" data-f="o0" value="' + esc(o[0]) + '" placeholder="选项名" aria-label="选项名">' +
              '<input class="control pe-in" data-f="o1" inputmode="decimal" value="' + esc(o[1]) + '" placeholder="价格" aria-label="价格">' +
              '<input class="control pe-in" data-f="o2" value="' + esc(o[2]) + '" placeholder="单位" aria-label="单位">' +
              '<button type="button" class="pe-x" data-act="delOpt" aria-label="删除选项">&times;</button></div>';
          }).join('') +
          '<button type="button" class="pe-add" data-act="addOpt">+ 选项</button></div>';
      }).join('') +
      '<div class="pe-actions"><button type="button" class="add-item" data-act="addItem">+ 新项目</button>' +
        '<button type="button" class="clear-item" data-act="reset">恢复默认</button></div>' +
      PRICE_IO;
  }
  var PRICE_IO = '<div class="pe-io"><button type="button" class="btn btn-ghost" data-act="export">导出价格表</button>' +
    '<button type="button" class="btn btn-ghost" data-act="import">导入价格表</button></div>';
  function priceAction(act, el) {
    var z = PRICES[priceZone];
    var row = el.closest('[data-ii]'), line = el.closest('[data-oi]');
    var ii = row ? Number(row.dataset.ii) : -1, oi = line ? Number(line.dataset.oi) : -1;
    if (act === 'export') { exportPrices(); return; }
    if (act === 'import') { $('#priceImportFile').click(); return; }
    if (act === 'reset') {
      if (!confirm('把价格表恢复成默认价格？你的改动会被覆盖。')) return;
      useDefaultPrices();
      renderPrices();
      return;
    }
    if (act === 'addZone') {
      PRICES.push({ zone: '新分区', note: '', items: [{ n: '新项目', o: [['', 0, '次']] }] });
      priceZone = PRICES.length - 1;
    } else if (act === 'delZone') {
      if (!z || !confirm('删除分区「' + (z.zone || '未命名') + '」和里面的所有项目？')) return;
      PRICES.splice(priceZone, 1);
    } else if (act === 'addItem') {
      z.items.push({ n: '新项目', o: [['', 0, '次']] });
    } else if (act === 'delItem') {
      if (!confirm('删除项目「' + (z.items[ii].n || '未命名') + '」？')) return;
      z.items.splice(ii, 1);
    } else if (act === 'addOpt') {
      var prev = z.items[ii].o[z.items[ii].o.length - 1];
      z.items[ii].o.push(['', 0, prev ? prev[2] : '次']);
    } else if (act === 'delOpt') {
      if (z.items[ii].o.length <= 1) { toast('每个项目至少保留一个价格'); return; }
      z.items[ii].o.splice(oi, 1);
    }
    savePrices(); renderPrices();
  }
  function priceInput(el) {
    var z = PRICES[priceZone], f = el.dataset.f;
    if (!z || !f) return;
    if (f === 'zone') { z.zone = el.value; renderPriceTabs(); }
    else if (f === 'note') { z.note = el.value; }
    else {
      var it = z.items[Number(el.closest('[data-ii]').dataset.ii)];
      if (f === 'n') it.n = el.value;
      else if (f === 'tip') it.tip = el.value;
      else {
        var o = it.o[Number(el.closest('[data-oi]').dataset.oi)];
        if (f === 'o0') o[0] = el.value;
        else if (f === 'o1') o[1] = num(el.value);
        else if (f === 'o2') o[2] = el.value;
      }
    }
    savePrices();
  }
  function openPrices(target) {
    pickTarget = typeof target === 'number' ? target : -1;
    priceEditing = false;
    renderPrices(); $('#priceSheet').hidden = false;
  }
  function closePrices() { $('#priceSheet').hidden = true; pickTarget = -1; }
  function pickPrice(ii, oi) {
    var z = PRICES[priceZone], it = z.items[ii], o = it.o[oi];
    var price = num(o[1]), label = String(o[0] || '').replace(/\s+/g, '');
    var type = z.zone + ' · ' + it.n + (it.o.length > 1 && label ? ' ' + label : '');
    var row = { type: type, sub: toPinyinUpper(type), role: 'peipei', name: '', note: it.gift || '',
      qty: '1', amt: fmtPrice(price), up: price, unit: o[2] || '件' };
    var last = state.items[state.items.length - 1];
    if (pickTarget >= 0 && state.items[pickTarget]) {
      /* 从某一项的「选择项目」打开：替换这一项，保留身份 / 名称 */
      var cur = state.items[pickTarget];
      row.role = cur.role || 'peipei';
      row.name = cur.name || '';
      if (!row.note) row.note = cur.note || '';
      state.items[pickTarget] = row;
      renderItems(); renderSlip(); save();
      closePrices();
      toast('已选择：' + type + ' ' + fmtPrice(price) + '/' + (o[2] || '件'));
      return;
    }
    /* 只有一项空白时直接替换，不留空行 */
    if (state.items.length === 1 && last && !String(last.type || '').trim() && !String(last.amt || '').trim()) {
      row.name = last.name || '';
      state.items[0] = row;
    } else {
      state.items.push(row);
    }
    renderItems(); renderSlip(); save();
    toast('已加入：' + type + ' ' + fmtPrice(price) + '/' + (o[2] || '件'));
  }

  /* 身份三选一：陪陪 / 场控 / 直属 */
  var ROLE_OPTS = [
    { v: 'peipei', label: '陪陪' },
    { v: 'changkong', label: '场控' },
    { v: 'zhishu', label: '直属' }
  ];
  var ROLE_LABELS = { peipei: '陪陪', changkong: '场控', zhishu: '直属' };
  function ROLE_LABEL(role) { return ROLE_LABELS[role] || '陪陪'; }

  var DEFAULTS = {
    when: '',             /* 运行时：每次打开取当前时间，不存档 */
    cur: '¥',
    no: '',               /* 空 = 启动时自动生成单号 */
    items: [{ type: '', sub: '', role: 'peipei', name: '', note: '', qty: '1', amt: '' }],
    total: '',
    paid: '',
    discount: '1',
    balance: '1000',
    hasCard: true,
    quote: '今天这份手气，记得带回家',
    name: '',
    tail: '',
    character: 'cinnamoroll',
    logoImg: '',          /* 三张图在运行时是 blob: 地址，原图存在 IndexedDB */
    bgImg: '',
    bgOpacity: 1,
    themeImg: '',
    themeName: '',
    themeW: 0,
    themeH: 0,
    hue: 212,
    night: false,
    dotShape: 'circle',
    dotScale: 1,
    dotOn: true,
    style: 'classic'
  };

  /* ---------- 启动 ---------- */
  var state = load();
  buildChars();
  buildSwatches();
  buildShapeRow();
  buildStyles();
  applyTheme();
  syncStyles();
  syncForm();
  renderItems();
  renderSlip();
  bind();
  refreshThemeUI();
  refreshLogoUI();
  refreshBgUI();
  watchSlipSize();
  autoTimeAt = Date.now();
  restoreMedia();   /* 取回图片后会按新格式写一次存档 */
})();
