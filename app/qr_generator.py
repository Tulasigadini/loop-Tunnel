import qrcode
import io
from PIL import Image
from typing import Optional


import os

def generate_image_qr(url: str, size: int = 200, logo_path: Optional[str] = None) -> Image.Image:
    """Generates a high-res PIL Image QR Code for the given public URL with an embedded center logo."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="#0F172A", back_color="#FFFFFF").convert("RGBA")

    # Embed center logo emblem if available
    try:
        from app.tunnel_engine import get_resource_path
        if not logo_path:
            logo_path = get_resource_path("Assets/StoreLogo.png")
            if not os.path.exists(logo_path):
                logo_path = get_resource_path("public/logo.png")

        if logo_path and os.path.exists(logo_path):
            logo = Image.open(logo_path).convert("RGBA")

            qr_w, qr_h = img.size
            logo_size = int(qr_w * 0.22)
            logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

            pad = 6
            bg = Image.new("RGBA", (logo_size + pad * 2, logo_size + pad * 2), (255, 255, 255, 255))

            pos = ((qr_w - bg.width) // 2, (qr_h - bg.height) // 2)
            img.paste(bg, pos, bg)
            img.paste(logo, (pos[0] + pad, pos[1] + pad), logo)
    except Exception as e:
        print(f"[QR Logo Embed Warning] {e}")

    img = img.resize((size, size), Image.Resampling.LANCZOS)
    return img


def generate_ascii_qr(url: str) -> str:
    """Generates a compact ASCII string QR code for terminal output."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=1,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)

    matrix = qr.get_matrix()
    output = []
    # Combine pairs of vertical pixels into half-block characters for compact terminal display
    for y in range(0, len(matrix), 2):
        line = ""
        for x in range(len(matrix[y])):
            top = matrix[y][x]
            bottom = matrix[y + 1][x] if y + 1 < len(matrix) else False
            if top and bottom:
                line += "█"
            elif top and not bottom:
                line += "▀"
            elif not top and bottom:
                line += "▄"
            else:
                line += " "
        output.append(line)
    return "\n".join(output)
