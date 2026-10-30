#!/usr/bin/env python3
"""把 ~/图片处理程序 里的工具合并成一个网站。

原文件不动：复制到 tools/<slug>.html，注入返回按钮，再生成 index.html。
改了原文件之后重新运行： python3 build.py
"""
import json
import re
import shutil
from pathlib import Path

SRC = Path.home() / "图片处理程序"
OUT = Path(__file__).resolve().parent
TOOLS = OUT / "tools"

# 一张卡片 = 一个效果；versions 里多个文件 = 卡片上可切换的版本
# art: 卡片缩略图的生成图案（见 template.html 里的 ART）
CARDS = [
    # ---------- 图像 ----------
    dict(id="vhs", cat="image", name="VHS-O-MATIC", zh="复古录像机", accent="#ff3300", art="vhs",
         desc="扫描线、色偏、噪点与时间码，把照片变成录像带截帧。",
         versions=[("复古照片.html", "标准")]),
    dict(id="ascii-forge", cat="image", name="ASCII-FORGE", zh="分区字符艺术引擎", accent="#00d2ff", art="ascii",
         desc="按区域把图像转成字符画，可导出 JPG / SVG。",
         versions=[("image/ascii/ascii完整版.html", "终极版")]),
    dict(id="ascii-live", cat="image", name="ASCII-LIVE", zh="动态字符 · 视频录制", accent="#00ff9d", art="ascii",
         desc="实时字符化视频，并直接录制输出。",
         versions=[("image/ascii/动态ascii.html", "视频录制版")]),
    dict(id="riso", cat="image", name="SPECTRAL-RISO", zh="孔版印刷", accent="#ff48b0", art="riso",
         desc="分色错位与网点，模拟 Risograph 印刷质感。",
         versions=[("image/riso/孔板印刷.html", "印刷级输出版")]),
    dict(id="citypop", cat="image", name="TOKYO NEON WAVE", zh="City Pop 风格生成器", accent="#ff00cc", art="citypop",
         desc="霓虹、渐变落日与八十年代的东京夜色。",
         versions=[("image/citypop/citypop.html", "标准")]),
    dict(id="citypop-illust", cat="image", name="TOKYO ILLUSTRATOR", zh="城市流行插画机", accent="#3d7bff", art="citypop",
         desc="把照片概括成平涂色块的 City Pop 插画。",
         versions=[("image/citypop/citypop插画.html", "标准")]),
    dict(id="dream-haze", cat="image", name="DREAM HAZE", zh="梦境模糊生成器", accent="#ff0055", art="haze",
         desc="酸性色彩与柔焦光晕。",
         versions=[("image/酸性/gala.html", "基础"), ("image/酸性/gala完整版.html", "Pro Export")]),
    dict(id="contour", cat="image", name="CONTOUR-X", zh="轮廓艺术生成器", accent="#8a4dff", art="contour",
         desc="提取等高轮廓线，生成酸性像素图形。",
         versions=[("image/酸性像素/yk2.html", "标准")]),
    dict(id="thermal", cat="image", name="THERMAL VISION LAB", zh="热成像生成器", accent="#ff4d00", art="thermal",
         desc="把亮度映射成红外热成像色谱。",
         versions=[("image/热成像/热成像.html", "标准")]),
    dict(id="stretch", cat="image", name="OMNI-STRETCH", zh="全能像素拉伸", accent="#e8e8e8", art="stretch",
         desc="按行或列拉伸像素，制造速度与撕裂感。",
         versions=[("image/一些常规/拉伸.html", "标准")]),
    dict(id="cyber-art", cat="image", name="CYBER ART PRO", zh="算法图像处理", accent="#00ff88", art="dither",
         desc="抖动、阈值、像素化等一组算法滤镜。",
         versions=[("image/一些常规/进阶.html", "标准")]),
    dict(id="glitch-mosaic", cat="image", name="GLITCH & MOSAIC", zh="故障与马赛克", accent="#00e5ff", art="glitch",
         desc="故障切片与马赛克风格的快速编辑器。",
         versions=[("image/粒子宇宙/editor.html", "标准")]),
    # ---------- 3D ----------
    dict(id="particle-verse", cat="3d", name="PARTICLE-VERSE", zh="空间粒子重构", accent="#00d2ff", art="particles",
         desc="把图片拆解成可旋转的三维粒子云。",
         versions=[("image/粒子宇宙/粒子宇宙.html", "标准")]),
    dict(id="particle-storm", cat="3d", name="PARTICLE-STORM", zh="粒子风暴", accent="#00ffcc", art="particles",
         desc="可交互的流体粒子，触控版用鼠标，感应版用摄像头隔空操作。",
         versions=[("image/粒子宇宙/粒子流体触控.html", "触控版"),
                   ("image/粒子宇宙/感应版粒子.html", "隔空感应版 · 需摄像头")]),
    dict(id="terrain-scan", cat="3d", name="TERRAIN-SCAN", zh="3D 扫描线地形", accent="#33ff33", art="terrain",
         desc="由图像亮度生成的赛博网格地形。",
         versions=[("image/地形扫描/赛博3D 网格地形.html", "基础"),
                   ("image/地形扫描/网格地形进阶.html", "战术终端")]),
    # ---------- 字体 ----------
    dict(id="type-mutant", cat="type", name="TYPE-MUTANT", zh="字体变异实验室", accent="#ff0055", art="type",
         desc="变形、拉伸、骨架化文字。骨架版导出的路径可以直接在 AI 里用路径查找器联集。",
         versions=[("type/type.html", "v1.2"), ("type/可用于Ai路径查找器-联集.html", "v2.4 骨架版")]),
    dict(id="chrometype", cat="type", name="CHROMETYPE", zh="液态金属排版机", accent="#00ffcc", art="chrome",
         desc="实时渲染的三维液态金属文字。",
         versions=[("type/液态金属字体/液态金属.html", "X · 液态金属"),
                   ("type/液态金属字体/液态金属进阶.html", "Z · 液态生物金属")]),
]

