# METROSCAN
### Automated Legal Metrology Compliance Checker for Packaged Commodities

**Technical Documentation — Software Architecture & Deployment Framework**

Problem Statement ID: 26034
*Software System to check compliance of Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011 by scanning products, images and labels.*

---

## 1. Executive Summary

METROSCAN is a decision-support system that automates the screening of packaged-commodity labels against the mandatory declarations prescribed under the **Legal Metrology Act, 2009** and the **Legal Metrology (Packaged Commodities) Rules, 2011**. An officer uploads a photograph of a product label; the system performs OCR extraction, runs the extracted text through a rule engine encoding the mandatory declarations, and returns a structured, evidence-backed compliance verdict — along with a downloadable PDF report and a searchable scan history.

Beyond baseline label screening, METROSCAN implements a second, original layer: **Manufacturer Declaration Verification**. Manufacturers register the authoritative values (net quantity, MRP, etc.) for a given lot/batch in advance; when an officer scans a physical unit from that lot, the system cross-checks the scanned label against the registered declaration and flags **value-level mismatches** — not just missing fields. This distinguishes METROSCAN from a standard barcode/database lookup tool, which can only confirm that a product *exists* in a catalogue, not that the *physical label in an officer's hand* matches what was declared.

This document exists to satisfy the Expected Solution requirement: *"Technical documentation describing software architecture and deployment framework."*

---

## 2. Problem Statement Coverage Matrix

| # | Requirement (as stated in problem statement) | Status | Where implemented |
|---|---|---|---|
| 1 | Scanning and analyzing images of packaged commodities | ✅ Done | `ocr-service/ocr_engine.py` |
| 2 | Detecting mandatory declarations prescribed under Legal Metrology rules | ✅ Done | `ocr-service/rules_engine.py` |
| 3 | Checking correctness and completeness of declarations | ✅ Done | Hard/advisory rule split, §5 |
| 4 | Checking **placement** of declarations | ⚠️ Deferred | See §8 (Known Limitations) |
| 5 | Identifying missing or non-compliant declarations | ✅ Done | `checks[]` array, per-rule pass/fail |
| 6 | Checking readability and font-size requirements | ✅ Done (heuristic) | `check_font_size()`, OCR bounding-box heights |
| 7 | Generating compliance reports and violation summaries | ✅ Done | `services/reportGenerator.js` (PDF) |
| 8 | Maintaining a repository of scanned products and compliance history | ✅ Done | SQLite `products` table + dashboard |
| 9 | Providing dashboards for enforcement officials | ✅ Done | `dashboard.html` |
| 10 | Automated extraction and validation of mandatory declarations | ✅ Done | Full pipeline, §4 |
| 11 | Rule-based compliance checking for LM (Packaged Commodities) Rules, 2011 | ✅ Done | `rules_engine.py` |
| 12 | Generation of digital compliance reports (PDF **and editable formats**) | ⚠️ Partial | PDF done; editable export — see §8 |
| 13 | Dashboard for monitoring inspections, violations, compliance details | ✅ Done | Stats cards, filters, CSV export |
| 14 | Search and retrieval of previously scanned products/reports | ✅ Done | Dashboard search + status filter |
| 15 | Technical documentation of architecture & deployment framework | ✅ Done | This document |
| 16 | Image upload and product scanning functionality | ✅ Done | `index.html` + Multer |
| 17 | Extraction of declarations and detection of mandatory fields | ✅ Done | §5 |
| 18 | Font size and readability analysis | ✅ Done (advisory heuristic) | §5.9 |
| 19 | Detection of missing, misleading, or non-standard declarations | ✅ Done | §5 |
| 20 | Generation of compliance/non-compliance reports | ✅ Done | §6 |
| 21 | Attachment of photographs and supporting evidence | ✅ Done | Label image embedded in PDF |
| 22 | Repository of scanned products and inspection history | ✅ Done | §7 |
| 23 | Role-based user access and secure authentication | ⚠️ Partial | Officer/Admin auth done; Manufacturer role deferred, see §8 |
| 24 | Dashboard for monitoring compliance status and enforcement activity | ✅ Done | §7 |
| 25 | Export of reports to PDF and editable formats | ⚠️ Partial | Same as #12 |

