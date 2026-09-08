requireLogin(); // redirect to login.html if not authenticated — ADD as very first line

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');
const card = document.getElementById('detailCard');

async function loadProduct() {
  if (!productId) {
    card.innerHTML = '<div class="error-box">No product ID provided.</div>';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/products/${productId}`, { headers: authHeaders() }); // CHANGED
    if (!res.ok) {
      card.innerHTML = '<div class="error-box">Product not found.</div>';
      return;
    }
    const product = await res.json();
    render(product);
  } catch (e) {
    card.innerHTML = '<div class="error-box">Could not reach backend.</div>';
  }
}

function render(product) {
  const result = product.result_json || {};
  const badgeClass = product.status === 'COMPLIANT' ? 'compliant' : 'non-compliant';
  const badgeLabel = product.status === 'COMPLIANT' ? '✅ COMPLIANT' : `❌ NON-COMPLIANT (${product.violations_count} issue${product.violations_count === 1 ? '' : 's'})`;

  let checksHtml = '';
  (result.checks || []).forEach((c) => {
    checksHtml += `
      <div class="check-row">
        <div class="check-icon ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✔' : '✘'}</div>
        <div class="check-text">
          <div class="rule">${c.rule}${c.advisory ? ' <span style="color:#999; font-weight:400;">(advisory)</span>' : ''}</div>
          <div class="detail">${c.detail}</div>
        </div>
      </div>`;
  });

  card.innerHTML = `
    <h2>${product.product_name || 'Untitled Product'} <span style="color:#999; font-weight:400; font-size:15px;">#${product.id}</span></h2>
    <p style="color:#6b7280; font-size:13px;">Scanned at ${new Date(product.scanned_at).toLocaleString()} by ${product.scanned_by}</p>
    <p><span class="status-badge ${badgeClass}">${badgeLabel}</span></p>
    <div style="margin: 16px 0;">${checksHtml}</div>
    <button class="btn" type="button" onclick="downloadReport(${product.id})">⬇ Download PDF Report</button>
    <details style="margin-top:18px;">
      <summary style="cursor:pointer; font-size:13px; color:#6b7280;">Show raw OCR text</summary>
      <div class="ocr-text-box">${(product.ocr_text || '').replace(/</g, '&lt;')}</div>
    </details>
  `;
}

loadProduct();