BACK_BUTTON = """
<!-- image-lab: back to index -->
<a href="../index.html" id="__lab_back" title="返回首页">&larr; LAB</a>
<style>
#__lab_back{position:fixed;right:14px;bottom:14px;z-index:2147483647;
  font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;
  color:#fff;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);
  padding:8px 11px;border-radius:999px;text-decoration:none;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:.6;transition:opacity .2s}
#__lab_back:hover{opacity:1}
</style>
"""


def main():
    if TOOLS.exists():
        shutil.rmtree(TOOLS)
    TOOLS.mkdir(parents=True)

    used = set()
    manifest = []
    for card in CARDS:
        versions = []
        for i, (rel, label) in enumerate(card["versions"]):
            src = SRC / rel
            html = src.read_text(encoding="utf-8")
            if "</body>" not in html:
                raise SystemExit(f"{rel}: 找不到 </body>")
            # 插在最后一个 </body> 之前
            idx = html.rfind("</body>")
            html = html[:idx] + BACK_BUTTON + html[idx:]
            slug = card["id"] if len(card["versions"]) == 1 else f"{card['id']}-{i + 1}"
            assert slug not in used, slug
            used.add(slug)
            (TOOLS / f"{slug}.html").write_text(html, encoding="utf-8")
            versions.append({"label": label, "href": f"tools/{slug}.html"})
        manifest.append({k: card[k] for k in ("id", "cat", "name", "zh", "accent", "art", "desc")}
                        | {"versions": versions})

    # 检查有没有漏掉的源文件
    covered = {rel for c in CARDS for rel, _ in c["versions"]}
    missing = sorted(str(p.relative_to(SRC)) for p in SRC.rglob("*.html") if str(p.relative_to(SRC)) not in covered)
    if missing:
        print("⚠️  这些源文件没有放进网站：", *missing, sep="\n  ")

    template = (OUT / "template.html").read_text(encoding="utf-8")
    data = json.dumps(manifest, ensure_ascii=False, indent=1)
    index = re.sub(r"/\*__DATA__\*/.*?/\*__END__\*/", lambda _: data, template, flags=re.S)
    (OUT / "index.html").write_text(index, encoding="utf-8")
    n = sum(len(c["versions"]) for c in manifest)
    print(f"完成：{len(manifest)} 个效果，{n} 个工具页 → {OUT / 'index.html'}")



if __name__ == "__main__":
    main()
