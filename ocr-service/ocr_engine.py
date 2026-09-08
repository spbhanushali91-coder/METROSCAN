"""
OCR extraction wrapper around pytesseract, with soft OpenCV preprocessing
to handle glossy/curved packaging labels.

NOTE: We deliberately avoid adaptive thresholding here — it was tested and
found to destroy text on curved/glossy surfaces due to glare (see hackathon
debug notes). Only mild contrast + edge-preserving smoothing is applied.
"""

import cv2
import pytesseract


def _preprocess(image_path: str):
    """Soft preprocessing: upscale + mild contrast + noise smoothing.
    No binarization/thresholding — that step was destroying character
    shapes on curved, glossy packaging in testing."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")

    # Upscale — helps small text
    img = cv2.resize(img, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Mild contrast boost
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrasted = clahe.apply(gray)

    # Edge-preserving noise removal (keeps character shapes intact,
    # unlike fastNlMeansDenoising + adaptiveThreshold which we removed)
    smoothed = cv2.bilateralFilter(contrasted, d=9, sigmaColor=75, sigmaSpace=75)

    return smoothed  # grayscale numpy array — Tesseract handles this fine


def extract_text_and_layout(image_path: str):
    processed = _preprocess(image_path)

    config = "--psm 6 --oem 3"  # PSM 6 = uniform block, good for label text

    text = pytesseract.image_to_string(processed, config=config)
    data = pytesseract.image_to_data(processed, config=config, output_type=pytesseract.Output.DICT)

    words = []
    n = len(data.get("text", []))
    for i in range(n):
        word = data["text"][i].strip()
        conf = data["conf"][i]
        if word and str(conf) not in ("-1",):
            words.append({
                "text": word,
                "height_px": data["height"][i],
                "left": data["left"][i],
                "top": data["top"][i],
                "width": data["width"][i],
                "conf": conf,
            })

    image_height_px = processed.shape[0]

    return {
        "text": text,
        "words": words,
        "image_height_px": image_height_px,
    }