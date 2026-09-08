# Legal Metrology Compliance Checker

Software system to check compliance of packaged commodities under the
Legal Metrology (Packaged Commodities) Rules, 2011 — by scanning product
label images and validating mandatory declarations.

## Architecture

```
frontend/         Plain HTML/CSS/JS — upload page, product detail/report page, dashboard
backend/           Node.js + Express — API, SQLite storage, PDF report generation
  src/
    app.js          Express app setup (middleware + routes) — no listen()
    server.js        Entry point — imports app.js, starts listening on PORT (default 3000)
    routes/          Route definitions
    controllers/      Request handlers
    services/         External calls (Python OCR service) + PDF report generation
    middleware/       Upload (multer) + role-check auth stub
    db/              SQLite connection/schema
  uploads/           Uploaded label images (runtime data, not code)
  reports/           Generated PDF reports (runtime data)
  data/              database.sqlite (runtime data)
ocr-service/       Python + Flask — OCR (Tesseract) + rule-based compliance engine
```

Flow: Browser uploads image -> Node backend -> forwards image to Python OCR
service -> Python extracts text + estimates font sizes + runs Legal
Metrology rule checks -> returns JSON verdict -> Node saves to SQLite and
generates a PDF report -> Frontend shows result + dashboard.

## Rules implemented (MVP, see ocr-service/rules_engine.py to extend)

1. Manufacturer/Packer/Importer name & address present
2. Net quantity present (with unit: g/kg/ml/l/pieces etc.)
3. MRP present (with "inclusive of all taxes" style wording)
4. Month & Year of manufacture/packing/import present
5. Consumer care details present (phone/email/address keyword + pattern)
6. Country of origin present (flagged, not hard-failed — only mandatory for imports)
7. Minimum font size heuristic for net quantity declaration (Rule 6, based on
   package/label area — approximate, using OCR bounding-box height as proxy)

## Setup

### 1. OCR microservice (Python)
```bash
cd ocr-service
pip install -r requirements.txt --break-system-packages
python app.py          # runs on http://localhost:5001
```
Requires `tesseract-ocr` installed on the system (`sudo apt-get install tesseract-ocr`).

### 2. Backend (Node.js)
Requires **Node.js 22.5+** (ideally 22.5+ / 23.4+ / any 24.x) — the backend uses
Node's built-in `node:sqlite` module, so there's no native module compilation
step (no Visual Studio Build Tools / node-gyp needed on Windows).
```bash
cd backend
npm install
npm start               # runs on http://localhost:3000
```
You may see `ExperimentalWarning: SQLite is an experimental feature` in the
console — that's expected and harmless, not an error.

### 3. Frontend
Just open `frontend/index.html` in a browser, or serve it:
```bash
cd frontend
python -m http.server 8080
```
Then visit http://localhost:8080

## API Endpoints (backend)

- `POST /api/scan` — multipart form, field `image`, optional `productName` → runs OCR + compliance check, saves record, returns result JSON
- `GET /api/products` — list all scanned products (for dashboard)
- `GET /api/products/:id` — get one product's full result
- `GET /api/products/:id/report` — download PDF compliance report
- `GET /api/dashboard/stats` — summary counts for dashboard cards

## Extending for the full hackathon submission

- Swap Tesseract for Google Vision / AWS Textract for better accuracy
- Add proper auth (JWT) — stub is in `backend/src/middleware/auth.js`
- Add more rules (placement/"single field of vision" needs layout/bounding-box
  clustering, unit-standardization checks e.g. must be in g/kg not "approx 1kg")
- Add user roles (Enforcement Officer / Admin) — schema already has a `role` column stub
