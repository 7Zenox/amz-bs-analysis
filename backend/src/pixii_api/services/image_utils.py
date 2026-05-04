import base64
import io

from PIL import Image, ImageOps


def normalize(image: Image.Image, max_side: int = 2048) -> Image.Image:
    # Strip EXIF and correct orientation
    image = ImageOps.exif_transpose(image) or image
    # Convert to RGB (handles RGBA, palette modes, etc.)
    if image.mode != "RGB":
        image = image.convert("RGB")
    # Resize if too large, preserving aspect ratio
    if max(image.size) > max_side:
        image.thumbnail((max_side, max_side), Image.LANCZOS)
    return image


def to_bytes(image: Image.Image, fmt: str = "JPEG", quality: int = 92) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format=fmt, quality=quality if fmt == "JPEG" else None)
    return buf.getvalue()


def from_bytes(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def to_b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def from_b64(b64: str) -> bytes:
    return base64.b64decode(b64)


def dimensions(image: Image.Image) -> tuple[int, int]:
    return image.size  # (width, height)
