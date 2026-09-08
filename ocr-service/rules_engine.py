"""
Rule-based compliance engine for Legal Metrology (Packaged Commodities)
Rules, 2011.

Tuned against real label samples (Maggi nutrition panel + Aloo Bhujiya
declaration panel) collected during hackathon testing. Uses fuzzy
(edit-distance) matching as a fallback for OCR-garbled label keywords.
"""

import re

# --- Regex patterns for each mandatory declaration -------------------------

NET_QTY_PATTERN = re.compile(
    r'\b(net\s*(qty|quantity|wt|weight)?[:\s]*)?(\d+(\.\d+)?)\s*'
    r'(g|gm|gms|grams?|kg|kgs?|ml|mls?|l|litre|liter|litres|liters|'
    r'pcs|pieces?|nos?|units?)\b',
    re.IGNORECASE
)

# Loosened to also catch "MIP" (common OCR misread of "MRP")
MRP_LABEL_PATTERN = re.compile(
    r'\b(m[.\s]?r[.\s]?p|mip|maximum\s*retail\s*price)\b',
    re.IGNORECASE
)
MRP_AMOUNT_PATTERN = re.compile(
    r'(rs\.?|₹|inr)?\s*\d+(\.\d{1,2})?\s*/?-?'
)
MRP_INCLUSIVE_PATTERN = re.compile(
    r'incl(usive)?\.?\s*(of)?\s*(all)?\s*tax', re.IGNORECASE
)

MFG_DATE_PATTERN = re.compile(
    r'(mfg|manufactur(ed|ing)|pack(ed|ing)?|import(ed)?)'
    r'[^0-9a-z]{0,5}'                          # tolerate junk/OCR noise (was [:\s]* — too strict)
    r'(date|dt|on)?'
    r'[^0-9]{0,5}'                              # tolerate more junk before the actual date
    r'(\d{1,2}[\/\-\s])?'
    r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|'
    r'january|february|march|april|june|july|august|september|october|'
    r'november|december|\d{1,2})[\/\-\s]*\d{2,4}',
    re.IGNORECASE
)

CONSUMER_CARE_PATTERN = re.compile(
    r'(customer\s*care|consumer\s*care|toll[\s-]?free|helpline|'
    r'for\s*complaints?|contact\s*us?)', re.IGNORECASE
)

PHONE_PATTERN = re.compile(r'(\+?91[\s-]?)?[6-9]\d{9}\b')
EMAIL_PATTERN = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')

# Manufacturer keyword is now OPTIONAL — real labels often skip it and
# just print the address directly (see Aloo Bhujiya sample)
MANUFACTURER_KEYWORD_PATTERN = re.compile(
    r'(manufactur(ed|er)\s*(by|for)?|marketed\s*by|packed\s*by|'
    r'imported\s*by)', re.IGNORECASE
)

# Structural address hint: address keyword/road-word near a 6-digit PIN code
ADDRESS_STRUCTURAL_PATTERN = re.compile(
    r'\b(address|road|street|st\.|nagar|colony|industrial\s*area|sector)\b.{0,60}?\b\d{6}\b'
    r'|\b\d{6}\b',
    re.IGNORECASE
)

COUNTRY_OF_ORIGIN_PATTERN = re.compile(
    r'country\s*of\s*origin[:\s]*\w+', re.IGNORECASE
)

# Bonus check (not one of the core 7, but useful for food products)
FSSAI_PATTERN = re.compile(
    r'fssai\s*(no\.?|number)?[:\s]*\d{10,14}', re.IGNORECASE
)

MIN_FONT_HEIGHT_PX = 12


# --- Fuzzy fallback helpers --------------------------------------------

