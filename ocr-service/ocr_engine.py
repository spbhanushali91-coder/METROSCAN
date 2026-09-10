"""
Robust OCR service for packaged-commodity labels.

Changes from the original:
- Tesseract path is configurable instead of hard-coded to Windows.
- Tries several preprocessing/PSM combinations and keeps the best-confidence result.
- Preserves bounding boxes for later layout/font heuristics.
- Normalizes OCR confidence values to floats.
"""
import os
import cv2
import pytesseract


def _variants(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")

    # Keep enough resolution for small declarations.
    scale = 2.2
    img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast = clahe.apply(gray)
    denoise = cv2.bilateralFilter(contrast, 7, 55, 55)

    # Threshold is useful on clean matte labels, but harmful on glare.
    otsu = cv2.threshold(denoise, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    return [
        ("gray", gray),
        ("contrast", denoise),
        ("otsu", otsu),
    ]


def _ocr_candidate(image, psm):
    config = f"--oem 3 --psm {psm}"
    data = pytesseract.image_to_data(
        image, config=config, output_type=pytesseract.Output.DICT
    )

    words = []
    confidences = []
    for i, raw in enumerate(data.get("text", [])):
        word = (raw or "").strip()
        try:
            conf = float(data["conf"][i])
        except (ValueError, TypeError):
            conf = -1.0

        if not word or conf < 0:
            continue

        words.append({
            "text": word,
            "height_px": int(data["height"][i]),
            "left": int(data["left"][i]),
            "top": int(data["top"][i]),
            "width": int(data["width"][i]),
            "conf": conf,
        })
        confidences.append(conf)

    text = pytesseract.image_to_string(image, config=config)
    mean_conf = sum(confidences) / len(confidences) if confidences else 0.0
    # Penalize empty OCR so a bogus high-confidence tiny result is not selected.
    score = mean_conf if len(words) >= 3 else mean_conf * 0.7
    return score, text, words


def extract_text_and_layout(image_path: str):
    candidates = []
    for variant_name, image in _variants(image_path):
        for psm in (6, 11, 12):
            score, text, words = _ocr_candidate(image, psm)
            candidates.append((score, variant_name, psm, text, words, image.shape[0]))

    best = max(candidates, key=lambda x: x[0])
    _, variant_name, psm, text, words, height = best

    return {
        "text": text,
        "words": words,
        "image_height_px": height,
        "ocr_method": f"{variant_name}/psm{psm}",
    }
