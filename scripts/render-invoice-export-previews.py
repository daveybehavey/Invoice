from pathlib import Path

import pymupdf
from PIL import Image, ImageChops


SOURCE_DIR = Path("marketing/landing/invoice-export-samples")
OUTPUT_DIRS = [
    Path("marketing/landing/invoice-export-samples"),
    Path("public/landing/invoice-export-samples"),
]


def render_preview(pdf_path: Path) -> Image.Image:
    document = pymupdf.open(pdf_path)
    page = document[0]
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
    temp_path = pdf_path.with_suffix(".tmp.png")
    pixmap.save(temp_path)
    image = Image.open(temp_path).convert("RGB")
    background = Image.new("RGB", image.size, (255, 255, 255))
    diff = ImageChops.difference(image, background)
    bbox = diff.getbbox()
    temp_path.unlink(missing_ok=True)

    if not bbox:
        return image

    left, top, right, bottom = bbox
    margin = 28
    crop = (
        max(0, left - margin),
        max(0, top - margin),
        min(image.width, right + margin),
        min(image.height, bottom + margin),
    )
    return image.crop(crop)


for output_dir in OUTPUT_DIRS:
    output_dir.mkdir(parents=True, exist_ok=True)

for pdf_path in SOURCE_DIR.glob("*.pdf"):
    preview = render_preview(pdf_path)
    for output_dir in OUTPUT_DIRS:
        output_path = output_dir / f"{pdf_path.stem}.preview.png"
        preview.save(output_path, format="PNG", optimize=True)
        print(output_path)