def _levenshtein(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        dp[i][0] = i
    for j in range(len(b) + 1):
        dp[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    return dp[len(a)][len(b)]


def _fuzzy_contains(text, keyword, max_distance_ratio=0.35):
    """Check if any word/token in `text` is close enough (edit-distance-wise)
    to `keyword` — catches OCR garbling like 'arbonyarale' -> 'carbohydrate'."""
    tokens = re.findall(r'[a-zA-Z]+', text.lower())
    keyword = keyword.lower()
    max_dist = max(1, int(len(keyword) * max_distance_ratio))
    for tok in tokens:
        if len(tok) < 3:
            continue
        if _levenshtein(tok, keyword) <= max_dist:
            return True
    return False


def _find_match_context(pattern, text, window=40):
    m = pattern.search(text)
    if not m:
        return None
    start = max(0, m.start() - 10)
    end = min(len(text), m.end() + window)
    return text[start:end].strip().replace('\n', ' ')


# --- Checks --------------------------------------------------------------

def check_manufacturer_details(text):
    has_keyword = MANUFACTURER_KEYWORD_PATTERN.search(text) is not None
    has_address = ADDRESS_STRUCTURAL_PATTERN.search(text) is not None
    # Relaxed: EITHER keyword OR structural address (with PIN) is enough
    passed = has_keyword or has_address

    if has_keyword and has_address:
        detail = f"Found: '{_find_match_context(MANUFACTURER_KEYWORD_PATTERN, text)}' with address/PIN code."
    elif has_address:
        detail = "Address with PIN code found (no explicit 'manufactured/marketed by' keyword — acceptable if label format varies)."
    elif has_keyword:
        detail = "Manufacturer keyword found but address/PIN code not detected."
    else:
        detail = "No manufacturer/packer/importer name & address declaration found."
    return {
        "rule": "Manufacturer/Packer/Importer Name & Address",
        "pass": passed,
        "detail": detail
    }


def check_net_quantity(text):
    m = NET_QTY_PATTERN.search(text)
    passed = m is not None
    detail = f"Found: '{m.group(0).strip()}'" if passed else "No net quantity (weight/volume/count) declaration found."
    return {"rule": "Net Quantity Declaration", "pass": passed, "detail": detail}


def check_mrp(text):
    label_match = MRP_LABEL_PATTERN.search(text)
    has_amount = MRP_AMOUNT_PATTERN.search(text) is not None
    has_inclusive = MRP_INCLUSIVE_PATTERN.search(text) is not None
    fuzzy_inclusive = _fuzzy_contains(text, "inclusive") or _fuzzy_contains(text, "taxes")

    passed = label_match is not None and has_amount

    if passed and (has_inclusive or fuzzy_inclusive):
        detail = f"Found: '{label_match.group(0).strip()}' with amount, 'inclusive of taxes' wording present."
    elif passed:
        detail = f"Found: '{label_match.group(0).strip()}' with amount — but 'inclusive of all taxes' wording missing/unclear."
    elif fuzzy_inclusive:
        passed = True
        detail = "MRP label/number unclear in OCR, but 'inclusive of taxes' fragment found nearby — low-confidence match, verify manually."
    else:
        detail = "No MRP declaration found."
    return {"rule": "Maximum Retail Price (MRP)", "pass": passed, "detail": detail}


def check_mfg_date(text):
    m = MFG_DATE_PATTERN.search(text)
    passed = m is not None
    detail = f"Found: '{m.group(0).strip()}'" if passed else "No month/year of manufacture, packing or import found."
    return {"rule": "Month & Year of Manufacture/Packing/Import", "pass": passed, "detail": detail}


def check_consumer_care(text):
    has_label = CONSUMER_CARE_PATTERN.search(text) is not None
    phone_match = PHONE_PATTERN.search(text)
    email_match = EMAIL_PATTERN.search(text)
    passed = has_label or phone_match is not None or email_match is not None

    if passed:
        found = []
        if phone_match:
            found.append(f"phone '{phone_match.group(0)}'")
        if email_match:
            found.append(f"email '{email_match.group(0)}'")
        if has_label and not found:
            found.append("consumer care label")
        detail = "Found: " + ", ".join(found)
    else:
        detail = "No consumer care contact (phone/email/address) found."
    return {"rule": "Consumer Care Details", "pass": passed, "detail": detail}


def check_country_of_origin(text):
    m = COUNTRY_OF_ORIGIN_PATTERN.search(text)
    passed = m is not None
    detail = (f"Found: '{m.group(0).strip()}'" if passed else
              "Not found — mandatory only for imported goods; verify manually if applicable.")
    return {"rule": "Country of Origin (imported goods only)", "pass": passed, "detail": detail, "advisory": True}


def check_fssai(text):
    m = FSSAI_PATTERN.search(text)
    passed = m is not None
    detail = f"Found: '{m.group(0).strip()}'" if passed else "No FSSAI number found."
    return {"rule": "FSSAI License Number (bonus check, food products)", "pass": passed, "detail": detail, "advisory": True}


def check_font_size(words):
    """Heuristic: flag if a large share of OCR-detected text is very small
    relative to a typical readable threshold (possible font-size violation)."""
    if not words:
        return {"rule": "Font Size / Readability (heuristic)", "pass": False,
                "detail": "No text detected to evaluate readability.", "advisory": True}

    heights = [w["height_px"] for w in words if w["height_px"] > 0]
    if not heights:
        return {"rule": "Font Size / Readability (heuristic)", "pass": False,
                "detail": "Could not measure text size.", "advisory": True}

    avg_height = sum(heights) / len(heights)
    tiny_words = [w for w in words if 0 < w["height_px"] < MIN_FONT_HEIGHT_PX]
    tiny_ratio = len(tiny_words) / len(words)

    passed = tiny_ratio < 0.35
    detail = (f"Avg detected text height ~{avg_height:.1f}px; "
              f"{len(tiny_words)}/{len(words)} words below {MIN_FONT_HEIGHT_PX}px threshold. "
              "This is an OCR-based proxy, not a calibrated mm measurement — verify manually.")
    return {"rule": "Font Size / Readability (heuristic)", "pass": passed, "detail": detail, "advisory": True}


def run_compliance_check(ocr_result: dict):
    text = ocr_result["text"]
    words = ocr_result["words"]

    checks = [
        check_manufacturer_details(text),
        check_net_quantity(text),
        check_mrp(text),
        check_mfg_date(text),
        check_consumer_care(text),
        check_country_of_origin(text),
        check_fssai(text),
        check_font_size(words),
    ]

    hard_checks = [c for c in checks if not c.get("advisory")]
    violations = [c for c in hard_checks if not c["pass"]]

    status = "COMPLIANT" if len(violations) == 0 else "NON_COMPLIANT"

    return {
        "ocr_text": text,
        "checks": checks,
        "status": status,
        "violations_count": len(violations)
    }