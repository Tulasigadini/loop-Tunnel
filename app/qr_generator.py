import qrcode
import io
from PIL import Image
from typing import Optional


def generate_image_qr(url: str, size: int = 220) -> Image.Image:
    """Generates a PIL Image QR Code for the given public URL."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0d1117", back_color="#ffffff").convert("RGBA")
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
