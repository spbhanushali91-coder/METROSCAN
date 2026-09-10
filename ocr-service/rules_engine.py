"""
Compliance rule engine.

Important design principle:
A missing declaration is FAIL only when the rule is applicable.
Uncertain/commodity-dependent checks are REVIEW/advisory instead of being
silently counted as compliant.

This is a screening engine, not a final legal determination.
"""
import re
from difflib import SequenceMatcher

NET_QTY_PATTERN = re.compile(
    r"\bnet\s*(?:qty|quantity|wt|weight)?\s*[:\-]?\s*"
    r"(\d+(?:[.,]\d+)?)\s*"
    r"(g|gm|gms|grams?|kg|kgs?|mg|ml|mls?|l|litres?|liters?|"
    r"pcs?|pieces?|nos?|units?)\b",
    re.I
)

# Fallback: label + number present, but unit was not reliably OCR'd.
NET_QTY_LABEL_ONLY_PATTERN = re.compile(
    r"\bnet\s*(?:qty|quantity|wt|weight)\b\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\b",
    re.I
)

LOT_PATTERN = re.compile(
    r"\b(?:batch|batch\s*no|batch\s*number|lot|lot\s*no|lot\s*number|"
    r"b\.?\s*no|l\.?\s*no)\s*[:#\-]?\s*"
    r"([A-Z0-9][A-Z0-9\/\-_]{2,})\b",
    re.I)

MRP_LABEL_PATTERN = re.compile(
    r"\b(?:m\.?\s*r\.?\s*p\.?|mip|maximum\s+retail\s+price)\b", re.I)

MONEY_PATTERN = re.compile(r"(?:₹|rs\.?|inr)\s*([0-9]+(?:[.,][0-9]{1,2})?)", re.I)
MONEY_BARE_PATTERN = re.compile(r"\b([0-9]{1,6}(?:[.,][0-9]{1,2})?)\b")

MFG_PATTERN = re.compile(
    r"\b(?:mfg|mfd|manufactur(?:ed|ing)|packed|packing|pkd|imported)"
    r"(?:\s*(?:on|date|dt))?\s*[:\-]?\s*"
    r"((?:\d{1,2}[\/\-.])?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|"
    r"may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|"
    r"nov(?:ember)?|dec(?:ember)?|\d{1,2})[\/\-. ]\d{2,4})", re.I)

DATE_ANY = re.compile(
    r"\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|"
    r"mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|"
    r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4}\b", re.I)

CONSUMER = re.compile(
    r"\b(?:consumer\s*care|customer\s*care|toll[\s-]?free|helpline|"
    r"complaint(?:s)?|contact\s+us)\b", re.I)

PHONE = re.compile(r"(?:\+?91[\s-]?)?[6-9]\d{9}\b")
EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

RESPONSIBLE = re.compile(
    r"\b(?:manufactured?\s+by|mfg\.?\s+by|packed\s+by|marketed\s+by|"
    r"imported\s+by|manufactured\s+for|packer)\b", re.I)

PIN = re.compile(r"\b[1-9]\d{5}\b")
ADDRESS_WORDS = re.compile(
    r"\b(?:road|rd\.?|street|st\.?|nagar|colony|sector|industrial|estate|"
    r"plot|lane|building|bhawan|mumbai|delhi|pune|thane|maharashtra)\b", re.I)

ORIGIN = re.compile(r"\b(?:country\s+of\s+origin|made\s+in|product\s+of)\b", re.I)
UNIT_SALE = re.compile(
    r"(?:₹|rs\.?|inr)\s*\d+(?:[.,]\d{1,2})?\s*(?:per|/)\s*"
    r"(?:kg|g|100g|l|ml|100ml|unit|number|piece|pcs?)\b", re.I)


FSSAI = re.compile(r"\bfssai\b", re.I)
INCLUSIVE = re.compile(r"\b(?:inclusive|incl\.?)\b.{0,20}\b(?:all\s+)?tax(?:es)?\b", re.I)

ORG_SUFFIX_PATTERN = re.compile(
    r"\b(?:udyog|griha\s+udyog|industries|enterprises|foods?|products?|"
    r"papad|pvt\.?\s*ltd\.?|ltd\.?|limited|co\.?|company|mandal)\b", re.I)