**Beyond the stated requirements:** Manufacturer Declaration Verification (§6.4) is an original addition, not requested in the problem statement, built to strengthen the system's real-world defensibility against label tampering and fraudulent declarations.

Every gap above is addressed honestly in **§8 — Known Limitations & Future Scope**, rather than concealed. This is a deliberate design stance: a screening tool that clearly states what it does *not* yet verify is more trustworthy to an enforcement audience than one that silently overclaims.

---

## 3. System Architecture

### 3.1 High-Level Component Diagram

```
                         ┌─────────────────────────┐
                         │        FRONTEND          │
                         │  HTML / CSS / vanilla JS  │
                         │  (index, dashboard,       │
                         │   product, manufacturer)  │
                         └────────────┬──────────────┘
                                      │ REST (JSON / multipart)
                                      ▼
                         ┌─────────────────────────┐
                         │   NODE.JS + EXPRESS       │
                         │        BACKEND            │
                         │  (orchestration layer)    │
                         │                            │
                         │  Routes → Controllers →    │
                         │  Services → DB             │
                         └──┬──────────────┬──────────┘
                            │              │
              image (multipart/form-data) │  SQL
                            ▼              ▼
                ┌───────────────────┐   ┌─────────────────┐
                │  PYTHON OCR/RULES  │   │  SQLite (node:   │
                │  MICROSERVICE      │   │  sqlite)         │
                │  Flask :5001       │   │  products,       │
                │                    │   │  users,          │
                │  Tesseract OCR →   │   │  manufacturer_   │
                │  rules_engine.py   │   │  lots            │
                └───────────────────┘   └─────────────────┘
                            │
                            ▼
                ┌───────────────────┐
                │  PDFKit report      │
                │  generator           │
                │  (Node side)          │
                └───────────────────┘
```

### 3.2 Design Principles

- **Separation of concerns by language boundary, not convenience.** OCR and legal rule logic live entirely in Python (`ocr-service/`); orchestration, persistence, and reporting live entirely in Node (`backend/`). Compliance logic was deliberately *not* moved into Node during development, even under time pressure, to avoid duplicating legal-rule logic across two languages.
- **Hard vs. Advisory classification is a first-class architectural concept**, not a UI afterthought. Every rule in `rules_engine.py` is tagged `advisory: true/false`. Only hard-check failures affect `violations_count` and can produce a `NON_COMPLIANT` verdict; advisory failures produce `REVIEW_REQUIRED`. This mirrors real enforcement practice, where some declarations (e.g. Unit Sale Price, Country of Origin) are only conditionally applicable and should prompt manual review rather than an automatic violation.
- **Screening tool, not adjudicator.** Every report and UI surface states that this is a decision-support system; final compliance determination rests with an authorized officer. This is stated explicitly in the rule engine's module docstring and repeated on every generated PDF.
- **Additive, non-breaking feature layering.** The Manufacturer Verification layer (§6.4) was built so that its complete absence (no lot registered, no lot number readable) degrades gracefully to `UNVERIFIED` without altering the regulatory compliance verdict in any way. Step 1 (regulatory scan) works standalone; Step 2 (manufacturer cross-check) is strictly optional and additive.

---

## 4. End-to-End Pipeline Flow

