"""生成 PWA 图标：深蓝底 + 粉色「語」字 + 红色 N 角标，和卡片配色一致。
用法: python make_icons.py <输出目录>
"""
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
NAVY, PINK, RED, WHITE = "#1f3a5c", "#f6c9cf", "#d9402b", "#ffffff"


def icon(size, maskable=False):
    s = 4  # 先画大图再缩小，边缘更平滑
    W = size * s
    img = Image.new("RGBA", (W, W), NAVY if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=W * 0.22, fill=NAVY)
    # maskable 图标的安全区是中间 80%，内容缩小一点
    k = 0.78 if maskable else 1.0
    font = ImageFont.truetype(r"C:\Windows\Fonts\yumindb.ttf", int(W * 0.50 * k))
    d.text((W / 2, W / 2 + W * 0.05 * k), "語", font=font, fill=WHITE, anchor="mm")
    # 左上角粉色小标签
    bw, bh = W * 0.26 * k, W * 0.08 * k
    x0, y0 = W / 2 - W * 0.32 * k, W / 2 - W * 0.37 * k
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=bh * 0.2, fill=PINK)
    # 右下角红色级别角标
    rw, rh = W * 0.22 * k, W * 0.13 * k
    x1, y1 = W / 2 + W * 0.36 * k - rw, W / 2 + W * 0.36 * k - rh
    d.rounded_rectangle([x1, y1, x1 + rw, y1 + rh], radius=rh * 0.15, fill=RED)
    f2 = ImageFont.truetype(r"C:\Windows\Fonts\georgiab.ttf", int(rh * 0.7))
    d.text((x1 + rw / 2, y1 + rh / 2), "N", font=f2, fill=WHITE, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


icon(192).save(f"{out}/icon-192.png")
icon(512).save(f"{out}/icon-512.png")
icon(512, maskable=True).save(f"{out}/icon-maskable.png")
icon(180, maskable=True).convert("RGB").save(f"{out}/apple-touch-icon.png")  # iOS 自己会切圆角