EXPIRY_WORD = re.compile(r"\b(?:expir(?:y|es|ed)?|best\s+before|use\s+by)\b", re.I)
MFG_FUZZY_TOKENS = ["manufacturing", "manufactured", "mfg", "mfd", "packed", "packing"]

NUTRITION_CONTEXT = re.compile(
    r"\b(?:protein|fat|sugar|sodium|energy|carbohydrate|serving|rda|kcal)\b", re.I)
BARE_WEIGHT_PATTERN = re.compile(r"\b(\d{2,4})\s*(g|gm|kg|ml|l)\b", re.I)

def _context(pattern, text, radius=65):
    m = pattern.search(text)
    if not m:
        return ""
    return " ".join(text[max(0, m.start()-20):m.end()+radius].split())


def _fuzzy(text, target, threshold=0.72):
    tokens = re.findall(r"[A-Za-z]{3,}", text.lower())
    return any(SequenceMatcher(None, token, target.lower()).ratio() >= threshold for token in tokens)


def _check(rule, passed, detail, advisory=False):
    return {"rule": rule, "pass": bool(passed), "detail": detail, "advisory": advisory}

def extract_lot_number(text):
    m = LOT_PATTERN.search(text)

    if not m:
        return None

    return m.group(1).strip().upper()

def check_manufacturer_details(text):
    responsible = RESPONSIBLE.search(text)
    pin = PIN.search(text)
    address_word = ADDRESS_WORDS.search(text)
    org_suffix = ORG_SUFFIX_PATTERN.search(text)

    passed = bool(responsible and (pin or address_word))
    advisory = False

    if passed:
        detail = f"Responsible-entity wording and address signal found: {_context(RESPONSIBLE, text)}"
    elif (pin or address_word) and org_suffix:
        # Self-branded manufacturer: name+address present but no "packed by" wording.
        passed = True
        advisory = True
        detail = ("Name and address signal found without explicit 'packed by/manufactured by' "
                   "wording — likely a self-branded manufacturer. Manual verification required.")
    elif responsible:
        detail = "Manufacturer/packer/importer wording found, but address/PIN signal is missing."
    elif pin or address_word:
        detail = "Address/PIN signal found, but responsible entity name is unclear."
    else:
        detail = "No reliable manufacturer/packer/importer name-and-address signal found."
    return _check("Manufacturer/Packer/Importer Name & Address", passed, detail, advisory=advisory)



    m = NET_QTY_PATTERN.search(text)

    if m:
        return _check(
            "Net Quantity Declaration",
            True,
            f"Found: '{m.group(0).strip()}'"
        )

    fallback = NET_QTY_LABEL_ONLY_PATTERN.search(text)
    if fallback:
        return _check(
            "Net Quantity Declaration",
            False,
            f"Net quantity label and a number were found ('{fallback.group(0).strip()}'), "
            "but the unit (g/kg/ml/L) was not reliably read. Manual verification required.",
            advisory=True
        )

    return _check(
        "Net Quantity Declaration",
        False,
        "No reliable net quantity with unit was detected."
    )

def check_net_quantity(text):
    m = NET_QTY_PATTERN.search(text)
    if m:
        return _check("Net Quantity Declaration", True, f"Found: '{m.group(0).strip()}'")

    fallback = NET_QTY_LABEL_ONLY_PATTERN.search(text)
    if fallback:
        return _check(
            "Net Quantity Declaration", False,
            f"Net quantity label and a number were found ('{fallback.group(0).strip()}'), "
            "but the unit (g/kg/ml/L) was not reliably read. Manual verification required.",
            advisory=True
        )

    for wm in BARE_WEIGHT_PATTERN.finditer(text):
        window = text[max(0, wm.start() - 25):wm.start()]
        if NUTRITION_CONTEXT.search(window):
            continue
        return _check(
            "Net Quantity Declaration", False,
            f"'Net Quantity' wording was not OCR'd, but a standalone weight value "
            f"was found ('{wm.group(0)}'). Manual verification required.",
            advisory=True
        )

    # No net-quantity signal at all — could be a genuine omission OR a
    # complete OCR miss of that line. Flag for manual review rather than
    # a hard fail, consistent with the other declaration checks above.
    return _check(
        "Net Quantity Declaration", False,
        "No net quantity signal was detected by OCR. This may be a genuine "
        "missing declaration or an OCR read failure — manual verification required.",
        advisory=True
    )



    