```
1. Officer uploads a label image on index.html
2. POST /api/scan  (multipart/form-data, field: image)
3. Multer saves the file to backend/uploads/
4. scanController.js calls pythonService.js → POST http://localhost:5001/analyze
5. Flask (app.py) receives the image, saves it temporarily
6. ocr_engine.py runs Tesseract OCR
      → soft preprocessing pipeline (upscale + CLAHE + bilateral filter,
        no binarization — chosen after adaptive thresholding failed on
        curved/glossy real-world packaging)
      → returns { text, words[] (with bounding-box heights), ocr_method }
7. rules_engine.py: run_compliance_check(ocr_result)
      → runs 9 rule checks (7 mandatory + FSSAI + font-size, see §5)
      → separates hard vs advisory checks
      → computes status: COMPLIANT | REVIEW_REQUIRED | NON_COMPLIANT
      → performs structured extraction: lot_number, net_quantity,
        mrp, manufacture_date
8. Flask returns the full JSON result to Node; temp file deleted
9. scanController.js (Node):
      a. looks up analysis.extracted.lot_number in manufacturer_lots
      b. verificationService.js compares registered vs scanned values
         (unit-normalized — e.g. "1 L" and "1000 mL" are recognised
         as equal rather than string-compared)
      c. produces manufacturerVerification:
         VERIFIED | MISMATCH | UNREGISTERED | UNVERIFIED
10. Result persisted to SQLite: products table (status, violations_count,
    ocr_text, result_json — which carries both the regulatory checks and
    the manufacturer verification object)
11. reportGenerator.js pre-generates a PDF (regulatory checklist +
    violations summary + manufacturer verification + embedded label
    photo + raw OCR text) and stores its path
12. JSON response returned to frontend; upload.js renders both the
    Regulatory Compliance card and the Manufacturer Verification card
```

### 4.1 Manufacturer Registration Flow (parallel, independent entry point)

```
1. Manufacturer opens manufacturer.html
2. Registers a lot: lot number + authoritative declared values
   (net quantity, MRP, manufacture date, address, etc.)
3. POST /api/manufacturer/lots → manufacturerController.js
   → INSERT into manufacturer_lots (UNIQUE constraint on lot_number
     prevents duplicate registration)
4. This registry is what Step 9 above reads from at scan time.
```

---

## 5. Rule Engine — Compliance Logic

Location: `ocr-service/rules_engine.py`

### 5.1 Design Principle
> "A missing declaration is FAIL only when the rule is applicable. Uncertain / commodity-dependent checks are REVIEW / advisory instead of being silently treated as compliant — or as a hard legal violation."

### 5.2 Status Computation

```python
hard = [c for c in checks if not c["advisory"]]
violations = [c for c in hard if not c["pass"]]
advisory_reviews = [c for c in checks if c["advisory"] and not c["pass"]]

if violations:            status = "NON_COMPLIANT"
elif advisory_reviews:    status = "REVIEW_REQUIRED"
else:                     status = "COMPLIANT"
```

`violations_count` counts **only hard violations** — advisory issues are tracked separately as `review_count` and never inflate the headline violation number.

### 5.3 The Nine Checks

| Check | Type | Notes |
|---|---|---|
| Manufacturer/Packer/Importer Name & Address | Hard | Requires responsible-entity wording (*Mfg. By, Packed by, Marketed by...*) **and** an address/PIN signal — address alone is insufficient |
| Net Quantity Declaration | Hard, with advisory fallback | Requires `net` prefix + unit to hard-pass (prevents nutritional values like "Sugar: 5.20g" from being misread as net quantity). If a label + number is found but the unit was not reliably OCR'd, this degrades to an **advisory review** rather than a hard failure |
| Maximum Retail Price (MRP) | Hard (tax-inclusivity is advisory) | Proximity-based amount matching near the MRP label — prevents PIN codes/phone numbers from being falsely matched as price |
| Manufacture/Packing Date | Hard | |
| Consumer Care Details | Hard | Label wording, or phone/email pattern as fallback |
| Country of Origin | Advisory | Only relevant for imported goods; not penalized for domestic products |
| Unit Sale Price | Advisory | Applicability depends on package category/quantity |
| FSSAI License Number | Advisory | **Presence-only** check — the license number's digit count/format is deliberately **not** validated, since that validation is outside this system's authority and scope |
| Font Size / Readability | Advisory | Heuristic based on OCR bounding-box height; explicitly documented as *not* a calibrated legal font-size measurement |

### 5.4 OCR-Noise Resilience
Real product photographs produce garbled and inconsistent OCR text (e.g. "MRP" misread as "MIP", underscore artifacts around dates). Regex patterns in `rules_engine.py` include fuzzy tolerance and proximity-based matching (rather than global pattern search) specifically to survive this noise without producing false positives.

---

## 6. Compliance Result & Reporting

