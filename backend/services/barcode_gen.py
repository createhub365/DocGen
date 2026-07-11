from io import BytesIO

from barcode import Code128
from barcode.writer import ImageWriter
from PIL import Image, ImageDraw, ImageFont

TARGET_WIDTH = 520
TEXT_COLOR = "#333333"
TEXT_GAP = 8
TEXT_SIZE = 44


def _load_label_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "arialbd.ttf",
        "Arial Bold.ttf",
        "Arial-Bold.ttf",
        "DejaVuSans-Bold.ttf",
        "segoeuib.ttf",
        "Segoe UI Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def generate_barcode(ref_number: str, *, include_label: bool = False) -> bytes:
    buffer = BytesIO()
    barcode = Code128(ref_number, writer=ImageWriter())

    options = {
        "module_width": 0.45,
        "module_height": 9.0,
        "background": "white",
        "foreground": "black",
        "quiet_zone": 2.0,
        "write_text": False,
        "dpi": 300,
    }

    barcode.write(buffer, options=options)
    buffer.seek(0)

    barcode_img = Image.open(buffer).convert("RGB")
    aspect = barcode_img.width / barcode_img.height
    barcode_h = int(TARGET_WIDTH / aspect)
    barcode_img = barcode_img.resize((TARGET_WIDTH, barcode_h), Image.LANCZOS)

    if not include_label:
        output = BytesIO()
        barcode_img.save(output, format="PNG")
        output.seek(0)
        return output.read()

    font = _load_label_font(TEXT_SIZE)
    label_bbox = ImageDraw.Draw(barcode_img).textbbox((0, 0), ref_number, font=font)
    label_w = label_bbox[2] - label_bbox[0]
    label_h = label_bbox[3] - label_bbox[1]

    total_h = barcode_h + TEXT_GAP + label_h + TEXT_GAP
    composite = Image.new("RGB", (TARGET_WIDTH, total_h), "white")
    composite.paste(barcode_img, (0, 0))

    draw = ImageDraw.Draw(composite)
    text_x = (TARGET_WIDTH - label_w) // 2
    text_y = barcode_h + TEXT_GAP
    draw.text((text_x, text_y), ref_number, fill=TEXT_COLOR, font=font)

    output = BytesIO()
    composite.save(output, format="PNG")
    output.seek(0)
    return output.read()
