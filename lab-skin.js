/* COOLINGDOWN LAB — 统一界面皮肤（HEAT TYPE 的排版）
 * 左侧浅色侧栏放工具名和全部控件，右侧是画面。
 * 只移动 DOM 节点、改样式，不碰工具自己的渲染逻辑。
 *
 * 每个工具页：
 *   <head> 里：<script src="../lab-skin.js" data-mode="2d|3d"></script>
 *   <body> 里第一个脚本之前：<script>LabSkin.build()</script>
 * 3d 模式：three.js 工具按 window.innerWidth 铺满窗口，这里把 innerWidth 改成“窗口宽度减侧栏宽度”，
 * 画布放在侧栏右边，比例和鼠标位置都不会错（鼠标用 window.__lxX 修正）。
 */
(function () {
  'use strict';
  const SIDE = 300, MQ = '(min-width: 761px)';
  const me = document.currentScript;
  const mode = (me && me.dataset.mode) || '2d';
  const desk = () => matchMedia(MQ).matches;

  /* 工具名，由 build.py 生成 */
  const META = /*__META__*/{"heat-type": {"name": "HEAT TYPE", "zh": "热成像字标", "desc": "任意文字变成正在冷却的热源，同 LAB 首页标题。PNG 可透明，另有 MP4 / GIF 和给 AE 的透明 PNG 序列。", "versions": [{"label": "标准", "href": "tools/heat-type.html"}]}, "vhs": {"name": "VHS-O-MATIC", "zh": "复古录像机", "desc": "扫描线、色偏、噪点与时间码，把照片变成录像带截帧。", "versions": [{"label": "标准", "href": "tools/vhs.html"}]}, "ascii-forge": {"name": "ASCII-FORGE", "zh": "分区字符艺术引擎", "desc": "按区域把图像转成字符画，可导出 JPG / SVG。", "versions": [{"label": "终极版", "href": "tools/ascii-forge.html"}]}, "riso": {"name": "SPECTRAL-RISO", "zh": "孔版印刷", "desc": "分色错位与网点，模拟 Risograph 印刷质感。", "versions": [{"label": "印刷级输出版", "href": "tools/riso.html"}]}, "citypop": {"name": "TOKYO NEON WAVE", "zh": "City Pop 风格生成器", "desc": "霓虹、渐变落日与八十年代的东京夜色。", "versions": [{"label": "标准", "href": "tools/citypop.html"}]}, "citypop-illust": {"name": "TOKYO ILLUSTRATOR", "zh": "城市流行插画机", "desc": "把照片概括成平涂色块的 City Pop 插画。", "versions": [{"label": "标准", "href": "tools/citypop-illust.html"}]}, "dream-haze-1": {"name": "DREAM HAZE", "zh": "梦境模糊生成器", "desc": "酸性色彩与柔焦光晕。", "versions": [{"label": "基础", "href": "tools/dream-haze-1.html"}, {"label": "Pro Export", "href": "tools/dream-haze-2.html"}]}, "dream-haze-2": {"name": "DREAM HAZE", "zh": "梦境模糊生成器", "desc": "酸性色彩与柔焦光晕。", "versions": [{"label": "基础", "href": "tools/dream-haze-1.html"}, {"label": "Pro Export", "href": "tools/dream-haze-2.html"}]}, "contour": {"name": "CONTOUR-X", "zh": "轮廓艺术生成器", "desc": "提取等高轮廓线，生成酸性像素图形。", "versions": [{"label": "标准", "href": "tools/contour.html"}]}, "thermal": {"name": "THERMAL VISION LAB", "zh": "热成像生成器", "desc": "把亮度映射成红外热成像色谱。", "versions": [{"label": "标准", "href": "tools/thermal.html"}]}, "stretch": {"name": "OMNI-STRETCH", "zh": "全能像素拉伸", "desc": "按行或列拉伸像素，制造速度与撕裂感。", "versions": [{"label": "标准", "href": "tools/stretch.html"}]}, "cyber-art": {"name": "CYBER ART PRO", "zh": "算法图像处理", "desc": "抖动、阈值、像素化等一组算法滤镜。", "versions": [{"label": "标准", "href": "tools/cyber-art.html"}]}, "glitch-mosaic": {"name": "GLITCH & MOSAIC", "zh": "故障与马赛克", "desc": "故障切片与马赛克风格的快速编辑器。", "versions": [{"label": "标准", "href": "tools/glitch-mosaic.html"}]}, "particle-verse": {"name": "PARTICLE-VERSE", "zh": "空间粒子重构", "desc": "把图片拆解成可旋转的三维粒子云。", "versions": [{"label": "标准", "href": "tools/particle-verse.html"}]}, "particle-storm-1": {"name": "PARTICLE-STORM", "zh": "粒子风暴", "desc": "可交互的流体粒子，触控版用鼠标，感应版用摄像头隔空操作。", "versions": [{"label": "触控版", "href": "tools/particle-storm-1.html"}, {"label": "隔空感应版 · 需摄像头", "href": "tools/particle-storm-2.html"}]}, "particle-storm-2": {"name": "PARTICLE-STORM", "zh": "粒子风暴", "desc": "可交互的流体粒子，触控版用鼠标，感应版用摄像头隔空操作。", "versions": [{"label": "触控版", "href": "tools/particle-storm-1.html"}, {"label": "隔空感应版 · 需摄像头", "href": "tools/particle-storm-2.html"}]}, "terrain-scan-1": {"name": "TERRAIN-SCAN", "zh": "3D 扫描线地形", "desc": "由图像亮度生成的赛博网格地形。", "versions": [{"label": "基础", "href": "tools/terrain-scan-1.html"}, {"label": "战术终端", "href": "tools/terrain-scan-2.html"}]}, "terrain-scan-2": {"name": "TERRAIN-SCAN", "zh": "3D 扫描线地形", "desc": "由图像亮度生成的赛博网格地形。", "versions": [{"label": "基础", "href": "tools/terrain-scan-1.html"}, {"label": "战术终端", "href": "tools/terrain-scan-2.html"}]}, "type-mutant-1": {"name": "TYPE-MUTANT", "zh": "字体变异实验室", "desc": "变形、拉伸、骨架化文字。骨架版导出的路径可以直接在 AI 里用路径查找器联集。", "versions": [{"label": "v1.2", "href": "tools/type-mutant-1.html"}, {"label": "v2.4 骨架版", "href": "tools/type-mutant-2.html"}]}, "type-mutant-2": {"name": "TYPE-MUTANT", "zh": "字体变异实验室", "desc": "变形、拉伸、骨架化文字。骨架版导出的路径可以直接在 AI 里用路径查找器联集。", "versions": [{"label": "v1.2", "href": "tools/type-mutant-1.html"}, {"label": "v2.4 骨架版", "href": "tools/type-mutant-2.html"}]}, "chrometype-1": {"name": "CHROMETYPE", "zh": "液态金属排版机", "desc": "实时渲染的三维液态金属文字。", "versions": [{"label": "X · 液态金属", "href": "tools/chrometype-1.html"}, {"label": "Z · 液态生物金属", "href": "tools/chrometype-2.html"}]}, "chrometype-2": {"name": "CHROMETYPE", "zh": "液态金属排版机", "desc": "实时渲染的三维液态金属文字。", "versions": [{"label": "X · 液态金属", "href": "tools/chrometype-1.html"}, {"label": "Z · 液态生物金属", "href": "tools/chrometype-2.html"}]}}/*__END__*/;

  /* 字体和样式表 */
  const base = me ? me.src.replace(/lab-skin\.js.*$/, '') : '../';
  document.write(
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Noto+Sans+SC:wght@300;400;500&family=Courier+Prime:wght@400;700&family=Inter:wght@400;700;800;900&display=swap">' +
    `<link rel="stylesheet" href="${base}lab-skin.css">`);
  document.documentElement.classList.add('lx', 'lx-' + mode);

  if (mode === '3d') {
    const real = () => document.documentElement.clientWidth || screen.width;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => desk() ? Math.max(100, real() - SIDE) : real() });
    } catch (_) {}
    Object.defineProperty(window, '__lxX', { configurable: true, get: () => desk() ? SIDE : 0 });
  }

  const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]+\s*/gu;
  function stripEmoji(root) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    nodes.forEach(n => { if (EMOJI.test(n.nodeValue)) { EMOJI.lastIndex = 0; n.nodeValue = n.nodeValue.replace(EMOJI, ''); } EMOJI.lastIndex = 0; });
  }

  function build() {
    const body = document.body;
    if (!body || body.classList.contains('lx-built')) return;
    body.classList.add('lx-built');

    const slug = location.pathname.split('/').pop().replace(/\.html$/, '');
    const m = META[slug] || {};

    const side = document.createElement('aside');
    side.className = 'lx-side';
    side.innerHTML = `<div class="lx-head"><h1 class="lx-name"></h1><p class="lx-zh"></p><p class="lx-desc"></p><nav class="lx-vers"></nav></div>`;
    side.querySelector('.lx-name').textContent = m.name || document.title;
    side.querySelector('.lx-zh').textContent = m.zh || '';
    side.querySelector('.lx-desc').textContent = m.desc || '';
    const vers = side.querySelector('.lx-vers');
    (m.versions || []).forEach(v => {
      const a = document.createElement('a');
      a.href = v.href.replace(/^tools\//, ''); a.textContent = v.label;
      if (v.href.endsWith(slug + '.html')) a.className = 'on';
      vers.append(a);
    });
    if ((m.versions || []).length < 2) vers.remove();

    // 控件面板（可能有多个，比如状态提示）
    const panels = [...body.querySelectorAll('.controls, .controls-panel')].filter(p => !p.parentElement.closest('.controls, .controls-panel'));
    const box = document.createElement('div');
    box.className = 'lx-controls';
    panels.forEach(p => {
      box.append(p);
    });
    // 和控件相邻的状态提示也放进侧栏
    body.querySelectorAll('#statusText, #msg').forEach(s => box.append(s));
    side.append(box);

    // 原来的大标题、副标题、HUD 装饰线由侧栏标题代替
    body.querySelectorAll(':scope > h1, :scope > h2, :scope > .hud-line').forEach(h => h.classList.add('lx-hidden'));
    box.querySelectorAll('h1').forEach(h => h.classList.add('lx-hidden'));

    const stage = document.createElement('main');
    stage.className = 'lx-stage';
    [...body.children].forEach(el => {
      if (el === side || el.id === '__lab_back' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return;
      if (el.classList.contains('lx-hidden')) return;
      if (mode === '3d') return;               // 3d：画布和覆盖层原地不动，由 CSS 定位到侧栏右边
      stage.append(el);
    });
    body.prepend(side);
    if (mode !== '3d') side.after(stage);
    stripEmoji(side);
  }

  window.LabSkin = { build };
  // 兜底：如果页面里没有手动调用
  document.addEventListener('DOMContentLoaded', build);
})();