### 6.1 Three-State Verdict
Unlike a binary pass/fail tool, METROSCAN surfaces three distinct states end-to-end (rule engine → API → frontend badge → PDF):

- ✅ **COMPLIANT** — all hard checks pass, no advisory reviews
- ⚠️ **REVIEW_REQUIRED** — no hard violations, but one or more advisory checks need manual verification
- ❌ **NON_COMPLIANT** — at least one hard violation

### 6.2 API Response Shape (`POST /api/scan`)
```json
{
  "id": 33,
  "productName": "...",
  "status": "REVIEW_REQUIRED",
  "violationsCount": 0,
  "reviewCount": 3,
  "checks": [ { "rule": "...", "pass": true, "advisory": false, "detail": "..." }, ... ],
  "ocrText": "...",
  "scannedAt": "...",
  "manufacturerVerification": { "status": "VERIFIED", "lotNumber": "...", "comparable": ["mrp"], "mismatches": [] }
}
```

### 6.3 PDF Report Contents
Generated via PDFKit (`services/reportGenerator.js`), pre-generated at scan time for instant download:
- Product/scan metadata + embedded label photo (evidence)
- Full declaration checklist with PASS/FAIL colour coding
- Violations summary (hard violations only)
- **Manufacturer Verification section** (see §6.4)
- Raw extracted OCR text (for transparency and legal defensibility — an officer can see exactly what the system read, not just its conclusion)
- Disclaimer: system output is a screening aid, not a final legal determination

### 6.4 Manufacturer Declaration Verification — the core differentiator
A separate, additive verification layer compares OCR-scanned values against a manufacturer-registered authoritative record for the same lot/batch number.

**Why this matters:** A barcode/database lookup only confirms a product *exists* in a catalogue. It cannot detect a genuine label whose printed values don't match what the manufacturer actually declared for that batch (mislabelling, tampering, or printing error). METROSCAN's OCR-based approach reads the *physical* label in front of the officer and checks it against the authoritative record — closing that gap.

**States:**
| State | Meaning |
|---|---|
| `VERIFIED` | Lot found in registry; all comparable fields match |
| `MISMATCH` | Lot found; one or more fields differ from the registered declaration |
| `UNREGISTERED` | A lot number was read from the label, but no matching registration exists |
| `UNVERIFIED` | No lot number could be reliably read from the label |

**Unit-safe comparison:** Values are normalized before comparison — mass to grams, volume to millilitres, price to a plain numeric amount — so that `"1 L"` (registered) and `"1000 mL"` (scanned) are correctly recognised as equal rather than flagged as a false mismatch from naive string comparison.

**Transparency over false confidence:** The response and report both explicitly list which fields were actually comparable (`comparable: ["mrp"]`). If OCR could not reliably extract a field's unit (a known, disclosed limitation — see §8), that field is silently excluded from comparison rather than either falsely failing or falsely passing it. A `VERIFIED` result means *"every field that could be reliably read matches,"* not *"every field was checked."*

---

## 7. Data Model & Persistence

**Database:** SQLite via `node:sqlite` (chosen over `better-sqlite3` specifically to avoid native-module build failures on Windows development machines — a pragmatic hackathon-timeline decision).

```sql
products (
  id, product_name, image_path, scanned_at, status,
  violations_count, ocr_text, result_json, report_path,
  scanned_by, role
)

users (
  id, username, password_hash, display_name, role   -- ADMIN | ENFORCEMENT_OFFICER
)

manufacturer_lots (
  id, lot_number UNIQUE, product_name, manufacturer_name,
  manufacturer_address, net_quantity, mrp, manufacture_date,
  consumer_care, country_of_origin, created_at, created_by
)
```

`result_json` stores the complete analysis object (checks, extracted fields, and manufacturer verification) as a single JSON blob, keeping the schema simple while remaining fully queryable at the application layer — a deliberate trade-off favouring iteration speed within the hackathon timeline over normalized storage, revisited in §8.

---

## 8. Known Limitations & Future Scope

Stated plainly, in keeping with the project's honesty-over-overclaiming principle:

