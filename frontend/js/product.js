requireLogin();

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');
const card = document.getElementById('detailCard');

let currentProduct = null;
let editMode = false;

async function loadProduct() {
  if (!productId) {
    card.innerHTML = '<div class="error-box">No product ID provided.</div>';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/products/${productId}`, { headers: authHeaders() });
    if (!res.ok) {
      card.innerHTML = '<div class="error-box">Product not found.</div>';
      return;
    }
    currentProduct = await res.json();
    render(currentProduct);
  } catch (e) {
    card.innerHTML = '<div class="error-box">Could not reach backend.</div>';
  }
}

function render(product) {
  const result = product.result_json || {};
  const badgeClass = product.status === 'COMPLIANT' ? 'compliant' : 'non-compliant';
  const badgeLabel = product.status === 'COMPLIANT' ? '✅ COMPLIANT' : `❌ NON-COMPLIANT (${product.violations_count} issue${product.violations_count === 1 ? '' : 's'})`;

  const extracted = result.extracted || {};
  const mrp = extracted.mrp || {};
  const netQty = extracted.net_quantity || {};

  card.innerHTML = `
    ${editMode ? renderEditHeader(product) : renderViewHeader(product, badgeClass, badgeLabel)}

    <div style="margin: 16px 0;">
      ${(result.checks || []).map((c, i) => editMode ? renderEditCheckRow(c, i) : renderViewCheckRow(c)).join('')}
    </div>

    ${editMode ? renderEditExtracted(extracted, mrp, netQty) : renderViewExtracted(extracted, mrp, netQty)}
<div class="product-actions">
  ${editMode
    ? `
      <button
        class="btn btn-primary"
        type="button"
        onclick="saveEdits()"
      >
        💾 Save Changes
      </button>

      <button
        class="btn btn-secondary"
        type="button"
        onclick="cancelEdit()"
      >
        Cancel
      </button>
    `
    : `
      <button
        class="btn btn-primary"
        type="button"
        onclick="downloadReport(${product.id})"
      >
        ⬇ Download PDF Report
      </button>

      <button
        class="btn btn-secondary"
        type="button"
        onclick="downloadJsonReport(${product.id})"
      >
        ⬇ Export JSON
      </button>

      <button
        class="btn btn-secondary"
        type="button"
        onclick="toggleEdit()"
      >
        ✏ Edit
      </button>
    `
  }
</div>

 <details class="ocr-panel">

  <summary class="ocr-summary">
    <div class="ocr-summary-content">
      <div class="ocr-icon">⌕</div>

      <div>
        <div class="ocr-title">Raw OCR Text</div>
        <div class="ocr-subtitle">
          View the original text extracted from the product label
        </div>
      </div>
    </div>

    <span class="ocr-arrow">⌄</span>
  </summary>

  <div class="ocr-content">
    <div class="ocr-text-box">
      ${(product.ocr_text || '').replace(/</g, '&lt;')}
    </div>
  </div>

</details>
  `;
}

function renderViewHeader(product, badgeClass, badgeLabel) {
  return `
    <div class="product-header">

      <div class="product-header-top">

        <div class="product-title-group">
          <h2 class="product-title">
            ${product.product_name || 'Untitled Product'}
          </h2>

          <span class="product-id">
            #${product.id}
          </span>
        </div>

        <span class="status-badge ${badgeClass}">
          ${badgeLabel}
        </span>

      </div>

      <div class="product-meta">
        Scanned at ${new Date(product.scanned_at).toLocaleString()}
        <span class="meta-separator">•</span>
        by ${product.scanned_by}
      </div>

    </div>
  `;
}

function renderEditHeader(product) {
  return `
    <div class="edit-header">

      <label class="form-label" for="editProductName">
        Product Name
      </label>

      <input
        id="editProductName"
        class="form-input product-name-input"
        type="text"
        value="${(product.product_name || '').replace(/"/g, '&quot;')}"
      />

      <p class="edit-meta">
        Scan #${product.id} — status will recalculate automatically on save
      </p>

    </div>
  `;
}

function renderViewCheckRow(c) {
  return `
    <div class="check-row">
      <div class="check-icon ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✔' : '✘'}</div>
      <div class="check-text">
        <div class="rule">${c.rule}${c.advisory ? ' <span style="color:#999; font-weight:400;">(advisory)</span>' : ''}</div>
        <div class="detail">${c.detail}</div>
      </div>
    </div>`;
}

function renderEditCheckRow(c, i) {
  return `
    <div class="check-row edit-check-row">

      <div class="edit-status-control">
        <label class="form-label" for="editPass_${i}">
          Status
        </label>

        <select id="editPass_${i}" class="form-input form-select">
          <option value="true" ${c.pass ? 'selected' : ''}>PASS</option>
          <option value="false" ${!c.pass ? 'selected' : ''}>FAIL</option>
        </select>
      </div>

      <div class="check-text edit-detail-area">

        <div class="rule">
          ${c.rule}${c.advisory ? ' <span class="advisory-label">(advisory)</span>' : ''}
        </div>

        <label class="form-label detail-label" for="editDetail_${i}">
          Details
        </label>

        <textarea
          id="editDetail_${i}"
          class="form-input form-textarea"
          rows="3"
        >${c.detail}</textarea>

      </div>

    </div>
  `;
}

function renderViewExtracted(extracted, mrp, netQty) {
  return `
    <section class="extracted-panel">

      <div class="section-heading">
        <div>
          <h3>Extracted Fields</h3>
          <p>Information detected from the scanned product label</p>
        </div>
      </div>

      <div class="extracted-grid">

        <div class="extracted-field">
          <span class="field-label">Lot / Batch Number</span>
          <span class="field-value">
            ${extracted.lot_number || '—'}
          </span>
        </div>

        <div class="extracted-field">
          <span class="field-label">MRP</span>
          <span class="field-value">
            ${mrp.value != null ? '₹' + mrp.value : '—'}
          </span>
        </div>

        <div class="extracted-field">
          <span class="field-label">Net Quantity</span>
          <span class="field-value">
            ${netQty.value != null ? netQty.value + ' ' + (netQty.unit || '') : '—'}
          </span>
        </div>

        <div class="extracted-field">
          <span class="field-label">Manufacture Date</span>
          <span class="field-value">
            ${extracted.manufacture_date || '—'}
          </span>
        </div>

      </div>

    </section>
  `;
}

function renderEditExtracted(extracted, mrp, netQty) {
  return `
    <section class="extracted-panel edit-extracted-panel">

      <div class="section-heading">
        <div>
          <h3>Extracted Fields</h3>
          <p>Edit the information detected from the product label</p>
        </div>
      </div>

      <div class="extracted-grid edit-extracted-grid">

        <div class="extracted-field edit-field">
          <label class="form-label" for="editLot">
            Lot / Batch Number
          </label>

          <input
            id="editLot"
            class="form-input"
            type="text"
            value="${(extracted.lot_number || '').replace(/"/g, '&quot;')}"
          />
        </div>

        <div class="extracted-field edit-field">
          <label class="form-label" for="editMrp">
            MRP (₹)
          </label>

          <input
            id="editMrp"
            class="form-input"
            type="number"
            step="0.01"
            value="${mrp.value != null ? mrp.value : ''}"
          />
        </div>

        <div class="extracted-field edit-field">
          <label class="form-label" for="editNetQtyValue">
            Net Quantity
          </label>

          <div class="quantity-input-group">
            <input
              id="editNetQtyValue"
              class="form-input"
              type="number"
              step="0.01"
              value="${netQty.value != null ? netQty.value : ''}"
            />

            <input
              id="editNetQtyUnit"
              class="form-input quantity-unit"
              type="text"
              placeholder="g / ml / kg"
              value="${netQty.unit || ''}"
            />
          </div>
        </div>

        <div class="extracted-field edit-field">
          <label class="form-label" for="editMfgDate">
            Manufacture Date
          </label>

          <input
            id="editMfgDate"
            class="form-input"
            type="text"
            value="${(extracted.manufacture_date || '').replace(/"/g, '&quot;')}"
          />
        </div>

      </div>

      <p class="edit-note">
        Manufacturer verification cross-check is not editable — it reflects
        the registered lot database independently.
      </p>

    </section>
  `;
}


function toggleEdit() {
  editMode = true;
  render(currentProduct);
}

function cancelEdit() {
  editMode = false;
  render(currentProduct);
}

async function saveEdits() {
  const result = currentProduct.result_json || {};
  const checks = (result.checks || []).map((c, i) => ({
    pass: document.getElementById(`editPass_${i}`).value === 'true',
    detail: document.getElementById(`editDetail_${i}`).value
  }));

  const payload = {
    productName: document.getElementById('editProductName').value,
    checks,
    extracted: {
      lot_number: document.getElementById('editLot').value,
      manufacture_date: document.getElementById('editMfgDate').value,
      mrp: { value: document.getElementById('editMrp').value },
      net_quantity: {
        value: document.getElementById('editNetQtyValue').value,
        unit: document.getElementById('editNetQtyUnit').value
      }
    }
  };

  try {
    const res = await fetch(`${API_BASE}/products/${currentProduct.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      alert('Save failed. Please try again.');
      return;
    }
    editMode = false;
    await loadProduct(); // reload fresh data from server
  } catch (e) {
    alert('Could not reach backend to save changes.');
  }
}

async function downloadReport(id) {
  const res = await fetch(`${API_BASE}/products/${id}/report`, { headers: authHeaders() });
  if (!res.ok) {
    alert('Could not download report. Please try again.');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compliance-report-${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadJsonReport(id) {
  const res = await fetch(`${API_BASE}/products/${id}/export/json`, { headers: authHeaders() });
  if (!res.ok) {
    alert('Could not export JSON. Please try again.');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scan-${id}-report.json`;
  a.click();
  URL.revokeObjectURL(url);
}

loadProduct();