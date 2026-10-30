/* COOLINGDOWN LAB — 统一导出面板
 * 图片：PNG / JPG（高清重渲染）    视频：MP4（H.264）/ GIF
 *
 * 每个工具页底部调用：
 *   LabExport.setup({
 *     name: 'riso',                       // 文件名前缀
 *     ready: () => !!sourceImg,           // 没准备好时提示先载入图片
 *     image: { sizes: [...], render: async (size) => canvas },
 *     svg: () => exportSVG(),             // 可选，保留工具自带的 SVG 导出
 *     video: { source: () => canvas, decorate: (ctx, w, h) => {} },  // 可选，动态效果才有
 *     hide: ['#oldButton', ...],          // 隐藏工具里旧的导出控件
 *   });
 */
(function () {
  'use strict';

  const MP4_MUXER = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs';
  const MAX_SIDE = 16384;             // 浏览器画布单边上限
  const MAX_AREA = 268e6;             // Chrome 画布面积上限（约 2.68 亿像素）

  /* ---------------- 工具函数 ---------------- */
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const stamp = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    nativeClick.call(a);
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function copyCanvas(src, w = src.width, h = src.height, smooth = true) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = smooth;
    if (smooth) g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    return c;
  }

  /* ---------------- 拦截工具自带的导出 ----------------
   * 很多工具已经有自己的高清渲染（2x/4x/8x），最后用 canvas.toDataURL + a.click() 下载 JPG。
   * 这里在调用它们时临时接管这两个方法：拿到高清画布本身，不触发原来的下载，
   * 再由我们按用户选的格式（PNG/JPG）输出。工具原有的渲染逻辑一行不改。 */
  const nativeToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const nativeClick = HTMLAnchorElement.prototype.click;
  let capture = null;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    if (capture) { capture.canvas = this; return 'data:,'; }
    return nativeToDataURL.apply(this, args);
  };
  HTMLAnchorElement.prototype.click = function () {
    if (capture && this.download && capture.canvas) {
      const c = capture; capture = null; c.resolve(c.canvas); return;
    }
    return nativeClick.call(this);
  };
  function intercept(fn, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const nativeAlert = window.alert;
      let timer;
      const end = () => { clearTimeout(timer); capture = null; window.alert = nativeAlert; };
      capture = { canvas: null, resolve: c => { end(); resolve(c); } };
      // 工具自己的检查（比如“请先生成”）会弹 alert，这里转成面板里的提示
      window.alert = msg => { end(); reject(new Error(String(msg))); };
      timer = setTimeout(() => { end(); reject(new Error('渲染超时')); }, timeout);
      try { fn(); } catch (e) { end(); reject(e); }
    });
  }

  /* 从工具自带的尺寸下拉框生成尺寸选项，导出时设定它的值再调用工具自己的导出函数 */
  function fromSelect(selectId, exportFn) {
    const sel = document.getElementById(selectId);
    const sizes = [...sel.options].map(o => ({ value: o.value, label: o.textContent.trim() }));
    return {
      sizes,
      render: async size => {
        const old = sel.value;
        sel.value = size;
        try { return await intercept(exportFn); } finally { sel.value = old; }
      },
    };
  }

  /* three.js：提高像素比重新渲染一帧，得到真正的高分辨率画面 */
  function three(getRenderer, getScene, getCamera, factors = [1, 2, 4]) {
    return {
      sizes: factors.map(f => ({ value: f, label: f === 1 ? '1x (屏幕)' : `${f}x` })),
      render: async f => {
        const renderer = getRenderer(), base = renderer.getPixelRatio();
        const gl = renderer.getContext();
        const limit = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0], MAX_SIDE);
        const size = renderer.getSize(new THREE.Vector2());
        let ratio = base * f;
        const longest = Math.max(size.x, size.y) * ratio;
        if (longest > limit) ratio *= limit / longest;
        try {
          renderer.setPixelRatio(ratio);
          renderer.setSize(size.x, size.y, false);
          renderer.render(getScene(), getCamera());
          return copyCanvas(renderer.domElement);
        } finally {
          renderer.setPixelRatio(base);
          renderer.setSize(size.x, size.y, false);
          renderer.render(getScene(), getCamera());
        }
      },
    };
  }

  /* 动画类 2D 工具：把放大倍数挂到 window.__labS，等主循环用高分辨率画一帧再取 */
  function animatedScale(getCanvas, factors = [1, 2, 4], decorate) {
    return {
      sizes: factors.map(f => ({ value: f, label: f === 1 ? '1x (预览)' : `${f}x` })),
      render: async f => {
        window.__labS = f;
        try {
          await nextFrame(); await nextFrame();
          const out = copyCanvas(getCanvas());
          if (decorate) decorate(out.getContext('2d'), out.width, out.height, f);
          return out;
        } finally { window.__labS = 1; }
      },
    };
  }

  /* 逐像素编辑类工具：输出工作画布；放大用最近邻插值，像素边缘保持锐利 */
  function pixelCanvas(getCanvas, factors = [1, 2, 4]) {
    return {
      default: 1,
      sizes: factors.map(f => ({ value: f, label: f === 1 ? '原尺寸' : `${f}x 像素放大` })),
      render: async f => {
        const c = getCanvas();
        return f === 1 ? copyCanvas(c) : copyCanvas(c, c.width * f, c.height * f, false);
      },
    };
  }

  /* ---------------- GIF 编码（在 Worker 里跑，不卡画面） ---------------- */
  const GIF_WORKER = `
  let W, H, delay, parts = [];
  const push = (arr) => parts.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr));
  const u16 = n => [n & 255, (n >> 8) & 255];
  function quantize(px) {
    const hist = new Uint32Array(32768), n = px.length >> 2, key = new Uint16Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const k = ((px[j] >> 3) << 10) | ((px[j + 1] >> 3) << 5) | (px[j + 2] >> 3);
      key[i] = k; hist[k]++;
    }
    const cols = [];
    for (let k = 0; k < 32768; k++) if (hist[k]) cols.push(k);
    const comp = (k, a) => a === 0 ? k >> 10 : a === 1 ? (k >> 5) & 31 : k & 31;
    const mkBox = list => {
      let mn = [31, 31, 31], mx = [0, 0, 0], cnt = 0;
      for (const k of list) { for (let a = 0; a < 3; a++) { const v = comp(k, a); if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } cnt += hist[k]; }
      return { list, mn, mx, cnt };
    };
    const boxes = [mkBox(cols)];
    while (boxes.length < 256) {
      let best = -1, score = 0;
      boxes.forEach((b, i) => {
        if (b.list.length < 2) return;
        const r = Math.max(b.mx[0] - b.mn[0], b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]);
        const s = r * Math.sqrt(b.cnt);
        if (s > score) { score = s; best = i; }
      });
      if (best < 0) break;
      const b = boxes[best];
      const ranges = [0, 1, 2].map(a => b.mx[a] - b.mn[a]);
      const ax = ranges.indexOf(Math.max(...ranges));
      b.list.sort((p, q) => comp(p, ax) - comp(q, ax));
      let acc = 0, cut = 1;
      for (let i = 0; i < b.list.length - 1; i++) { acc += hist[b.list[i]]; if (acc >= b.cnt / 2) { cut = i + 1; break; } cut = i + 1; }
      boxes.splice(best, 1, mkBox(b.list.slice(0, cut)), mkBox(b.list.slice(cut)));
    }
    const pal = new Uint8Array(768), lut = new Uint8Array(32768);
    boxes.forEach((b, i) => {
      let r = 0, g = 0, bl = 0, c = 0;
      for (const k of b.list) { const h = hist[k]; r += (k >> 10) * h; g += ((k >> 5) & 31) * h; bl += (k & 31) * h; c += h; lut[k] = i; }
      pal[i * 3] = Math.round(r / c * 8.226); pal[i * 3 + 1] = Math.round(g / c * 8.226); pal[i * 3 + 2] = Math.round(bl / c * 8.226);
    });
    const idx = new Uint8Array(n);
    for (let i = 0; i < n; i++) idx[i] = lut[key[i]];
    return { pal, idx };
  }
  function lzw(idx) {
    const minSize = 8, clear = 256, eoi = 257;
    let size = minSize + 1, next = eoi + 1, table = new Map();
    const out = []; let cur = 0, bits = 0;
    const emit = c => { cur |= c << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
    emit(clear);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = (prefix << 8) | k, hit = table.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) { emit(clear); table = new Map(); size = minSize + 1; next = eoi + 1; }
      else { if (next >= (1 << size)) size++; table.set(key, next++); }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (bits > 0) out.push(cur & 255);
    const blocks = [minSize];
    for (let i = 0; i < out.length; i += 255) { const s = out.slice(i, i + 255); blocks.push(s.length, ...s); }
    blocks.push(0);
    return blocks;
  }
  onmessage = e => {
    const m = e.data;
    if (m.type === 'start') {
      W = m.w; H = m.h; delay = m.delay; parts = [];
      push([71, 73, 70, 56, 57, 97, ...u16(W), ...u16(H), 0x70, 0, 0]);
      push([0x21, 0xFF, 0x0B, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0]);
    } else if (m.type === 'frame') {
      const { pal, idx } = quantize(new Uint8Array(m.data));
      push([0x21, 0xF9, 4, 0x04, ...u16(delay), 0, 0]);
      push([0x2C, 0, 0, 0, 0, ...u16(W), ...u16(H), 0x87]);
      push(pal);
      push(lzw(idx));
      postMessage({ type: 'progress' });
    } else if (m.type === 'end') {
      push([0x3B]);
      postMessage({ type: 'done', blob: new Blob(parts, { type: 'image/gif' }) });
    }
  };`;

  /* ---------------- 面板 ---------------- */
  const CSS = `
  #__lx_btn{all:initial;box-sizing:border-box;width:auto;height:auto;margin:0;text-transform:none;position:fixed;right:96px;bottom:14px;z-index:2147483647;font:600 11px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.12em;color:#000;background:#fff;border:1px solid #fff;padding:8px 12px;border-radius:999px;cursor:pointer;
    box-shadow:0 2px 14px rgba(0,0,0,.4)}
  #__lx_btn.rec{background:#ff2a2a;border-color:#ff2a2a;color:#fff;animation:__lxblink 1s infinite}
  @keyframes __lxblink{50%{opacity:.6}}
  #__lx_panel{position:fixed;right:14px;bottom:52px;z-index:2147483647;width:290px;max-height:calc(100vh - 70px);overflow:auto;
    font:12px/1.5 ui-monospace,Menlo,"PingFang SC",monospace;color:#eee;background:rgba(12,12,12,.94);
    border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:14px;display:none;
    backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:left}
  #__lx_panel.open{display:block}
  #__lx_panel *{box-sizing:border-box;font-family:inherit}
  #__lx_panel h4{margin:0 0 8px;font-size:10px;letter-spacing:.2em;color:#888;font-weight:600}
  #__lx_panel section+section{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)}
  #__lx_panel .row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
  #__lx_panel .lbl{width:100%;font-size:10px;color:#777;margin-bottom:-1px}
  #__lx_panel button{all:unset;cursor:pointer;font-size:11px;padding:6px 9px;border:1px solid #444;border-radius:5px;color:#ddd;
    transition:.15s;white-space:nowrap}
  #__lx_panel button:hover{border-color:#aaa;color:#fff}
  #__lx_panel button.on{background:#eee;color:#000;border-color:#eee}
  #__lx_panel button.go{flex:1;text-align:center;font-weight:700;letter-spacing:.08em;border-color:#888;color:#fff;padding:8px}
  #__lx_panel button.go:hover{background:#fff;color:#000}
  #__lx_panel button.stop{flex:1;text-align:center;background:#ff2a2a;border-color:#ff2a2a;color:#fff;font-weight:700;padding:8px}
  #__lx_panel button[disabled]{opacity:.35;pointer-events:none}
  #__lx_panel .note{font-size:10.5px;color:#888;line-height:1.6}
  #__lx_status{margin-top:10px;font-size:11px;color:#9f9;min-height:16px;word-break:break-all}
  #__lx_status.err{color:#ff7a7a}`;

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v);
    }
    kids.flat().forEach(k => e.append(k));
    return e;
  }
  function chips(options, initial, onPick) {
    const row = el('div', { class: 'row' });
    options.forEach(o => {
      const b = el('button', { onclick: () => { row.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onPick(o.value); } }, o.label);
      if (String(o.value) === String(initial)) b.classList.add('on');
      row.append(b);
    });
    return row;
  }

  function setup(cfg) {
    const style = el('style'); style.textContent = CSS; document.head.append(style);
    (cfg.hide || []).forEach(h => {
      const nodes = typeof h === 'function' ? [].concat(h() || []) : [...document.querySelectorAll(h)];
      nodes.forEach(n => { if (n) n.style.display = 'none'; });
    });

    const status = el('div', { id: '__lx_status' });
    const say = (msg, err) => { status.textContent = msg; status.classList.toggle('err', !!err); };
    const notReady = () => {
      if (cfg.ready && !cfg.ready()) { say(cfg.readyMsg || '请先载入图片', true); return true; }
      return false;
    };
    const panel = el('div', { id: '__lx_panel' });
    const btn = el('button', { id: '__lx_btn', onclick: () => panel.classList.toggle('open') }, '⤓ EXPORT');

    /* --- 图片 --- */
    if (cfg.image) {
      const sizes = cfg.image.sizes;
      let size = cfg.image.default ?? (sizes[Math.min(1, sizes.length - 1)] || {}).value;
      const imgBtns = [];
      const exportImage = async fmt => {
        if (notReady()) return;
        imgBtns.forEach(b => b.disabled = true);
        say('渲染中…');
        await sleep(30);
        try {
          const c = await cfg.image.render(size);
          if (!c || !c.width) throw new Error('没有拿到画面');
          if (c.width > MAX_SIDE || c.height > MAX_SIDE || c.width * c.height > MAX_AREA)
            throw new Error(`尺寸 ${c.width}×${c.height} 超过浏览器上限，请选小一档`);
          const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
          const blob = await new Promise(r => c.toBlob(r, type, 0.95));
          if (!blob) throw new Error(`尺寸 ${c.width}×${c.height} 太大，浏览器编码失败，请选小一档`);
          const v = String(size).replace(/[^\w]/g, '');
          const label = sizes.length > 1 ? (/^\d$/.test(v) ? `-${v}x` : `-${v}`) : '';
          download(blob, `${cfg.name}${label}-${stamp()}.${fmt === 'png' ? 'png' : 'jpg'}`);
          say(`已导出 ${fmt.toUpperCase()} · ${c.width}×${c.height}px · ${(blob.size / 1048576).toFixed(1)}MB`);
        } catch (e) { say('导出失败：' + e.message, true); console.error(e); }
        imgBtns.forEach(b => b.disabled = false);
      };
      const goRow = el('div', { class: 'row' });
      [['png', 'PNG'], ['jpg', 'JPG']].forEach(([f, l]) => {
        const b = el('button', { class: 'go', onclick: () => exportImage(f) }, l); imgBtns.push(b); goRow.append(b);
      });
      if (cfg.svg) goRow.append(el('button', { class: 'go', onclick: () => { if (!notReady()) { cfg.svg(); say('已导出 SVG'); } } }, 'SVG'));
      panel.append(el('section', {},
        el('h4', {}, '图片 IMAGE'),
        sizes.length > 1 ? [el('div', { class: 'lbl' }, '尺寸'), chips(sizes, size, v => size = v)] : [],
        goRow,
        el('div', { class: 'note' }, cfg.image.note || 'PNG 无损，适合继续在 PS / AI 里编辑；JPG 体积小。'),
      ));
    }

    /* --- 视频 --- */
    if (cfg.video) {
      let dur = 5, res = 'full', gifW = 720, recording = null;
      const startRow = el('div', { class: 'row' });
      const mp4Btn = el('button', { class: 'go', onclick: () => start('mp4') }, '● MP4');
      const gifBtn = el('button', { class: 'go', onclick: () => start('gif') }, '● GIF');
      startRow.append(mp4Btn, gifBtn);
      const stopRow = el('div', { class: 'row', style: 'display:none' });
      const stopBtn = el('button', { class: 'stop', onclick: () => recording && recording.stop() }, '■ 停止并保存');
      stopRow.append(stopBtn);

      const start = async fmt => {
        if (notReady() || recording) return;
        const src = cfg.video.source();
        if (!src || !src.width) return say('画面还没准备好', true);
        recording = { stop: () => {} };
        say('准备录制…');
        try {
          recording = fmt === 'mp4' ? await recordMP4(src, res, cfg.video.decorate, dur) : recordGIF(src, gifW, cfg.video.decorate, dur);
        } catch (e) { recording = null; return say('无法开始录制：' + e.message, true); }
        startRow.style.display = 'none'; stopRow.style.display = 'flex'; btn.classList.add('rec');
        const t0 = performance.now();
        const tick = setInterval(() => {
          const s = (performance.now() - t0) / 1000;
          say(`● 录制 ${fmt.toUpperCase()} ${Math.min(s, dur || s).toFixed(1)}s${dur ? ' / ' + dur + 's' : ''}${dur && s >= dur ? ' · 编码中…' : ''}`);
        }, 100);
        recording.stopped.then(async ({ blob, w, h, ext, note }) => {
          clearInterval(tick);
          download(blob, `${cfg.name}-${stamp()}.${ext}`);
          say(`已导出 ${ext.toUpperCase()} · ${w}×${h}px · ${(blob.size / 1048576).toFixed(1)}MB${note ? ' · ' + note : ''}`);
        }).catch(e => { clearInterval(tick); say('录制失败：' + e.message, true); console.error(e); })
          .finally(() => { recording = null; startRow.style.display = 'flex'; stopRow.style.display = 'none'; btn.classList.remove('rec'); });
      };

      panel.append(el('section', {},
        el('h4', {}, '视频 VIDEO'),
        el('div', { class: 'lbl' }, '时长'),
        chips([{ value: 3, label: '3s' }, { value: 5, label: '5s' }, { value: 10, label: '10s' }, { value: 0, label: '手动停止' }], dur, v => dur = v),
        el('div', { class: 'lbl' }, 'MP4 分辨率'),
        chips([{ value: 'full', label: '原尺寸 (≤4K)' }, { value: 1920, label: '1080p' }], res, v => res = v),
        el('div', { class: 'lbl' }, 'GIF 宽度'),
        chips([{ value: 480, label: '480' }, { value: 720, label: '720' }, { value: 1080, label: '1080' }], gifW, v => gifW = v),
        startRow, stopRow,
        el('div', { class: 'note' }, cfg.video.note || 'MP4 为 H.264 恒定 30fps，可直接导入 PS / AE / PR。录制时可以继续调参数、拖动画面。'),
      ));
    }

    panel.append(status);
    document.body.append(btn, panel);
  }

  /* ---------------- 录制：共用的逐帧采样 ---------------- */
  function sampler(src, w, h, fps, decorate, onFrame, maxFrames, onLimit) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    let running = true, n = 0, t0 = null;
    const loop = now => {
      if (!running) return;
      if (t0 === null) t0 = now;
      // 按真实时间补齐帧数，保证导出的视频速度和屏幕上一致
      const due = Math.floor((now - t0) / 1000 * fps) + 1;
      if (n < due) {
        g.drawImage(src, 0, 0, w, h);
        if (decorate) decorate(g, w, h, w / src.width);
        while (n < due && !(maxFrames && n >= maxFrames)) onFrame(c, g, n++);
        if (maxFrames && n >= maxFrames) { running = false; onLimit && onLimit(); return; }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return { stop: () => { running = false; return n; } };
  }
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  function fit(src, longSide) {
    let w = src.width, h = src.height;
    const k = Math.min(1, longSide / Math.max(w, h));
    return [even(w * k), even(h * k)];
  }

  const once = fn => { let done = false; return (...a) => { if (!done) { done = true; return fn(...a); } }; };

  async function recordMP4(src, res, decorate, dur) {
    const fps = 30;
    const [w, h] = fit(src, res === 'full' ? 3840 : res);
    if (window.VideoEncoder) {
      const bitrate = Math.min(60e6, Math.max(10e6, Math.round(w * h * fps * 0.2)));
      let config = null;
      for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.4d0033', 'avc1.42003e', 'avc1.640028']) {
        const c = { codec, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' } };
        try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch (_) {}
      }
      if (config) {
        const { Muxer, ArrayBufferTarget } = await import(MP4_MUXER);
        const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h, frameRate: fps }, fastStart: 'in-memory' });
        let failure = null;
        const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
        encoder.configure(config);
        let resolveStop;
        const s = sampler(src, w, h, fps, decorate, (canvas, g, i) => {
          if (failure) return;
          const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
          encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
          frame.close();
        }, dur * fps, () => resolveStop());
        const stopped = new Promise((res2, rej) => { resolveStop = once(async () => {
          const frames = s.stop();
          try {
            await encoder.flush(); encoder.close();
            if (failure) throw failure;
            if (!frames) throw new Error('没有录到画面');
            muxer.finalize();
            res2({ blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), w, h, ext: 'mp4', note: `${(frames / fps).toFixed(1)}s` });
          } catch (e) { rej(e); }
        }); });
        return { stop: () => resolveStop(), stopped };
      }
    }
    // 备用：MediaRecorder（较老的浏览器）
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('这个浏览器不支持视频录制，请用最新版 Chrome / Edge / Safari');
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    let stopRec;
    const s = sampler(src, w, h, fps, decorate, (canvas) => { c.getContext('2d').drawImage(canvas, 0, 0); }, dur * fps, () => stopRec());
    const rec = new MediaRecorder(c.captureStream(fps), { mimeType: mime, videoBitsPerSecond: 20e6 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const stopped = new Promise(res2 => { rec.onstop = () => res2({ blob: new Blob(chunks, { type: mime }), w, h, ext, note: ext === 'webm' ? '浏览器不支持 MP4，已存为 WebM' : '' }); });
    stopRec = once(() => { s.stop(); rec.stop(); });
    rec.start(100);
    return { stop: () => stopRec(), stopped };
  }

  function recordGIF(src, gifW, decorate, dur) {
    const delay = 7;                        // 1/100 秒 → 约 14fps
    const fps = 100 / delay;
    const k = Math.min(1, gifW / src.width);
    const w = Math.max(2, Math.round(src.width * k)), h = Math.max(2, Math.round(src.height * k));
    const worker = new Worker(URL.createObjectURL(new Blob([GIF_WORKER], { type: 'text/javascript' })));
    worker.postMessage({ type: 'start', w, h, delay });
    let sent = 0, encoded = 0;
    const MAX_FRAMES = 300;                 // 约 21 秒上限，防止内存爆掉
    let stopFn;
    const s = sampler(src, w, h, fps, decorate, (canvas, g) => {
      const data = g.getImageData(0, 0, w, h).data.buffer;
      worker.postMessage({ type: 'frame', data }, [data]);
      sent++;
    }, dur ? Math.round(dur * fps) : MAX_FRAMES, () => stopFn && stopFn());
    const stopped = new Promise((res, rej) => {
      worker.onmessage = e => {
        if (e.data.type === 'progress') encoded++;
        if (e.data.type === 'done') { worker.terminate(); res({ blob: e.data.blob, w, h, ext: 'gif', note: `${sent} 帧` }); }
      };
      worker.onerror = e => { worker.terminate(); rej(new Error(e.message || 'GIF 编码出错')); };
      stopFn = () => { stopFn = null; s.stop(); if (!sent) { worker.terminate(); rej(new Error('没有录到画面')); } else worker.postMessage({ type: 'end' }); };
    });
    return { stop: () => stopFn && stopFn(), stopped };
  }

  window.LabExport = { setup, intercept, fromSelect, three, animatedScale, pixelCanvas, copyCanvas, nextFrame };
})();
