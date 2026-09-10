from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
import tempfile

from ocr_engine import extract_text_and_layout
from rules_engine import run_compliance_check

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze():
    if "image" not in request.files:
        return jsonify({"error": "No image file provided (field name must be 'image')"}), 400

    file = request.files["image"]
    suffix = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        ocr_result = extract_text_and_layout(tmp_path)
        compliance_result = run_compliance_check(ocr_result)
        return jsonify(compliance_result)
    except Exception as e:
        return jsonify({"error": "OCR/analysis failed", "details": str(e)}), 500
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
