import re
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter


def preprocess_image(image: Image.Image) -> Image.Image:
    """Enhance image quality for better OCR accuracy."""
    image = image.convert('L')  # grayscale
    image = ImageEnhance.Contrast(image).enhance(2.0)
    image = ImageEnhance.Sharpness(image).enhance(2.0)
    image = image.filter(ImageFilter.SHARPEN)
    return image


def extract_text(image_path: str) -> str:
    img = Image.open(image_path)
    processed = preprocess_image(img)
    # Try Bulgarian + English; fall back to English only
    try:
        text = pytesseract.image_to_string(processed, lang='bul+eng', config='--psm 6')
    except pytesseract.pytesseract.TesseractError:
        text = pytesseract.image_to_string(processed, lang='eng', config='--psm 6')
    return text.strip()


def parse_order(text: str) -> dict:
    """Extract structured order fields from raw OCR text."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    order = {
        'raw_text': text,
        'customer_name': None,
        'phone': None,
        'address': None,
        'items': [],
        'total': None,
        'notes': None,
    }

    phone_pattern = re.compile(r'(?:\+359|0)[\s\-]?[0-9]{2,3}[\s\-]?[0-9]{3,4}[\s\-]?[0-9]{3,4}')
    price_pattern = re.compile(r'\b\d+[.,]\d{2}\s*(?:лв|BGN|lv)?\b', re.IGNORECASE)

    for line in lines:
        lower = line.lower()

        if not order['phone']:
            m = phone_pattern.search(line)
            if m:
                order['phone'] = m.group().strip()

        if not order['total']:
            if any(kw in lower for kw in ('общо', 'total', 'сума', 'amount', 'за плащане')):
                m = price_pattern.search(line)
                if m:
                    order['total'] = m.group().strip()

        if not order['customer_name']:
            if any(kw in lower for kw in ('клиент', 'име', 'name', 'получател')):
                value = re.sub(r'(?i)(клиент|име|name|получател)\s*[:\-]?\s*', '', line).strip()
                if value:
                    order['customer_name'] = value

        if not order['address']:
            if any(kw in lower for kw in ('адрес', 'address', 'улица', 'ул.', 'бул.')):
                value = re.sub(r'(?i)(адрес|address)\s*[:\-]?\s*', '', line).strip()
                if value:
                    order['address'] = value

        # Lines with quantities look like "2 x Продукт" or "Продукт - 2 бр."
        item_match = re.match(r'^(\d+)\s*[xхXХ]\s*(.+)', line) or \
                     re.match(r'^(.+?)\s*[-–]\s*(\d+)\s*(?:бр|бройки|pcs)?\.?\s*$', line, re.IGNORECASE)
        if item_match:
            order['items'].append(item_match.group(0).strip())

    return order


def process_order_image(image_path: str) -> dict:
    text = extract_text(image_path)
    if not text:
        return {'error': 'Не беше открит текст в изображението'}
    return parse_order(text)