def check_mrp(text):
    label = MRP_LABEL_PATTERN.search(text)

    if not label:
        return _check(
            "Maximum Retail Price (MRP)",
            False,
            "MRP label was not detected."
        )

    window = text[label.end():label.end() + 80]

    amount = MONEY_PATTERN.search(window)

    if not amount:
        amount = MONEY_BARE_PATTERN.search(window)

    if not amount:
        return _check(
            "Maximum Retail Price (MRP)",
            False,
            "MRP label found but price amount was not detected."
        )

    inclusive = (
        bool(INCLUSIVE.search(window))
        or _fuzzy(window, "inclusive")
        or _fuzzy(window, "taxes")
    )

    if inclusive:
        detail = (
            f"MRP and tax-inclusive wording detected: "
            f"'{_context(MRP_LABEL_PATTERN, text)}'"
        )

        return _check(
            "Maximum Retail Price (MRP)",
            True,
            detail
        )

    return _check(
        "Maximum Retail Price (MRP)",
        True,
        "MRP amount detected; tax-inclusive wording is unclear "
        "and should be manually verified.",
        advisory=True
    )

    
def extract_net_quantity(text):
    m = NET_QTY_PATTERN.search(text)

    if not m:
        return None

    value = m.group(1).replace(",", ".").strip()
    unit = m.group(2).lower().strip()

    unit_map = {
        "gm": "g",
        "gms": "g",
        "gram": "g",
        "grams": "g",
        "kgs": "kg",
        "litre": "L",
        "litres": "L",
        "liter": "L",
        "liters": "L",
        "mls": "mL",
        "pcs": "pcs",
        "pieces": "pcs",
        "nos": "pcs",
        "units": "pcs"
    }

    normalized_unit = unit_map.get(unit, unit)

    if normalized_unit == "l":
        normalized_unit = "L"
    elif normalized_unit == "ml":
        normalized_unit = "mL"
    elif normalized_unit == "kg":
        normalized_unit = "kg"
    elif normalized_unit == "g":
        normalized_unit = "g"
    elif normalized_unit == "mg":
        normalized_unit = "mg"

    return {
        "value": float(value),
        "unit": normalized_unit,
        "raw": m.group(0).strip()
    }



def extract_mrp(text):
    label = MRP_LABEL_PATTERN.search(text)

    if not label:
        return None

    window = text[label.end():label.end() + 80]

    amount = MONEY_PATTERN.search(window)

    if not amount:
        amount = MONEY_BARE_PATTERN.search(window)

    if not amount:
        return None

    value = amount.group(1).replace(",", ".").strip()

    try:
        value = float(value)
    except ValueError:
        return None

    return {
        "value": value,
        "currency": "INR",
        "raw": amount.group(0).strip()
    }


def check_mfg_date(text):
    m = MFG_PATTERN.search(text)
    if m:
        return _check("Month & Year of Manufacture/Packing/Import", True, f"Found: '{m.group(0).strip()}'")

    dates = list(DATE_ANY.finditer(text))
    if dates:
        has_mfg_fuzzy = any(
            _fuzzy(text[max(0, d.start() - 40):d.start()], tok)
            for d in dates for tok in MFG_FUZZY_TOKENS
        )
        dual_date_with_expiry = len(dates) >= 2 and EXPIRY_WORD.search(text)

        if has_mfg_fuzzy or dual_date_with_expiry:
            return _check(
                "Month & Year of Manufacture/Packing/Import", False,
                "A manufacture/expiry date pair was detected, but the 'manufacturing date' "
                "keyword was OCR-garbled. Manual verification required.",
                advisory=True
            )
        return _check("Month & Year of Manufacture/Packing/Import", False,
                       "A date exists, but it is not reliably linked to manufacture/packing/import wording.")
    return _check("Month & Year of Manufacture/Packing/Import", False,
                  "No manufacture/packing/import date signal found.")