| Limitation | Why | Planned resolution |
|---|---|---|
| **Placement/positional compliance not checked** | Requires bounding-box-level layout analysis per declaration, not just presence detection; explicitly deferred to keep the core pipeline stable within the hackathon timeline | Bounding-box zone mapping per declaration type |
| **Editable-format report export not yet implemented** | Time-prioritized after PDF, which is the primary evidentiary artifact | JSON/DOCX export endpoint alongside existing PDF generation |
| **Manufacturer-role authentication not yet enforced** | Registration endpoints are intentionally open during development to de-risk the verification-logic build; officer/admin authentication is already fully enforced | Add `MANUFACTURER` role to existing JWT role middleware (`requireRole`), already scaffolded on the update route |
| **Unit-less OCR reads reduce verification coverage** | Some packaging prints units in small/stylised fonts that Tesseract occasionally drops (e.g. "120g" read as "120") | Targeted OCR post-processing for quantity fields; system already degrades this gracefully to an advisory review rather than a false pass/fail |
| **Text-based fields (consumer care, country of origin) excluded from manufacturer verification** | Fuzzy text matching on OCR-noisy strings risks false mismatches, which is worse for officer trust than a narrower but reliable check | Extend verification to text fields once a validated fuzzy-matching threshold is established |
| **Database not versioned/audited at the row level** | Simple schema prioritized for hackathon delivery timeline | Add change history table if moved beyond demo stage |
| **No confirmed MRP ground-truth source independent of the manufacturer's own registration** | A manufacturer could, in principle, register incorrect data; there is no independent authority to cross-check against within the scope of this system | Proposed: cross-batch statistical consistency checks, e-commerce reference-price sampling, or integration with an external manufacturer-registry authority |

None of these limitations affect the stability of the core scanning pipeline; each was a deliberate scope decision to protect delivery of a working, demo-ready system over a broader but less reliable one.

---

## 9. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | HTML / CSS / vanilla JavaScript | No build step; fastest iteration for a hackathon timeline |
| Backend | Node.js + Express | Lightweight orchestration layer |
| Backend DB access | `node:sqlite` (built-in) | Avoids native-module compilation issues on Windows |
| File upload | Multer | Standard multipart handling |
| PDF generation | PDFKit | Direct programmatic PDF construction, no template engine overhead |
| OCR service | Python + Flask + Flask-CORS | Isolates OCR/legal-rule logic from orchestration layer |
| OCR engine | Tesseract + pytesseract | Open-source, no external API dependency/cost |
| Image preprocessing | OpenCV (upscale, CLAHE, bilateral filter) | Tuned specifically for curved/glossy real-world packaging after binarization approaches failed |

---

## 10. Deployment Framework

| Component | Target platform | Notes |
|---|---|---|
| Backend (Node/Express) | Render | Stateless service; SQLite file persisted on a mounted disk (or migrated to a managed Postgres instance if moving beyond demo scale) |
| OCR microservice (Python/Flask) | Render | Deployed as a separate service; requires a Tesseract binary available in the build environment |
| Frontend (static HTML/CSS/JS) | Firebase Hosting | Static asset hosting; API base URL configured via `js/config.js` |

**Environment separation:** The Node backend and Python OCR service are deployed as two independent services communicating over HTTPS (mirroring the local `localhost:5001` relationship), preserving the same architectural boundary in production as in development — no logic is moved between layers for deployment convenience.

**Current status:** Architecture is deployment-ready as designed; live deployment is being finalized. The Node → Python service URL is the only environment-specific configuration required to move from local development to the hosted environment.

---

## 11. Summary

METROSCAN implements the full mandatory pipeline requested by the problem statement — image-based scanning, mandatory-declaration detection, rule-based compliance checking, PDF reporting, and an enforcement dashboard — with a deliberately conservative hard/advisory classification model that avoids both false compliance and false violation. It extends beyond the stated requirements with an original Manufacturer Declaration Verification layer that distinguishes label *presence* checking from label *correctness* checking against an authoritative source, directly addressing a class of fraud (mislabelling, tampering) that a barcode-lookup system cannot detect. Known gaps are documented explicitly rather than concealed, consistent with the system's role as a screening aid to authorized enforcement officers rather than a final legal determination.
