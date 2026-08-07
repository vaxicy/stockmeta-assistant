#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate Chrome Web Store screenshots (zh/en) and bilingual promo images.

Outputs:
  store-assets/screenshots/zh/*.png   (1280x800)
  store-assets/screenshots/en/*.png
  store-assets/promo/440x280.png      (bilingual)
  store-assets/promo/1400x560.png     (bilingual)
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "store-assets")

F_REG = r"C:\Windows\Fonts\msyh.ttc"
F_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"

# ---- palette -------------------------------------------------------------
BLUE = (26, 115, 232)
BLUE_D = (22, 102, 201)
INK = (31, 36, 48)
SUB = (107, 114, 128)
BORDER = (203, 213, 225)
BG = (245, 247, 250)
WHITE = (255, 255, 255)
GREEN = (19, 115, 51)
RED = (217, 48, 37)
CHROME = (232, 234, 237)
PANEL_BG = (241, 243, 245)
SOFT = (248, 250, 252)

# ---- fonts ---------------------------------------------------------------
def font(size, bold=False):
    return ImageFont.truetype(F_BOLD if bold else F_REG, size)

# ---- drawing helpers -----------------------------------------------------
def rr(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def text_size(draw, text, f):
    b = draw.textbbox((0, 0), text, font=f)
    return b[2] - b[0], b[3] - b[1]

def wrap(draw, text, f, max_w):
    """Wrap text into lines that fit max_w, keeping Latin words intact.
    CJK characters are treated as individual tokens (no spaces)."""
    import re
    tokens = re.findall(r"[\u4e00-\u9fff]|[\u3000-\u303f\uff00-\uffef]|\S+|\s+", text)
    lines, cur = [], ""
    for tok in tokens:
        if tok == "\n":
            lines.append(cur.rstrip())
            cur = ""
            continue
        if tok.isspace():
            test = cur + tok
            if text_size(draw, test, f)[0] > max_w and cur:
                lines.append(cur.rstrip())
                cur = tok
            else:
                cur = test
            continue
        test = cur + tok if cur else tok
        if text_size(draw, test, f)[0] > max_w and cur:
            lines.append(cur.rstrip())
            # if a single token is too wide, break it by characters
            if text_size(draw, tok, f)[0] > max_w:
                sublines, sub = [], ""
                for ch in tok:
                    st = sub + ch
                    if text_size(draw, st, f)[0] > max_w and sub:
                        sublines.append(sub)
                        sub = ch
                    else:
                        sub = st
                if sub:
                    sublines.append(sub)
                lines.extend(sublines[:-1])
                cur = sublines[-1]
            else:
                cur = tok
        else:
            cur = test
    if cur.strip():
        lines.append(cur.rstrip())
    return lines


def draw_text(draw, pos, text, f, color, anchor="la"):
    draw.text(pos, text, font=f, fill=color, anchor=anchor)

def center_text(draw, box, text, f, color):
    """Vertically + horizontally center a single line of text in box."""
    w, h = text_size(draw, text, f)
    x = box[0] + (box[2] - box[0] - w) / 2
    y = box[1] + (box[3] - box[1] - h) / 2
    draw.text((x, y), text, font=f, fill=color, anchor="la")

def center_wrapped(draw, box, text, f, color, line_h=None, anchor_top=False):
    lines = wrap(draw, text, f, box[2] - box[0])
    line_h = line_h or (text_size(draw, "Ag", f)[1] + 4)
    total = line_h * len(lines)
    y0 = box[1] if anchor_top else box[1] + (box[3] - box[1] - total) / 2
    for i, ln in enumerate(lines):
        w = text_size(draw, ln, f)[0]
        x = box[0] + (box[2] - box[0] - w) / 2
        draw.text((x, y0 + i * line_h), ln, font=f, fill=color, anchor="la")

def draw_button(draw, box, text, f, fill, text_color, r=8):
    rr(draw, box, r, fill=fill)
    center_text(draw, box, text, f, text_color)

def draw_toggle_row(draw, x, y, w, title, desc, on=True):
    """Draw a settings row with a label + description on the left and a toggle on the right."""
    draw.text((x, y), title, font=font(14, True), fill=INK, anchor="la")
    draw.text((x, y + 24), desc, font=font(12), fill=SUB, anchor="la")
    tw, th = 44, 24
    tx, ty = x + w - tw, y + 6
    if on:
        rr(draw, (tx, ty, tx + tw, ty + th), th // 2, fill=BLUE)
        # knob
        draw.ellipse((tx + tw - th + 2, ty + 2, tx + tw - 2, ty + th - 2), fill=WHITE)
    else:
        rr(draw, (tx, ty, tx + tw, ty + th), th // 2, fill=(214, 218, 224))
        draw.ellipse((tx + 2, ty + 2, tx + th - 2, ty + th - 2), fill=WHITE)


def draw_gear(draw, cx, cy, r, color):
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=2)
    for a in range(0, 360, 60):
        import math
        rad = math.radians(a)
        x1 = cx + (r - 1) * math.cos(rad)
        y1 = cy + (r - 1) * math.sin(rad)
        x2 = cx + (r + 3) * math.cos(rad)
        y2 = cy + (r + 3) * math.sin(rad)
        draw.line((x1, y1, x2, y2), fill=color, width=2)

def draw_check(draw, cx, cy, size, color):
    """Draw a simple check mark centered at (cx, cy) with given size."""
    pts = [
        (cx - size * 0.4, cy - size * 0.1),
        (cx - size * 0.05, cy + size * 0.35),
        (cx + size * 0.45, cy - size * 0.4),
    ]
    draw.line((pts[0], pts[1]), fill=color, width=2)
    draw.line((pts[1], pts[2]), fill=color, width=2)

def draw_refresh(draw, cx, cy, r, color):
    """Draw a circular refresh (↻) glyph centered at (cx, cy)."""
    draw.arc((cx - r, cy - r, cx + r, cy + r), start=40, end=320, fill=color, width=2)
    # arrow head
    import math
    a = math.radians(320)
    hx = cx + r * math.cos(a)
    hy = cy + r * math.sin(a)
    draw.line((hx - 4, hy - 2, hx, hy), fill=color, width=2)
    draw.line((hx, hy, hx + 2, hy - 4), fill=color, width=2)

def draw_upload(draw, cx, cy, r, color):
    """Draw an upload (arrow into tray) glyph centered at (cx, cy)."""
    # arrow shaft
    draw.line((cx, cy - r, cx, cy + 1), fill=color, width=2)
    # arrow head
    draw.line((cx - 4, cy - 4, cx, cy + 1), fill=color, width=2)
    draw.line((cx + 4, cy - 4, cx, cy + 1), fill=color, width=2)
    # tray
    draw.line((cx - r, cy + 3, cx + r, cy + 3), fill=color, width=2)
    draw.line((cx - r, cy + 3, cx - r + 3, cy + 7), fill=color, width=2)
    draw.line((cx + r, cy + 3, cx + r - 3, cy + 7), fill=color, width=2)

def draw_step_badge(draw, x, y, text, f):
    """Draw a numbered tutorial badge at top-left (x, y)."""
    pad_x, pad_y = 12, 8
    w, h = text_size(draw, text, f)
    bw, bh = w + pad_x * 2, h + pad_y * 2
    rr(draw, (x, y, x + bw, y + bh), 20, fill=BLUE, outline=WHITE, width=2)
    draw.text((x + bw / 2, y + bh / 2), text, font=f, fill=WHITE, anchor="mm")
    return bw, bh



# ---- sample content ------------------------------------------------------
SAMPLE = {
    "en": {
        "panelTitle": "StockMeta Assistant",
        "statusIdle": "Ready. Please select an asset.",
        "statusDone": "Title & keywords ready.",
        "generate": "Generate Title & Keywords",
        "titleLabel": "Title",
        "keywordsLabel": "Keywords",
        "applyTitle": "Apply Title",
        "copyTitle": "Copy Title",
        "applyKeywords": "Apply Keywords",
        "copyKeywords": "Copy Keywords",
        "applyAll": "Apply All",
        "retry": "Retry",
        "kwCount": "30 keywords",
        "optTitle": "Settings",
        "lang": "Language",
        "langAuto": "Follow browser",
        "english": "English",
        "chinese": "简体中文",
        "apiKey": "API Key",
        "apiKeyDesc": "Stored locally in chrome.storage.local. Never hardcoded.",
        "model": "Vision Model ID",
        "modelDesc": "e.g. Qwen/Qwen3-Omni-30B-A3B-Captioner",
        "kwCountLabel": "Keyword Count",
        "kwCountDesc": "Number of keywords to request (1–50).",
        "autoCheckAI": "Auto-check AI declaration boxes",
        "autoCheckAIDesc": "Also tick the two AI declaration boxes on the Adobe Stock form.",
        "autoSave": "Auto-save after Apply",
        "autoSaveDesc": "Automatically click Save work after applying metadata.",
        "test": "Test Connection",
        "save": "Save",
        "saved": "Settings saved.",
        "tutorial": "How to get an API Key?",
        "support": "Support the author",
        "popupTitle": "StockMeta Assistant",
        "popupStatus": "Connection OK",
        "popupDesc": "Generate Adobe Stock titles and keywords from your current asset, then fill them in with one click.",
        "popupSettings": "Settings",
        "supportTitle": "Support the author",
        "supportWeChat": "Scan with WeChat to leave a tip",
        "supportPayPalDesc": "Prefer PayPal? Any amount helps.",
        "supportPayPalBtn": "Donate via PayPal",
        "supportSwitch": "Overseas? Use PayPal instead",
        "adobeTitle": "Adobe Stock",
        "addDetails": "Add details",
        "fTitle": "Title",
        "fKeywords": "Keywords",
        "step1": "1. Configure AI settings",
        "step2": "2. Open Adobe Stock and generate",
        "step3": "3. One-click apply to fill",
        "provider": "AI Provider",
        "providerSiliconFlow": "SiliconFlow",
        "providerOpenAI": "OpenAI",
        "providerCustom": "Custom",
        "baseUrl": "Base URL",
        "adobeNav": ["Dashboard", "Uploaded Files", "Insights", "Contributor Account"],
        "adobeTabs": ["New", "In review", "Reminder", "Not accepted", "Upload issues", "Releases"],
        "adobeBanner": "Do not submit generative AI content with titles that imply an actual depiction of newsworthy events.",
        "adobeFileTypes": "File types: All (42)",
        "adobeSort": "Upload date ▼",
        "adobeSaveWork": "Save work",
    },
    "zh": {
        "panelTitle": "StockMeta Assistant",
        "statusIdle": "就绪。请选择一个素材。",
        "statusDone": "标题和关键词已生成。",
        "generate": "生成标题和关键词",
        "titleLabel": "标题",
        "keywordsLabel": "关键词",
        "applyTitle": "应用标题",
        "copyTitle": "复制标题",
        "applyKeywords": "应用关键词",
        "copyKeywords": "复制关键词",
        "applyAll": "全部应用",
        "retry": "重试",
        "kwCount": "30 个关键词",
        "optTitle": "设置",
        "lang": "语言",
        "langAuto": "跟随浏览器",
        "english": "English",
        "chinese": "简体中文",
        "apiKey": "API Key",
        "apiKeyDesc": "保存在本地 chrome.storage.local，绝不硬编码。",
        "model": "视觉模型 ID",
        "modelDesc": "例如 Qwen/Qwen3-Omni-30B-A3B-Captioner",
        "kwCountLabel": "关键词数量",
        "kwCountDesc": "请求生成的关键词数量（1–50）。",
        "autoCheckAI": "自动勾选 AI 声明复选框",
        "autoCheckAIDesc": "同时勾选 Adobe Stock 表单上的两项 AI 声明。",
        "autoSave": "应用后自动保存",
        "autoSaveDesc": "应用元数据后自动点击保存工作。",
        "test": "测试连接",
        "save": "保存",
        "saved": "设置已保存。",
        "tutorial": "如何获取 API Key？",
        "support": "支持作者",
        "popupTitle": "StockMeta Assistant",
        "popupStatus": "连接成功",
        "popupDesc": "用视觉模型从当前素材生成 Adobe Stock 标题与关键词，一键填入。",
        "popupSettings": "设置",
        "supportTitle": "支持作者",
        "supportWeChat": "用微信扫码赞赏",
        "supportPayPalDesc": "海外用户？欢迎用 PayPal 支持",
        "supportPayPalBtn": "通过 PayPal 打赏",
        "supportSwitch": "海外用户？改用 PayPal",
        "adobeTitle": "Adobe Stock",
        "addDetails": "填写素材信息",
        "fTitle": "标题",
        "fKeywords": "关键词",
        "step1": "1. 配置 AI 设置",
        "step2": "2. 打开 Adobe Stock 点击生成",
        "step3": "3. 一键应用自动填充",
        "provider": "AI 提供商",
        "providerSiliconFlow": "SiliconFlow",
        "providerOpenAI": "OpenAI",
        "providerCustom": "自定义",
        "baseUrl": "Base URL",
        "adobeNav": ["面板", "已上传文件", "数据", "供稿人账户"],
        "adobeTabs": ["新建", "审核中", "提醒", "未接受", "上传问题", "发布"],
        "adobeBanner": "请勿提交标题暗示实际新闻事件描绘的生成式 AI 内容。",
        "adobeFileTypes": "文件类型：全部 (42)",
        "adobeSort": "上传时间 ▼",
        "adobeSaveWork": "保存工作",
    },
}

SAMPLE_TITLE = {
    "en": "Golden retriever puppy playing with a red ball on green grass in a sunny garden",
    "zh": "Golden retriever puppy playing with a red ball on green grass in a sunny garden",
}
SAMPLE_KW = {
    "en": [
        "dog", "puppy", "golden retriever", "pet", "animal", "play", "ball", "red",
        "garden", "grass", "sunny", "outdoor", "cute", "happy", "summer", "nature",
        "companion", "fun", "active", "lifestyle", "loyal", "fluffy", "smile",
        "childhood", "toy", "green", "spring", "warm", "portrait", "close-up",
    ],
    "zh": [
        "dog", "puppy", "golden retriever", "pet", "animal", "play", "ball", "red",
        "garden", "grass", "sunny", "outdoor", "cute", "happy", "summer", "nature",
        "companion", "fun", "active", "lifestyle", "loyal", "fluffy", "smile",
        "childhood", "toy", "green", "spring", "warm", "portrait", "close-up",
    ],
}

# ---- mock photo ----------------------------------------------------------
def make_photo(w, h, seed=0):
    img = Image.new("RGBA", (w, h), (174, 224, 255, 255))
    d = ImageDraw.Draw(img)
    # sky gradient
    for y in range(h):
        t = y / h
        r = int(174 + (233 - 174) * t)
        g = int(224 + (247 - 224) * t)
        b = int(255 + (255 - 255) * t)
        d.line((0, y, w, y), fill=(r, g, b))
    # sun
    d.ellipse((w - 70, 24, w - 30, 64), fill=(255, 214, 92, 255))
    # mountains
    d.polygon([(0, h * 0.7), (w * 0.35, h * 0.4), (w * 0.7, h * 0.7)], fill=(120, 160, 150, 255))
    d.polygon([(w * 0.4, h * 0.7), (w * 0.75, h * 0.35), (w, h * 0.7)], fill=(96, 138, 130, 255))
    # ground
    d.rectangle((0, int(h * 0.7), w, h), fill=(120, 180, 110, 255))
    return img

def make_box(w, h):
    """Draw a warehouse / cardboard-box placeholder photo."""
    img = Image.new("RGBA", (w, h), (228, 232, 236, 255))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, h), fill=(228, 232, 236, 255))
    bx, by = int(w * 0.26), int(h * 0.32)
    bw, bh = int(w * 0.48), int(h * 0.42)
    d.rectangle((bx, by, bx + bw, by + bh), fill=(201, 162, 111, 255),
                outline=(170, 130, 85, 255), width=2)
    # packing tape
    d.rectangle((bx, by + bh // 2 - 7, bx + bw, by + bh // 2 + 7), fill=(223, 193, 153, 255))
    # vertical flap line
    d.line((bx + bw // 2, by, bx + bw // 2, by + bh // 2 - 7), fill=(170, 130, 85, 255), width=2)
    return img

def paste(img, photo, box):
    p = photo.resize((box[2] - box[0], box[3] - box[1]))
    img.paste(p, (box[0], box[1]), p)

# ---- browser chrome ------------------------------------------------------
def draw_browser(draw, W, H, url):
    h = 56
    rr(draw, (0, 0, W, H), 0, fill=CHROME)
    draw.rectangle((0, h - 1, W, h), fill=(210, 213, 218))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        draw.ellipse((20 + i * 22, h / 2 - 6, 20 + i * 22 + 12, h / 2 + 6), fill=c)
    # address bar
    ax, aw = 110, W - 110 - 90
    rr(draw, (ax, 14, ax + aw, 42), 14, fill=WHITE, outline=(210, 213, 218), width=1)
    draw.text((ax + 16, 28), url, font=font(13), fill=(90, 96, 105), anchor="la")
    # extensions puzzle icon
    ex, ey = W - 70, 18
    rr(draw, (ex, ey, ex + 22, ey + 22), 5, fill=WHITE, outline=(180, 184, 190), width=1)
    draw.rectangle((ex + 7, ey + 7, ex + 15, ey + 15), fill=(120, 124, 130))

# =========================================================================
# SCREENSHOT 1 — Adobe Stock grid + panel (select asset)
# =========================================================================
def draw_adobe_grid(d, img, W, H, top, lang):
    """Draw a realistic Adobe Stock Uploaded Files grid background."""
    s = SAMPLE[lang]
    # top nav bar
    rr(d, (0, top, W, top + 50), 0, fill=WHITE)
    d.line((0, top + 50, W, top + 50), fill=(218, 220, 224), width=1)
    d.text((24, top + 25), s["adobeTitle"], font=font(16, True), fill=INK, anchor="lm")
    nav = s["adobeNav"]
    nx = 150
    active_nav = nav[1] if len(nav) > 1 else "Uploaded Files"
    for n in nav:
        color = BLUE if n == active_nav else INK
        d.text((nx, top + 25), n, font=font(12), fill=color, anchor="lm")
        nx += text_size(d, n, font(12))[0] + 28

    # tabs
    tab_y = top + 50 + 12
    tabs = s["adobeTabs"]
    tx = 24
    tab_active = tabs[0]
    for t in tabs:
        if t == tab_active:
            d.rectangle((tx, tab_y, tx + 80, tab_y + 32), fill=(240, 245, 255))
            d.text((tx + 40, tab_y + 16), t, font=font(12, True), fill=BLUE, anchor="mm")
        else:
            d.text((tx + 40, tab_y + 16), t, font=font(12), fill=SUB, anchor="mm")
        tx += 90

    # warning banner
    by = tab_y + 44
    d.rectangle((0, by, W, by + 38), fill=(255, 248, 225))
    d.text((W / 2, by + 19), s["adobeBanner"], font=font(11), fill=(150, 124, 0), anchor="mm")

    # filters / toolbar
    fy = by + 50
    d.text((24, fy + 10), s["adobeFileTypes"], font=font(12), fill=INK, anchor="lm")
    rr(d, (W - 220, fy, W - 24, fy + 32), 6, fill=WHITE, outline=BORDER, width=1)
    d.text((W - 122, fy + 16), s["adobeSort"], font=font(11), fill=INK, anchor="mm")

    # grid of assets
    gy = fy + 48
    cols = 5
    gap = 16
    margin = 24
    cw = int((W - margin * 2 - gap * (cols - 1)) / cols)
    rows = 2
    for r in range(rows):
        for c in range(cols):
            x = margin + c * (cw + gap)
            y = int(gy + r * (cw + gap))
            rr(d, (x, y, x + cw, y + cw), 8, fill=PANEL_BG, outline=BORDER, width=1)
            # placeholder image
            paste(img, make_photo(cw - 20, cw - 20), (x + 10, y + 10, x + cw - 10, y + cw - 10))
            # selected highlight for first item
            if r == 0 and c == 2:
                d.rectangle((x - 2, y - 2, x + cw + 2, y + cw + 2), outline=BLUE, width=3)

    # bottom text
    d.text((24, gy + rows * (cw + gap) + 14), s["adobeSaveWork"], font=font(12), fill=SUB, anchor="lm")

def shot_adobe(lang):
    W, H = 1280, 800
    img = Image.new("RGBA", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    draw_browser(d, W, H, "https://contributor.stock.adobe.com/en/files")
    top = 56
    draw_adobe_grid(d, img, W, H, top, lang)
    # floating panel on the right — real content panel (no icon, blue buttons)
    draw_panel(d, img, W - 320 - 24, top + 70, 320, lang, stage="generate",
               show_icon=False, preview_kind="photo", buttons="disabled")
    # step badge
    draw_step_badge(d, 24, top + 70, SAMPLE[lang]["step2"], font(13, True))
    return img


def draw_panel(d, img, x, y, w, lang, stage="apply", show_icon=False,
                preview_kind="photo", buttons="disabled"):
    """Draw the extension side panel.
    stage: 'generate' highlights the generate button and leaves fields empty;
           'apply' shows filled content and highlights the Apply All button.
    show_icon: draw the extension icon in the header.
    preview_kind: 'photo' (landscape) or 'box' (warehouse placeholder).
    buttons: 'disabled' (greyed) or 'enabled' (blue, clickable).
    """
    s = SAMPLE[lang]
    header_h = 44
    pad = 12
    cw = w - 2 * pad
    cx = x + pad
    # body bg
    rr(d, (x, y, x + w, y + 700), 12, fill=WHITE, outline=BORDER, width=1)
    # header (top rounded, bottom square)
    rr(d, (x, y, x + w, y + header_h + 14), 12, fill=BLUE)
    d.rectangle((x, y + header_h - 14, x + w, y + header_h + 14), fill=BLUE)
    # icon (optional)
    if show_icon:
        icon = Image.open(os.path.join(ROOT, "icons", "icon48.png")).convert("RGBA").resize((22, 22))
        img.paste(icon, (x + 12, y + 11), icon)
        title_x = x + 42
    else:
        title_x = x + 12
    draw_text(d, (title_x, y + header_h / 2), s["panelTitle"], font(14, True), WHITE, anchor="lm")
    # header buttons
    bx = x + w - 36
    rr(d, (bx, y + 7, bx + 28, y + 35), 6, fill=(255, 255, 255, 38))
    draw_gear(d, bx + 14, y + 21, 7, WHITE)
    bx2 = x + w - 72
    rr(d, (bx2, y + 7, bx2 + 28, y + 35), 6, fill=(255, 255, 255, 38))
    # collapse button (minus sign, centered) — matches real content panel
    d.line((bx2 + 11, y + 21, bx2 + 17, y + 21), fill=WHITE, width=2)
    # status
    cur = y + header_h + pad
    status_key = "statusIdle" if stage == "generate" else "statusDone"
    status_color = SUB if stage == "generate" else GREEN
    draw_text(d, (cx, cur), s[status_key], font(12), status_color, anchor="la")
    cur += 16 + 10
    # preview
    ph = 150
    rr(d, (cx, cur, cx + cw, cur + ph + 12), 8, fill=PANEL_BG)
    if preview_kind == "box":
        paste(img, make_box(cw - 24, ph), (cx + 6, cur + 6, cx + cw - 6, cur + 6 + ph))
    else:
        paste(img, make_photo(cw - 24, ph), (cx + 6, cur + 6, cx + cw - 6, cur + 6 + ph))
    cur += ph + 12 + 10
    # generate button
    bh = 38
    draw_button(d, (cx, cur, cx + cw, cur + bh), s["generate"], font(13, True), BLUE, WHITE)
    if stage == "generate":
        rr(d, (cx - 2, cur - 2, cx + cw + 2, cur + bh + 2), 10, outline=(255, 214, 92), width=2)
    cur += bh + 10

    if stage == "generate":
        # empty placeholders for title and keywords
        draw_text(d, (cx, cur), s["titleLabel"], font(12, True), INK, anchor="la")
        draw_refresh(d, cx + cw - 12, cur + 8, 8, SUB)
        cur += 16 + 6
        th = 48
        rr(d, (cx, cur, cx + cw, cur + th), 8, fill=(250, 251, 252), outline=BORDER, width=1)
        d.text((cx + cw / 2, cur + th / 2), s["titleLabel"], font=font(11), fill=SUB, anchor="mm")
        cur += th + 10
        draw_text(d, (cx, cur), s["keywordsLabel"], font(12, True), INK, anchor="la")
        draw_refresh(d, cx + cw - 12, cur + 8, 8, SUB)
        cur += 16 + 6
        kh = 120
        rr(d, (cx, cur, cx + cw, cur + kh), 8, fill=(250, 251, 252), outline=BORDER, width=1)
        d.text((cx + cw / 2, cur + kh / 2), s["keywordsLabel"], font=font(11), fill=SUB, anchor="mm")
        cur += kh + 10
    else:
        # title field
        draw_text(d, (cx, cur), s["titleLabel"], font(12, True), INK, anchor="la")
        draw_refresh(d, cx + cw - 12, cur + 8, 8, SUB)
        cur += 16 + 6
        th = 48
        rr(d, (cx, cur, cx + cw, cur + th), 8, fill=WHITE, outline=BORDER, width=1)
        center_wrapped(d, (cx + 8, cur + 4, cx + cw - 8, cur + th - 4), SAMPLE_TITLE[lang], font(12), INK, line_h=16, anchor_top=True)
        cur += th + 10
        # keywords field
        draw_text(d, (cx, cur), s["keywordsLabel"], font(12, True), INK, anchor="la")
        draw_refresh(d, cx + cw - 12, cur + 8, 8, SUB)
        draw_text(d, (cx + cw - 28, cur), s["kwCount"], font(11), SUB, anchor="ra")
        cur += 16 + 6
        kh = 120
        rr(d, (cx, cur, cx + cw, cur + kh), 8, fill=WHITE, outline=BORDER, width=1)
        kw_text = ", ".join(SAMPLE_KW[lang])
        center_wrapped(d, (cx + 8, cur + 6, cx + cw - 8, cur + kh - 6), kw_text, font(11), INK, line_h=15, anchor_top=True)
        cur += kh + 10

    # row 1
    rb = 34
    half = (cw - 8) / 2
    if stage == "apply":
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyTitle"], font(12, True), SOFT, INK)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyTitle"], font(12, True), SOFT, INK)
    elif buttons == "enabled":
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyTitle"], font(12, True), SOFT, INK)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyTitle"], font(12, True), SOFT, INK)
    else:
        disabled_color = (238, 240, 243)
        disabled_text = (160, 165, 175)
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyTitle"], font(12, True), disabled_color, disabled_text)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyTitle"], font(12, True), disabled_color, disabled_text)
    cur += rb + 8
    # row 2
    if stage == "apply":
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyKeywords"], font(12, True), SOFT, INK)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyKeywords"], font(12, True), SOFT, INK)
    elif buttons == "enabled":
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyKeywords"], font(12, True), SOFT, INK)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyKeywords"], font(12, True), SOFT, INK)
    else:
        disabled_color = (238, 240, 243)
        disabled_text = (160, 165, 175)
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyKeywords"], font(12, True), disabled_color, disabled_text)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyKeywords"], font(12, True), disabled_color, disabled_text)
    cur += rb + 8
    # row main
    if stage == "apply":
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyAll"], font(12, True), BLUE, WHITE)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["retry"], font(12, True), SOFT, INK)
    elif buttons == "enabled":
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyAll"], font(12, True), BLUE, WHITE)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["retry"], font(12, True), SOFT, INK)
    else:
        disabled_color = (238, 240, 243)
        disabled_text = (160, 165, 175)
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyAll"], font(12, True), disabled_color, disabled_text)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["retry"], font(12, True), disabled_color, disabled_text)


# =========================================================================
# SCREENSHOT 2 — Settings page (configure AI provider)
# =========================================================================
def shot_settings(lang):
    W, H = 1280, 800
    img = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(img)
    draw_browser(d, W, H, "chrome-extension://stockmeta/options/options.html")
    top = 56
    # card
    cw = 560
    cx = (W - cw) / 2
    cy = top + 30
    ch = 820
    rr(d, (cx, cy, cx + cw, cy + ch), 14, fill=WHITE, outline=(230, 233, 238), width=1)
    d.rectangle((cx, cy, cx + cw, cy + ch), outline=None)
    ix = cx + 28
    iw = cw - 56
    cur = cy + 28
    draw_text(d, (ix, cur), SAMPLE[lang]["optTitle"], font(20, True), INK, anchor="la")
    cur += 36
    # language row
    draw_text(d, (ix, cur), SAMPLE[lang]["lang"], font(14, True), INK, anchor="la")
    sel_w = 200
    sel_x = ix + iw - sel_w
    rr(d, (sel_x, cur - 6, sel_x + sel_w, cur + 30), 8, fill=WHITE, outline=BORDER, width=1)
    d.text((sel_x + 12, cur + 12), SAMPLE[lang]["english"], font=font(14), fill=INK, anchor="lm")
    d.polygon([(sel_x + sel_w - 22, cur + 8), (sel_x + sel_w - 8, cur + 8), (sel_x + sel_w - 15, cur + 20)], fill=SUB)
    cur += 52
    # provider
    draw_text(d, (ix, cur), SAMPLE[lang]["provider"], font(14, True), INK, anchor="la")
    sel_w = 280
    sel_x = ix + iw - sel_w
    rr(d, (sel_x, cur - 6, sel_x + sel_w, cur + 30), 8, fill=WHITE, outline=BORDER, width=1)
    d.text((sel_x + 12, cur + 12), SAMPLE[lang]["providerSiliconFlow"], font=font(14), fill=INK, anchor="lm")
    d.polygon([(sel_x + sel_w - 22, cur + 8), (sel_x + sel_w - 8, cur + 8), (sel_x + sel_w - 15, cur + 20)], fill=SUB)
    cur += 52
    # api key
    draw_text(d, (ix, cur), SAMPLE[lang]["apiKey"], font(14, True), INK, anchor="la")
    cur += 22
    rr(d, (ix, cur, ix + iw, cur + 42), 8, fill=WHITE, outline=BORDER, width=1)
    d.text((ix + 12, cur + 21), "sk-••••••••••••••••••••••", font=font(14), fill=INK, anchor="lm")
    cur += 50
    draw_text(d, (ix, cur), SAMPLE[lang]["apiKeyDesc"], font(12), SUB, anchor="la")
    cur += 34
    # model
    draw_text(d, (ix, cur), SAMPLE[lang]["model"], font(14, True), INK, anchor="la")
    cur += 22
    rr(d, (ix, cur, ix + iw, cur + 42), 8, fill=WHITE, outline=BORDER, width=1)
    d.text((ix + 12, cur + 21), "Qwen/Qwen3-Omni-30B-A3B-Captioner", font=font(13), fill=INK, anchor="lm")
    cur += 50
    draw_text(d, (ix, cur), SAMPLE[lang]["modelDesc"], font(12), SUB, anchor="la")
    cur += 34
    # keyword count
    draw_text(d, (ix, cur), SAMPLE[lang]["kwCountLabel"], font(14, True), INK, anchor="la")
    cur += 22
    rr(d, (ix, cur, ix + 120, cur + 42), 8, fill=WHITE, outline=BORDER, width=1)
    d.text((ix + 12, cur + 21), "30", font=font(14), fill=INK, anchor="lm")
    cur += 50
    draw_text(d, (ix, cur), SAMPLE[lang]["kwCountDesc"], font(12), SUB, anchor="la")
    cur += 40
    # auto-check AI declaration toggle
    draw_toggle_row(d, ix, cur, iw, SAMPLE[lang]["autoCheckAI"], SAMPLE[lang]["autoCheckAIDesc"], on=True)
    cur += 64
    # auto-save after apply toggle
    draw_toggle_row(d, ix, cur, iw, SAMPLE[lang]["autoSave"], SAMPLE[lang]["autoSaveDesc"], on=True)
    cur += 76
    # buttons
    bw = (iw - 12) / 2
    draw_button(d, (ix, cur, ix + bw, cur + 44), SAMPLE[lang]["test"], font(14, True), SOFT, INK)
    draw_button(d, (ix + bw + 12, cur, ix + iw, cur + 44), SAMPLE[lang]["save"], font(14, True), BLUE, WHITE)
    cur += 56
    # status
    draw_text(d, (ix, cur), SAMPLE[lang]["saved"], font(13), GREEN, anchor="la")
    cur += 30
    # tutorial + support links
    d.line((ix, cur, ix + iw, cur), fill=(238, 242, 247), width=1)
    cur += 14
    d.text((ix, cur + 8), SAMPLE[lang]["tutorial"], font=font(13), fill=BLUE, anchor="lm")
    d.text((ix + 200, cur + 8), "·", font=font(13), fill=BORDER, anchor="lm")
    d.text((ix + 220, cur + 8), SAMPLE[lang]["support"], font=font(13), fill=BLUE, anchor="lm")
    # step badge
    draw_step_badge(d, cx + cw - 170, cy + 28, SAMPLE[lang]["step1"], font(13, True))
    return img


# =========================================================================
# SCREENSHOT 3 — Adobe Stock + panel (one-click apply)
# =========================================================================
def draw_popup_window(d, img, x, y, lang, stage="apply"):
    """Draw the standalone extension popup (300px) matching the real popup UI.
    stage: 'generate' = initial state (empty fields, disabled buttons);
           'apply' = generated state (filled fields, active buttons).
    """
    s = SAMPLE[lang]
    w = 300
    header_h = 44
    pad = 12
    cw = w - 2 * pad
    cx = x + pad
    # body
    rr(d, (x, y, x + w, y + 640), 12, fill=WHITE, outline=(216, 222, 233), width=1)
    # header (blue, no icon)
    rr(d, (x, y, x + w, y + header_h + 14), 12, fill=BLUE)
    d.rectangle((x, y + header_h - 14, x + w, y + header_h + 14), fill=BLUE)
    draw_text(d, (x + 12, y + header_h / 2), s["panelTitle"], font(14, True), WHITE, anchor="lm")
    # settings gear + upload + minimize/collapse (from right to left)
    bx = x + w - 36
    rr(d, (bx, y + 7, bx + 28, y + 35), 6, fill=(255, 255, 255, 38))
    draw_gear(d, bx + 14, y + 21, 7, WHITE)
    bx2 = x + w - 72
    rr(d, (bx2, y + 7, bx2 + 28, y + 35), 6, fill=(255, 255, 255, 38))
    # upload icon (arrow into tray) — matches real popup pp-upload button
    draw_upload(d, bx2 + 14, y + 21, 7, WHITE)
    bx3 = x + w - 108
    rr(d, (bx3, y + 7, bx3 + 28, y + 35), 6, fill=(255, 255, 255, 38))
    # collapse button: minus sign (matches real popup / content panel)
    d.line((bx3 + 11, y + 21, bx3 + 17, y + 21), fill=WHITE, width=2)
    cur = y + header_h + 12
    # status
    if stage == "generate":
        draw_text(d, (cx, cur), s["statusIdle"], font(12), SUB, anchor="la")
    else:
        draw_text(d, (cx, cur), s["statusDone"], font(12), (74, 85, 104), anchor="la")
    cur += 20
    # preview
    ph = 150
    rr(d, (cx, cur, cx + cw, cur + ph + 10), 8, fill=PANEL_BG)
    paste(img, make_photo(cw - 24, ph), (cx + 6, cur + 6, cx + cw - 6, cur + 6 + ph))
    cur += ph + 10 + 10
    # generate button
    bh = 38
    draw_button(d, (cx, cur, cx + cw, cur + bh), s["generate"], font(13, True), BLUE, WHITE)
    cur += bh + 12
    # title
    draw_text(d, (cx, cur), s["titleLabel"], font(12, True), INK, anchor="la")
    draw_refresh(d, cx + cw - 10, cur + 8, 8, SUB)
    cur += 16
    th = 48
    rr(d, (cx, cur, cx + cw, cur + th), 8, fill=WHITE, outline=BORDER, width=1)
    if stage == "generate":
        d.text((cx + cw / 2, cur + th / 2), s["titleLabel"], font=font(11), fill=SUB, anchor="mm")
    else:
        center_wrapped(d, (cx + 8, cur + 4, cx + cw - 8, cur + th - 4), SAMPLE_TITLE[lang], font(12), INK, line_h=16, anchor_top=True)
    cur += th + 8
    # row1 buttons
    rb = 34
    half = (cw - 8) / 2
    if stage == "generate":
        disabled_color = (238, 240, 243)
        disabled_text = (160, 165, 175)
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyTitle"], font(12, True), disabled_color, disabled_text)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyTitle"], font(12, True), disabled_color, disabled_text)
    else:
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyTitle"], font(12, True), SOFT, INK)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyTitle"], font(12, True), SOFT, INK)
    cur += rb + 12
    # keywords
    draw_text(d, (cx, cur), s["keywordsLabel"], font(12, True), INK, anchor="la")
    draw_refresh(d, cx + cw - 10, cur + 8, 8, SUB)
    if stage != "generate":
        draw_text(d, (cx + cw - 26, cur), s["kwCount"], font(11), SUB, anchor="ra")
    cur += 16
    kh = 100
    rr(d, (cx, cur, cx + cw, cur + kh), 8, fill=WHITE, outline=BORDER, width=1)
    if stage == "generate":
        d.text((cx + cw / 2, cur + kh / 2), s["keywordsLabel"], font=font(11), fill=SUB, anchor="mm")
    else:
        kw_text = ", ".join(SAMPLE_KW[lang])
        center_wrapped(d, (cx + 8, cur + 6, cx + cw - 8, cur + kh - 6), kw_text, font(11), INK, line_h=15, anchor_top=True)
    cur += kh + 8
    # row2 buttons
    if stage == "generate":
        disabled_color = (238, 240, 243)
        disabled_text = (160, 165, 175)
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyKeywords"], font(12, True), disabled_color, disabled_text)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyKeywords"], font(12, True), disabled_color, disabled_text)
    else:
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyKeywords"], font(12, True), SOFT, INK)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["copyKeywords"], font(12, True), SOFT, INK)
    cur += rb + 12
    # row main
    if stage == "generate":
        disabled_color = (238, 240, 243)
        disabled_text = (160, 165, 175)
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyAll"], font(12, True), disabled_color, disabled_text)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["retry"], font(12, True), disabled_color, disabled_text)
    else:
        draw_button(d, (cx, cur, cx + half, cur + rb), s["applyAll"], font(12, True), BLUE, WHITE)
        draw_button(d, (cx + half + 8, cur, cx + cw, cur + rb), s["retry"], font(12, True), SOFT, INK)


def shot_adobe(lang):
    W, H = 1280, 800
    img = Image.new("RGBA", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    draw_browser(d, W, H, "https://contributor.stock.adobe.com/en/files")
    top = 56
    draw_adobe_grid(d, img, W, H, top, lang)
    # real standalone popup window on the right — initial state (matches user's screenshot)
    draw_popup_window(d, img, W - 300 - 24, top + 70, lang, stage="generate")
    # step badge
    draw_step_badge(d, 24, top + 70, SAMPLE[lang]["step2"], font(13, True))
    return img


def shot_popup(lang):
    W, H = 1280, 800
    img = Image.new("RGBA", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    draw_browser(d, W, H, "https://contributor.stock.adobe.com/en/files")
    top = 56
    draw_adobe_grid(d, img, W, H, top, lang)
    # real standalone popup window on the right (generated state)
    draw_popup_window(d, img, W - 300 - 24, top + 70, lang, stage="apply")
    # step badge
    draw_step_badge(d, 24, top + 70, SAMPLE[lang]["step3"], font(13, True))
    return img


# =========================================================================
# =========================================================================
# PROMO (bilingual)
# =========================================================================
PROMO = {
    "title_zh": "StockMeta Assistant for Adobe Stock",
    "title_en": "StockMeta Assistant for Adobe Stock",
    "tag_zh": "用 AI 一键生成 Adobe Stock 标题与关键词",
    "tag_en": "Generate Adobe Stock titles & keywords with AI in one click",
    "cta_zh": "免费安装",
    "cta_en": "Install free",
    "feat": [
        ("AI 视觉模型识别素材", "AI vision model recognizes your asset"),
        ("一键填入标题与关键词", "One-click fill title & keywords"),
        ("中英文界面自由切换", "Bilingual UI (中文 / English)"),
        ("API Key 本地保存，安全", "API Key stored locally, secure"),
    ],
}

def promo_440():
    W, H = 440, 280
    img = Image.new("RGBA", (W, H), BLUE)
    d = ImageDraw.Draw(img)
    # soft bg
    d.rectangle((0, 0, W, H), fill=BLUE)
    for y in range(H):
        t = y / H
        d.line((0, y, W, y), fill=(int(26 + 10 * t), int(115 + 20 * t), int(232 - 20 * t)))
    icon = Image.open(os.path.join(ROOT, "icons", "icon128.png")).convert("RGBA").resize((52, 52))
    img.paste(icon, (24, 30), icon)
    draw_text(d, (92, 34), PROMO["title_zh"], font(18, True), WHITE, anchor="la")
    center_wrapped(d, (24, 100, W - 24, 134), PROMO["tag_zh"], font(14), WHITE, line_h=20, anchor_top=True)
    center_wrapped(d, (24, 152, W - 24, 180), PROMO["tag_en"], font(12), WHITE, line_h=16, anchor_top=True)
    # cta
    draw_button(d, (24, 224, 200, 262), PROMO["cta_zh"], font(15, True), WHITE, BLUE, r=20)
    d.text((216, 243), PROMO["cta_en"], font=font(14, True), fill=WHITE, anchor="lm")
    return img



def promo_1400():
    W, H = 1400, 560
    img = Image.new("RGBA", (W, H), BLUE)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line((0, y, W, y), fill=(int(26 + 14 * t), int(115 + 26 * t), int(232 - 26 * t)))
    # left text block
    icon = Image.open(os.path.join(ROOT, "icons", "icon128.png")).convert("RGBA").resize((76, 76))
    img.paste(icon, (60, 50), icon)
    draw_text(d, (156, 60), PROMO["title_zh"], font(32, True), WHITE, anchor="la")
    center_wrapped(d, (60, 126, 760, 160), PROMO["tag_zh"], font(20), WHITE, line_h=26, anchor_top=True)
    center_wrapped(d, (60, 174, 760, 208), PROMO["tag_en"], font(16), WHITE, line_h=20, anchor_top=True)
    # features 2x2 small
    fx, fy = 60, 300
    fw = 350
    for i, (zh, en) in enumerate(PROMO["feat"]):
        r, c = divmod(i, 2)
        x = fx + c * (fw + 20)
        y = fy + r * 56
        draw_check(d, x + 14, y + 14, 12, WHITE)
        d.text((x + 40, y + 6), zh, font=font(15, True), fill=WHITE, anchor="la")
        d.text((x + 40, y + 30), en, font=font(12), fill=WHITE, anchor="la")
    # cta
    draw_button(d, (60, 470, 250, 520), PROMO["cta_zh"], font(18, True), WHITE, BLUE, r=24)
    d.text((270, 495), PROMO["cta_en"], font=font(17, True), fill=WHITE, anchor="lm")
    # right: mini panel illustration
    px = 860
    py = 70
    pw = 480
    draw_mini_panel(d, img, px, py, pw, "en")
    return img

def draw_mini_panel(d, img, x, y, w, lang):
    header_h = 46
    rr(d, (x, y, x + w, y + 360), 14, fill=WHITE, outline=(220, 224, 230), width=1)
    rr(d, (x, y, x + w, y + header_h + 14), 14, fill=BLUE)
    d.rectangle((x, y + header_h - 14, x + w, y + header_h + 14), fill=BLUE)
    icon = Image.open(os.path.join(ROOT, "icons", "icon48.png")).convert("RGBA").resize((24, 24))
    img.paste(icon, (x + 14, y + 11), icon)
    draw_text(d, (x + 46, y + header_h / 2), SAMPLE[lang]["panelTitle"], font(15, True), WHITE, anchor="lm")
    pad = 14
    cx = x + pad
    cw = w - 2 * pad
    cur = y + header_h + pad
    draw_text(d, (cx, cur), SAMPLE[lang]["statusDone"], font(12), GREEN, anchor="la")
    cur += 20
    ph = 100
    rr(d, (cx, cur, cx + cw, cur + ph + 12), 8, fill=PANEL_BG)
    paste(img, make_photo(cw - 24, ph), (cx + 6, cur + 6, cx + cw - 6, cur + 6 + ph))
    cur += ph + 12 + 8
    draw_button(d, (cx, cur, cx + cw, cur + 34), SAMPLE[lang]["generate"], font(12, True), BLUE, WHITE)
    cur += 42
    draw_text(d, (cx, cur), SAMPLE[lang]["titleLabel"], font(11, True), INK, anchor="la")
    cur += 18
    rr(d, (cx, cur, cx + cw, cur + 36), 8, fill=WHITE, outline=BORDER, width=1)
    center_wrapped(d, (cx + 8, cur + 4, cx + cw - 8, cur + 32), SAMPLE_TITLE[lang], font(11), INK, line_h=15, anchor_top=True)
    cur += 44
    draw_text(d, (cx, cur), SAMPLE[lang]["keywordsLabel"], font(11, True), INK, anchor="la")
    cur += 18
    rr(d, (cx, cur, cx + cw, cur + 50), 8, fill=WHITE, outline=BORDER, width=1)
    center_wrapped(d, (cx + 8, cur + 6, cx + cw - 8, cur + 44), ", ".join(SAMPLE_KW[lang][:18]), font(10), INK, line_h=13, anchor_top=True)


# =========================================================================
def main():
    os.makedirs(os.path.join(OUT, "screenshots", "zh"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "screenshots", "en"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "promo"), exist_ok=True)

    shots = [
        ("01-settings", shot_settings),
        ("02-adobe", shot_adobe),
        ("03-popup", shot_popup),
    ]
    for name, fn in shots:
        for lang in ("zh", "en"):
            p = os.path.join(OUT, "screenshots", lang, f"{name}.png")
            fn(lang).save(p)
            print("saved", p)

    promo_440().save(os.path.join(OUT, "promo", "440x280.png"))
    promo_1400().save(os.path.join(OUT, "promo", "1400x560.png"))
    print("saved promo images")

if __name__ == "__main__":
    main()