def check_consumer_care(text):
    if CONSUMER.search(text):
        return _check("Consumer Care Details", True, f"Found: '{_context(CONSUMER, text)}'")
    if PHONE.search(text) or EMAIL.search(text):
        return _check("Consumer Care Details", True, "Phone/email contact signal detected.")
    return _check("Consumer Care Details", False, "No consumer-care contact signal found.")


def check_country_of_origin(text):
    m = ORIGIN.search(text)
    if m:
        return _check("Country of Origin (imported goods)", True, f"Found: '{_context(ORIGIN, text, 35)}'", advisory=True)
    # Do not fail every domestic package. Applicability depends on import status.
    imported = bool(re.search(r"\b(?:imported|importer)\b", text, re.I))
    return _check(
        "Country of Origin (imported goods)",
        False,
        "Imported wording is present but origin was not detected." if imported
        else "Not detected; verify only if the package is imported.",
        advisory=not imported
    )


def check_unit_sale_price(text):
    if UNIT_SALE.search(text):
        return _check("Unit Sale Price", True, f"Found: '{UNIT_SALE.search(text).group(0)}'", advisory=True)
    return _check("Unit Sale Price", False,
                  "Unit-sale-price format was not detected. Applicability depends on package quantity/category.",
                  advisory=True)


def check_fssai(text):
    m = FSSAI.search(text)

    return _check(
        "FSSAI License Number (food-product bonus check)",
        bool(m),
        "FSSAI label detected; number validation is not performed."
        if m else "FSSAI label not detected.",
        advisory=True
    )


def check_font_size(words):
    if not words:
        return _check("Font Size / Readability (heuristic)", False, "No OCR words available.", advisory=True)
    heights = [w["height_px"] for w in words if w.get("height_px", 0) > 0]
    if not heights:
        return _check("Font Size / Readability (heuristic)", False, "No measurable OCR boxes.", advisory=True)
    avg = sum(heights)/len(heights)
    # This is deliberately not a legal mm measurement.
    tiny = sum(h < 12 for h in heights)
    ratio = tiny/len(heights)
    return _check(
        "Font Size / Readability (heuristic)",
        ratio < .35,
        f"Average OCR box height ≈ {avg:.1f}px; {tiny}/{len(heights)} boxes are below 12px. "
        "This is only a visual screening proxy, not a calibrated legal font-size measurement.",
        advisory=True
    )


def run_compliance_check(ocr_result):
    text = ocr_result.get("text", "") or ""
    words = ocr_result.get("words", []) or ""

    checks = [
        check_manufacturer_details(text),
        check_net_quantity(text),
        check_mrp(text),
        check_mfg_date(text),
        check_consumer_care(text),
        check_country_of_origin(text),
        check_unit_sale_price(text),
        check_fssai(text),
        check_font_size(words),
    ]

    hard = [c for c in checks if not c.get("advisory")]
    violations = [c for c in hard if not c["pass"]]
    advisory_reviews = [
        c for c in checks
        if c.get("advisory") and not c["pass"]
    ]

    if violations:
        status = "NON_COMPLIANT"
    elif advisory_reviews:
        status = "REVIEW_REQUIRED"
    else:
        status = "COMPLIANT"

    # =====================================================
    # STRUCTURED EXTRACTION
    # =====================================================

    lot_number = extract_lot_number(text)
    net_quantity = extract_net_quantity(text)
    mrp = extract_mrp(text)
    manufacture_date = extract_manufacture_date(text)

    return {
        "ocr_text": text,
        "ocr_method": ocr_result.get("ocr_method"),

        "extracted": {
            "lot_number": lot_number,
            "net_quantity": net_quantity,
            "mrp": mrp,
            "manufacture_date": manufacture_date
        },

        "checks": checks,
        "status": status,
        "violations_count": len(violations),
        "review_count": len(advisory_reviews),
    }
def extract_manufacture_date(text):
    m = MFG_PATTERN.search(text)

    if not m:
        return None

    return m.group(1).strip()