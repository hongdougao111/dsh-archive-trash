#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
dsh-archive-trash 宣传片渲染器

设计：
  - 1920x1080 / 30fps / 总时长 ~3分20秒
  - 纯程序化绘制（Pillow 逐帧），不依赖外部素材
  - 五个段落，各有自己的视觉语言
  - 底部有全局进度条 + 段落名
"""

import math
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
FPS = 30

FONT_DIR = r"C:\Windows\Fonts"
F_BOLD = os.path.join(FONT_DIR, "msyhbd.ttc")
F_REG = os.path.join(FONT_DIR, "msyh.ttc")
F_LIGHT = os.path.join(FONT_DIR, "msyhl.ttc")
F_MONO = os.path.join(FONT_DIR, "consola.ttf")

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# 主题色（对齐 DSH 深色界面）
BG0 = (12, 15, 22)
BG1 = (20, 26, 38)
INK = (236, 240, 248)
INK_DIM = (150, 162, 182)
ACCENT = (91, 141, 239)
DANGER = (255, 90, 95)
OK = (72, 199, 142)
WARN = (247, 186, 74)


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def ease_out(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    t = clamp(t)
    return 3 * t * t - 2 * t * t * t


def ease_out_back(t):
    t = clamp(t)
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def mix(c1, c2, t):
    t = clamp(t)
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def bg_gradient(seed=0):
    """竖直渐变 + 一点点噪点，避免大面积纯色显得廉价。"""
    img = Image.new("RGB", (W, H), BG0)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=mix(BG0, BG1, t * 1.4))
    rnd = random.Random(seed)
    px = img.load()
    for _ in range(9000):
        x = rnd.randrange(W)
        y = rnd.randrange(H)
        r, g, b = px[x, y]
        k = rnd.randint(-5, 6)
        px[x, y] = (max(0, min(255, r + k)), max(0, min(255, g + k)), max(0, min(255, b + k)))
    return img


def glow(img, radius=40, strength=0.55):
    """加一层柔光，让画面不那么"平"。"""
    blur = img.filter(ImageFilter.GaussianBlur(radius))
    return Image.blend(img, blur, strength)


def text(d, xy, s, f, fill=INK, anchor="la", spacing=0):
    d.text(xy, s, font=f, fill=fill, anchor=anchor, spacing=spacing)


def wrap_center(d, cy, lines, f, fill=INK, lh=None, alpha=1.0, x=None):
    """按行居中绘制（alpha 通过颜色混合模拟，背景是深色所以直接调亮度）。"""
    lh = lh or int(f.size * 1.5)
    total = lh * len(lines)
    y = cy - total // 2
    col = mix(BG0, fill, alpha) if alpha < 1 else fill
    cx = x if x is not None else W // 2
    for i, ln in enumerate(lines):
        d.text((cx, y + i * lh + lh // 2), ln, font=f, fill=col, anchor="mm")
    return y + total


def rounded(d, box, r, fill=None, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def chip(d, xy, s, f, fg, bg, pad_x=14, pad_y=7, r=999):
    x, y = xy
    bb = d.textbbox((0, 0), s, font=f)
    w = bb[2] - bb[0] + pad_x * 2
    h = bb[3] - bb[1] + pad_y * 2
    rounded(d, (x, y, x + w, y + h), min(r, h // 2), fill=bg)
    d.text((x + w // 2, y + h // 2), s, font=f, fill=fg, anchor="mm")
    return w, h


# ══════════════════════════════════════════════════════════════════════
# 分镜
# ══════════════════════════════════════════════════════════════════════

SCENES = []


def scene(name, dur):
    def deco(fn):
        SCENES.append({"name": name, "dur": dur, "draw": fn})
        return fn

    return deco


# ── 1. 钩子：你的硬盘里住着僵尸 ────────────────────────────────────────
@scene("开场", 26.0)
def scene_hook(d, t, T):
    p = t / T

    # 一堆会话文件夹在背景里漂浮
    rnd = random.Random(7)
    items = []
    for i in range(46):
        items.append(
            (
                rnd.uniform(-200, W + 200),
                rnd.uniform(-100, H + 100),
                rnd.uniform(0.6, 1.7),
                rnd.uniform(0, math.tau),
                rnd.randint(0, 4),
            )
        )
    for x, y, speed, phase, kind in items:
        drift = (t * 9 * speed) % (H + 400)
        yy = (y + drift) % (H + 400) - 200
        xx = x + math.sin(t * 0.6 + phase) * 16
        alpha = 0.05 + 0.09 * speed
        col = mix(BG1, INK, alpha)
        s = int(16 * speed)
        if kind == 0:
            d.rectangle((xx, yy, xx + s, yy + s * 0.72), outline=col, width=1)
        elif kind == 1:
            d.ellipse((xx, yy, xx + s * 0.6, yy + s * 0.6), outline=col, width=1)
        else:
            d.line((xx, yy, xx + s, yy), fill=col, width=1)

    # 主标题：分三段淡入
    f_big = font(F_BOLD, 96)
    f_sub = font(F_REG, 40)
    f_tiny = font(F_REG, 26)

    a1 = ease_out(clamp((p - 0.02) / 0.16))
    a2 = ease_out(clamp((p - 0.16) / 0.16))
    a3 = ease_out(clamp((p - 0.34) / 0.18))

    if a1 > 0:
        cy = 380
        col = mix(BG0, INK, a1)
        d.text((W // 2, cy), "你的 sessions/ 里", font=f_big, fill=col, anchor="mm")
    if a2 > 0:
        cy = 500
        col = mix(BG0, DANGER, a2)
        d.text((W // 2, cy), "住着一窝僵尸", font=f_big, fill=col, anchor="mm")
    if a3 > 0:
        lines = ["它们从侧边栏消失了，但日志永远不会走", "一天天攒，几十个、上百个目录，每个都还在偷偷占地方"]
        y = 640
        for i, ln in enumerate(lines):
            col = mix(BG0, INK_DIM, a3)
            d.text((W // 2, y + i * 54), ln, font=f_sub, fill=col, anchor="mm")

    # 右下角一个数字：扫描到的目录数往上滚
    if p > 0.45:
        n = int(ease_out(clamp((p - 0.45) / 0.5)) * 87)
        a = ease_out(clamp((p - 0.45) / 0.2))
        d.text((W - 90, H - 150), f"{n}", font=font(F_BOLD, 88), fill=mix(BG0, WARN, a), anchor="rs")
        d.text((W - 90, H - 100), "个目录 · 从没再打开过", font=f_tiny, fill=mix(BG0, INK_DIM, a), anchor="rs")


# ── 2. 痛点：官方只有"归档"，没有"删除" ───────────────────────────────
@scene("痛点", 34.0)
def scene_pain(d, t, T):
    p = t / T
    f_h = font(F_BOLD, 64)
    f_b = font(F_REG, 34)
    f_m = font(F_MONO, 28)
    f_small = font(F_REG, 24)

    # 左边：真实菜单截图（用绘制还原）
    a = ease_out(clamp(p / 0.06))
    if a > 0:
        panel_x, panel_y = 180, 300
        pw, ph = 420, 420
        alpha_col = mix(BG0, INK, a)
        rounded(d, (panel_x, panel_y, panel_x + pw, panel_y + ph), 14, fill=mix(BG0, BG1, a), outline=mix(BG0, (60, 70, 90), a), width=2)

        rows = ["置顶会话", "重命名", "分叉会话", "归档会话", "复制 Session ID"]
        fy = panel_y + 34
        for i, r in enumerate(rows):
            # 段首就有基础可见度，逐行快速补齐（避免进入本段前两秒是空面板）
            row_a = a * (0.6 + 0.4 * ease_out(clamp((p * 3 - i * 0.35) / 0.5)))
            if row_a <= 0:
                continue
            col = mix(BG0, INK, row_a * a)
            # 用归档那一行做高亮
            if i == 3:
                rounded(d, (panel_x + 12, fy - 8, panel_x + pw - 12, fy + 40), 8,
                        fill=mix(BG0, (40, 32, 20), row_a * a))
                col = mix(BG0, WARN, row_a * a)
            d.text((panel_x + 34, fy + 16), r, font=f_b, fill=col, anchor="lm")
            fy += 62

        # 底部一行小字：没有"删除"
        if p > 0.18:
            a2 = ease_out(clamp((p - 0.18) / 0.10))
            d.text((panel_x + pw // 2, panel_y + ph + 46), "↑ 只有「归档」，没有「删除」",
                   font=f_small, fill=mix(BG0, DANGER, a2 * a), anchor="mm")

    # 右边：文案逐条出现
    a1 = 0.55 + 0.45 * ease_out(clamp(p / 0.06))
    d.text((760, 330), "归档 ≠ 删除", font=f_h, fill=mix(BG0, DANGER, a1), anchor="lm")

    if p > 0.02:
        a1 = 0.55 + 0.45 * ease_out(clamp((p - 0.02) / 0.08))
        body = [
            "「归档」只做一件事：把会话从侧边栏藏起来。",
            "文件原地不动，永远留在 $DSH_HOME/sessions/ 里。",
            "",
            "你想删一个再也不会用的会话 ——",
            "只能先归档它，然后……什么也做不了。",
        ]
        y = 420
        for ln in body:
            d.text((760, y), ln, font=f_b, fill=mix(BG0, INK_DIM, a1), anchor="lm")
            y += 58

    # 三个"卡住"的图标
    if p > 0.58:
        a3 = ease_out(clamp((p - 0.58) / 0.15))
        labels = [("想删", "没入口"), ("想清", "没有批量"), ("想找", "不知道占了多少")]
        bx = 760
        for i, (k, v) in enumerate(labels):
            ai = ease_out(clamp((p - 0.58 - i * 0.05) / 0.12)) * a3
            x0 = bx + i * 250
            rounded(d, (x0, 720, x0 + 224, 860), 14, fill=mix(BG0, BG1, ai), outline=mix(BG0, (70, 60, 60), ai), width=2)
            d.text((x0 + 112, 764), k, font=font(F_BOLD, 36), fill=mix(BG0, INK, ai), anchor="mm")
            d.text((x0 + 112, 814), v, font=f_small, fill=mix(BG0, DANGER, ai), anchor="mm")

    if p > 0.78:
        a4 = ease_out(clamp((p - 0.78) / 0.14))
        d.text((W // 2, 950), "这个插件，补上缺失的那一半。", font=font(F_BOLD, 44),
               fill=mix(BG0, ACCENT, a4), anchor="mm")


# ── 3. 功能：三大能力 ─────────────────────────────────────────────────
@scene("功能", 44.0)
def scene_features(d, t, T):
    p = t / T
    f_h = font(F_BOLD, 58)
    f_b = font(F_REG, 32)
    f_s = font(F_REG, 24)
    f_mono = font(F_MONO, 24)

    # 顶部标题（整段常驻，不参与小节切换）
    d.text((W // 2, 130), "三件事，做干净", font=f_h, fill=INK, anchor="mm")

    # 三段各自的进度
    seg = min(2, int(p / 0.34))
    seg_t = (p - seg * 0.34) / 0.34
    # 段首不从 0 淡入：给一个较高的基础可见度再推到 1，
    # 这样切进新小节的第一帧就已经有内容，不会出现空白帧。
    enter = 0.55 + 0.45 * ease_out(clamp(seg_t / 0.10))
    # 小节末尾淡出，配合下一小节的进入
    leave = 1.0 - ease_in_out(clamp((seg_t - 0.94) / 0.06))
    vis = enter * leave

    if seg == 0:
        # ① 行内删除 — 画一个会话行，鼠标靠近，按钮浮现
        row_y = 400
        row_x, row_w = 320, 1280
        # 行本身也在段首就淡入
        row_a = vis
        rounded(d, (row_x, row_y, row_x + row_w, row_y + 132), 14,
                fill=mix(BG0, BG1, row_a), outline=mix(BG0, (56, 66, 84), row_a), width=2)

        d.text((row_x + 40, row_y + 44), "重构认证模块", font=f_b, fill=mix(BG0, INK, row_a), anchor="lm")
        d.text((row_x + 40, row_y + 92), "session-9c61f319 · 已经 3 天没打开", font=f_s,
               fill=mix(BG0, INK_DIM, row_a), anchor="lm")

        # 行尾三个按钮：归档(100) / 删除(150) / 置顶(200)，用矢量图形绘制
        btn_x = row_x + row_w - 200
        for i, kind in enumerate(["archive", "trash", "pin"]):
            bx = btn_x + i * 60
            hot = kind == "trash"
            appear = ease_out_back(clamp((seg_t - 0.05 - i * 0.035) / 0.14))
            if appear <= 0:
                continue
            r = 20
            cx, cy = bx + r, row_y + 66
            cur_r = r * appear
            d.ellipse((cx - cur_r, cy - cur_r, cx + cur_r, cy + cur_r),
                      fill=mix(BG1, (62, 26, 30) if hot else (36, 44, 58), appear))
            fg = mix(BG1, DANGER if hot else INK_DIM, appear)
            s = 9 * appear
            wdt = max(1, int(2 * appear))
            if kind == "archive":
                # 下箭头 + 底部托盘
                d.line((cx, cy - s, cx, cy + s * 0.4), fill=fg, width=wdt)
                d.line((cx - s * 0.55, cy - s * 0.15, cx, cy + s * 0.45), fill=fg, width=wdt)
                d.line((cx + s * 0.55, cy - s * 0.15, cx, cy + s * 0.45), fill=fg, width=wdt)
                d.line((cx - s * 0.8, cy + s * 0.85, cx + s * 0.8, cy + s * 0.85), fill=fg, width=wdt)
            elif kind == "trash":
                # 垃圾桶：盖 + 桶身 + 两条竖线
                d.line((cx - s * 0.85, cy - s * 0.55, cx + s * 0.85, cy - s * 0.55), fill=fg, width=wdt)
                d.line((cx - s * 0.3, cy - s * 0.85, cx + s * 0.3, cy - s * 0.85), fill=fg, width=wdt)
                d.line((cx - s * 0.65, cy - s * 0.55, cx - s * 0.5, cy + s * 0.85), fill=fg, width=wdt)
                d.line((cx + s * 0.65, cy - s * 0.55, cx + s * 0.5, cy + s * 0.85), fill=fg, width=wdt)
                d.line((cx - s * 0.5, cy + s * 0.85, cx + s * 0.5, cy + s * 0.85), fill=fg, width=wdt)
            else:
                # 图钉
                d.line((cx, cy - s * 0.9, cx, cy + s * 0.9), fill=fg, width=wdt)
                d.line((cx - s * 0.6, cy - s * 0.35, cx + s * 0.6, cy - s * 0.35), fill=fg, width=wdt)

        # 高亮框 + 标注
        if seg_t > 0.3:
            a = ease_out(clamp((seg_t - 0.3) / 0.15))
            hx = btn_x + 60 - 28
            rounded(d, (hx, row_y + 36, hx + 60, row_y + 96), 12, outline=mix(BG1, DANGER, a), width=3)
            d.text((row_x + row_w // 2, row_y + 210), "鼠标划到任意会话行尾 → 点垃圾桶", font=f_b,
                   fill=mix(BG1, ACCENT, a), anchor="mm")

        if seg_t > 0.5:
            a = ease_out(clamp((seg_t - 0.5) / 0.14))
            d.text((row_x + row_w // 2, row_y + 288), "不用先归档。二次确认就一下。", font=f_s,
                   fill=mix(BG1, INK_DIM, a), anchor="mm")

    elif seg == 1:
        # ② 批量 — 一堆会话行，逐个浮现后被"吸"进回收站
        top = 250
        n = 7
        # 段首就铺一层基础可见度，避免切进来瞬间空白
        base = vis
        for i in range(n):
            # 逐行淡入：第一行从第一帧就可见（乘以 vis 打底）
            ia = vis * (0.7 + 0.3 * ease_out(clamp((seg_t - i * 0.03) / 0.09)))
            if ia <= 0:
                continue
            alpha = ia
            # 后半段整体向左滑出（表示被移走）
            out = ease_in_out(clamp((seg_t - 0.58 - i * 0.035) / 0.16))
            slide = -out * 380
            alpha *= 1 - out
            if alpha <= 0.02:
                continue
            ry = top + i * 82
            rx, rw = 420 + slide, 1080
            rounded(d, (rx, ry, rx + rw, ry + 62), 10,
                    fill=mix(BG0, BG1, alpha), outline=mix(BG0, (56, 66, 84), alpha), width=2)
            d.text((rx + 28, ry + 31), f"会话 {i + 1} · 2026-09-{(i % 28) + 1:02d} 起就没再打开",
                   font=f_s, fill=mix(BG0, INK_DIM, alpha), anchor="lm")

        if seg_t > 0.46:
            a = ease_out(clamp((seg_t - 0.46) / 0.14))
            rounded(d, (W // 2 - 260, 880, W // 2 + 260, 960), 14,
                    fill=mix(BG0, (60, 24, 28), a), outline=mix(BG0, DANGER, a), width=2)
            d.text((W // 2, 920), "全部移入回收站 (7)", font=f_b, fill=mix(BG0, INK, a), anchor="mm")

        if seg_t > 0.78:
            a = ease_out(clamp((seg_t - 0.78) / 0.14))
            d.text((W // 2, 1012), "一键，不用一个个勾", font=f_s, fill=mix(BG0, ACCENT, a), anchor="mm")

    else:
        # ③ 回收站 — 抽屉打开，条目可还原
        a0 = vis
        box_x, box_y, box_w = 360, 250, 1200
        rounded(d, (box_x, box_y, box_x + box_w, box_y + 560), 18,
                fill=mix(BG0, BG1, a0), outline=mix(BG0, (56, 66, 84), a0), width=2)

        # 两个 tab
        t1 = "已归档 (0)"
        t2 = "回收站 (7)"
        d.text((box_x + 40, box_y + 46), t1, font=f_b, fill=mix(BG0, INK_DIM, a0), anchor="lm")
        d.text((box_x + 260, box_y + 46), t2, font=f_b, fill=mix(BG0, ACCENT, a0), anchor="lm")
        d.line((box_x + 250, box_y + 74, box_x + 420, box_y + 74), fill=mix(BG0, ACCENT, a0), width=3)

        rows = 4
        for i in range(rows):
            # 用 vis 打底：切进本节第一帧就有 55% 可见度，不会空白
            ia = vis * (0.8 + 0.2 * ease_out(clamp((seg_t - i * 0.035) / 0.10)))
            if ia <= 0:
                continue
            ry = box_y + 110 + i * 88
            rounded(d, (box_x + 24, ry, box_x + box_w - 24, ry + 70), 8,
                    fill=mix(BG0, (26, 33, 46), ia))
            d.ellipse((box_x + 44, ry + 28, box_x + 58, ry + 42), outline=mix(BG0, INK_DIM, ia), fill=mix(BG0, (40, 48, 62), ia))
            d.text((box_x + 76, ry + 24), f"会话 {i + 1} · 已删除 ", font=f_s, fill=mix(BG0, INK, ia), anchor="lm")
            # 还原按钮
            if seg_t > 0.4 + i * 0.035:
                ba = ease_out(clamp((seg_t - 0.4 - i * 0.035) / 0.11))
                rounded(d, (box_x + box_w - 200, ry + 18, box_x + box_w - 60, ry + 54), 8,
                        outline=mix(BG0, OK, ba), width=2)
                d.text((box_x + box_w - 130, ry + 36), "还原", font=f_s, fill=mix(BG0, OK, ba), anchor="mm")

        if seg_t > 0.6:
            a = ease_out(clamp((seg_t - 0.6) / 0.14))
            d.text((W // 2, 880), "删错了？勾一下放回原位。目标被占了会明确拒绝，不静默覆盖。",
                   font=f_b, fill=mix(BG0, INK, a), anchor="mm")

    # 底部三个圆点指示器
    for i in range(3):
        on = i == seg
        cx = W // 2 - 60 + i * 60
        r = 7 if on else 5
        d.ellipse((cx - r, 1012 - r, cx + r, 1012 + r),
                  fill=ACCENT if on else (60, 70, 88))


# ── 4. 技术细节：为什么它不会把你的东西弄坏 ──────────────────────────
@scene("安全", 38.0)
def scene_safety(d, t, T):
    p = t / T
    f_h = font(F_BOLD, 56)
    f_b = font(F_REG, 30)
    f_s = font(F_REG, 23)
    f_mono = font(F_MONO, 23)

    d.text((W // 2, 120), "它不做什么", font=f_h, fill=INK, anchor="mm")

    cards = [
        ("不碰工作目录", ["只移动会话日志目录", "项目文件一根头发都不动"], OK),
        ("不硬编码目录结构", ["按 sessionId 反查位置", "后端改了编码也不会坏"], ACCENT),
        ("不删运行中的会话", ["正在跑的直接拒绝", "含你此刻打开的这个"], WARN),
        ("不静默覆盖", ["还原时目标被占用", "明确报错，绝不悄悄盖掉"], DANGER),
    ]

    for i, (title, body, col) in enumerate(cards):
        ia = ease_out(clamp((p - 0.02 - i * 0.07) / 0.13))
        if ia <= 0:
            continue
        cx = W // 2 - 720 + (i % 2) * 740
        cy = 260 + (i // 2) * 300
        cw, ch = 700, 250
        lift = int((1 - ia) * 24)
        rounded(d, (cx, cy + lift, cx + cw, cy + ch + lift), 16,
                fill=mix(BG0, BG1, ia), outline=mix(BG0, col, ia * 0.55), width=2)
        # 左边一条竖色带
        d.rectangle((cx, cy + lift + 20, cx + 5, cy + ch + lift - 20), fill=mix(BG0, col, ia))
        d.text((cx + 40, cy + lift + 56), title, font=font(F_BOLD, 38), fill=mix(BG0, INK, ia), anchor="lm")
        yy = cy + lift + 118
        for ln in body:
            d.text((cx + 40, yy), ln, font=f_b, fill=mix(BG0, INK_DIM, ia), anchor="lm")
            yy += 46

    if p > 0.58:
        a = ease_out(clamp((p - 0.58) / 0.18))
        # 代码块样式
        bx, by, bw, bh = W // 2 - 640, 880, 1280, 130
        rounded(d, (bx, by, bx + bw, by + bh), 12, fill=mix(BG0, (8, 12, 18), a), outline=mix(BG0, (48, 58, 74), a), width=1)
        d.text((bx + 28, by + 34), "$DSH_HOME/", font=f_mono, fill=mix(BG0, INK_DIM, a), anchor="lm")
        d.text((bx + 200, by + 34), "sessions/", font=f_mono, fill=mix(BG0, ACCENT, a), anchor="lm")
        d.text((bx + 340, by + 34), "<cwd>/<sessionId>/session.v4.jsonl.zstd", font=f_mono,
               fill=mix(BG0, INK_DIM, a), anchor="lm")
        d.text((bx + 28, by + 86), "$DSH_HOME/", font=f_mono, fill=mix(BG0, INK_DIM, a), anchor="lm")
        d.text((bx + 200, by + 86), ".trash/sessions/", font=f_mono, fill=mix(BG0, WARN, a), anchor="lm")
        d.text((bx + 430, by + 86), "<时间戳>-<sessionId>/  ← 可还原", font=f_mono,
               fill=mix(BG0, INK_DIM, a), anchor="lm")


# ── 5. 结尾：装它 ─────────────────────────────────────────────────────
@scene("上手", 38.0)
def scene_outro(d, t, T):
    p = t / T
    f_h = font(F_BOLD, 72)
    f_b = font(F_REG, 34)
    f_s = font(F_REG, 24)
    f_mono = font(F_MONO, 27)

    # 大标题
    a0 = ease_out(clamp(p / 0.08))
    d.text((W // 2, 200), "补上 DSH 缺的那一半", font=f_h,
           fill=mix(BG0, INK, a0), anchor="mm")
    a1 = ease_out(clamp((p - 0.03) / 0.07))
    d.text((W // 2, 300), "dsh-archive-trash", font=font(F_BOLD, 52),
           fill=mix(BG0, ACCENT, a1), anchor="mm")

    # 安装命令，逐字打出
    if p > 0.16:
        a = ease_out(clamp((p - 0.16) / 0.1))
        bx, by, bw, bh = W // 2 - 700, 400, 1400, 116
        rounded(d, (bx, by, bx + bw, by + bh), 14, fill=mix(BG0, (8, 12, 18), a),
                outline=mix(BG0, (52, 62, 80), a), width=2)

        cmd = "dsh plugin --profile web add dsh-archive-trash@0.3.0"
        typed = int(clamp((p - 0.22) / 0.22) * len(cmd))
        shown = cmd[:typed]
        d.text((bx + 34, by + bh // 2), "$ " + shown, font=f_mono,
               fill=mix(BG0, INK, a), anchor="lm")
        # 光标
        if int(t * 2.4) % 2 == 0:
            bb = d.textbbox((0, 0), "$ " + shown, font=f_mono)
            cw = bb[2] - bb[0]
            cx0 = bx + 34 + cw + 4
            d.rectangle((cx0, by + 32, cx0 + 15, by + bh - 32), fill=mix(BG0, ACCENT, a))

    # 三条要点
    if p > 0.48:
        items = [
            ("npm 一条命令", "不需要构建授权"),
            ("中英双语", "跟着界面语言走"),
            ("主题一致", "跟皮肤不打架"),
        ]
        for i, (k, v) in enumerate(items):
            ia = ease_out(clamp((p - 0.48 - i * 0.07) / 0.14))
            if ia <= 0:
                continue
            cx = W // 2 - 660 + i * 460
            rounded(d, (cx, 590, cx + 400, 700), 14, fill=mix(BG0, BG1, ia),
                    outline=mix(BG0, (56, 66, 84), ia), width=1)
            d.text((cx + 200, 632), k, font=font(F_BOLD, 32), fill=mix(BG0, INK, ia), anchor="mm")
            d.text((cx + 200, 676), v, font=f_s, fill=mix(BG0, INK_DIM, ia), anchor="mm")

    # 结尾标语
    if p > 0.72:
        a = ease_out(clamp((p - 0.72) / 0.16))
        d.text((W // 2, 820), "删得掉，而且删错了能捡回来。", font=font(F_BOLD, 50),
               fill=mix(BG0, OK, a), anchor="mm")

    if p > 0.84:
        a = ease_out(clamp((p - 0.84) / 0.12))
        d.text((W // 2, 910), "github.com/hongdougao111/dsh-archive-trash", font=f_b,
               fill=mix(BG0, INK_DIM, a), anchor="mm")
        d.text((W // 2, 960), "npm · dsh-archive-trash", font=f_s,
               fill=mix(BG0, INK_DIM, a * 0.8), anchor="mm")


# ══════════════════════════════════════════════════════════════════════
# 合成
# ══════════════════════════════════════════════════════════════════════


def overlay_chrome(d, t_total, total_dur, idx):
    """底部全局进度条 + 段落名。"""
    p = t_total / total_dur
    bar_y = H - 46
    d.line((120, bar_y, W - 120, bar_y), fill=(40, 46, 58), width=3)
    d.line((120, bar_y, 120 + int((W - 240) * p), bar_y), fill=ACCENT, width=3)

    f = font(F_REG, 20)
    d.text((120, H - 72), "dsh-archive-trash", font=f, fill=(96, 106, 124), anchor="ls")
    d.text((W - 120, H - 72), SCENES[idx]["name"], font=f, fill=(96, 106, 124), anchor="rs")


def main():
    total_dur = sum(s["dur"] for s in SCENES)
    total_frames = int(total_dur * FPS)
    print(f"总时长 {total_dur:.1f}s · {total_frames} 帧 · {W}x{H}@{FPS}")

    out_path = os.path.join(OUT_DIR, "dsh-archive-trash-promo.mp4")
    ffmpeg = __import__("imageio_ffmpeg").get_ffmpeg_exe()

    cmd = [
        ffmpeg, "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{W}x{H}", "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "-",
        "-an",
        "-vcodec", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 预渲染背景，逐段复用
    bgs = {i: bg_gradient(seed=i * 17 + 3) for i in range(len(SCENES))}

    acc = 0.0
    idx = 0
    seg_start = 0.0

    try:
        for frame in range(total_frames):
            t_total = frame / FPS
            while idx < len(SCENES) - 1 and t_total >= seg_start + SCENES[idx]["dur"]:
                seg_start += SCENES[idx]["dur"]
                idx += 1

            sc = SCENES[idx]
            local = t_total - seg_start
            img = bgs[idx].copy()
            d = ImageDraw.Draw(img)
            sc["draw"](d, local, sc["dur"])
            overlay_chrome(d, t_total, total_dur, idx)

            # 段落交界处做 0.45s 的交叉淡化，避免硬切到空白帧
            FADE = 0.45
            if idx + 1 < len(SCENES) and local > sc["dur"] - FADE:
                nxt = SCENES[idx + 1]
                nimg = bgs[idx + 1].copy()
                nd = ImageDraw.Draw(nimg)
                nxt["draw"](nd, local - (sc["dur"] - FADE), nxt["dur"])
                overlay_chrome(nd, t_total, total_dur, idx + 1)
                k = (local - (sc["dur"] - FADE)) / FADE
                img = Image.blend(img, nimg, clamp(k))

            proc.stdin.write(img.tobytes())

            if frame % (FPS * 5) == 0:
                print(f"  {t_total:5.1f}s / {total_dur:.0f}s  ({frame}/{total_frames})", flush=True)
    finally:
        proc.stdin.close()
        proc.wait()

    print("完成:", out_path, os.path.getsize(out_path), "bytes")


if __name__ == "__main__":
    main()
