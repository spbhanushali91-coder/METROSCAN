requireLogin();
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const dropText = document.getElementById('dropText');
const scanBtn = document.getElementById('scanBtn');
const errorBox = document.getElementById('errorBox');
const loadingBox = document.getElementById('loadingBox');
const resultCard = document.getElementById('resultCard');
const resultContent = document.getElementById('resultContent');

let selectedFile = null;

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showError('Please select an image file.');
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.style.display = 'block';
    dropText.textContent = file.name;
  };
  reader.readAsDataURL(file);
  scanBtn.disabled = false;
  errorBox.innerHTML = '';
}

function showError(msg) {
  errorBox.innerHTML = `<div class="error-box">${msg}</div>`;
}

scanBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  errorBox.innerHTML = '';
  resultCard.style.display = 'none';
  loadingBox.style.display = 'block';
  scanBtn.disabled = true;

  const formData = new FormData();
  formData.append('image', selectedFile);
  formData.append('productName', document.getElementById('productName').value);

  try {
    const res = await fetch(`${API_BASE}/scan`, {
      method: 'POST',
       headers: authHeaders(),
      body: formData
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Scan failed');
      return;
    }

    renderResult(data);
  } catch (err) {
    showError('Could not reach backend. Is it running on ' + API_BASE + ' ?');
  } finally {
    loadingBox.style.display = 'none';
    scanBtn.disabled = false;
  }
});


function renderManufacturerVerification(mv) {
  if (!mv) return '';

  const statusConfig = {
    VERIFIED:     { icon: '✅', label: 'VERIFIED', cls: 'mv-verified' },
    MISMATCH:     { icon: '⚠️', label: 'MISMATCH', cls: 'mv-mismatch' },
    UNREGISTERED: { icon: '⛔', label: 'LOT NOT REGISTERED', cls: 'mv-unregistered' },
    UNVERIFIED:   { icon: '—', label: 'UNVERIFIED', cls: 'mv-unverified' }
  };
  const cfg = statusConfig[mv.status] || statusConfig.UNVERIFIED;

  let body = '';

  if (mv.status === 'VERIFIED' || mv.status === 'MISMATCH') {
    const fieldLabels = { netQuantity: 'Net Quantity', mrp: 'MRP' };
    const checked = (mv.comparable || []).map(f => fieldLabels[f] || f);

    body += `<p style="font-size:13px; color:#6b7280; margin:4px 0;">
      Lot: <strong>${mv.lotNumber}</strong> — Registered to: ${mv.registered?.manufacturerName || '—'}
    </p>`;

    if (checked.length) {
      body += `<p style="font-size:12px; color:#6b7280;">Fields cross-checked: ${checked.join(', ')}</p>`;
    } else {
      body += `<p style="font-size:12px; color:#b45309;">No comparable fields could be read reliably from the scan.</p>`;
    }

    if (mv.mismatches && mv.mismatches.length) {
      body += `<table style="width:100%; margin-top:8px; font-size:13px; border-collapse:collapse;">
        <tr style="text-align:left; color:#6b7280;"><th>Field</th><th>Registered</th><th>Scanned</th></tr>
        ${mv.mismatches.map(m => `
          <tr>
            <td>${m.field}</td>
            <td>${m.registered}</td>
            <td style="color:#dc2626; font-weight:600;">${m.scanned}</td>
          </tr>`).join('')}
      </table>`;
    }
  } else if (mv.status === 'UNREGISTERED') {
    body += `<p style="font-size:13px; color:#6b7280;">Lot <strong>${mv.lotNumber}</strong> ${mv.note}</p>`;
  } else {
    body += `<p style="font-size:13px; color:#6b7280;">${mv.note || 'Lot/batch number was not detected on the scanned label.'}</p>`;
  }

  return `
    <div class="card" style="margin-top:16px; border-left: 4px solid var(--accent, #6366f1);">
      <h3 style="margin-top:0;">${cfg.icon} Manufacturer Verification: ${cfg.label}</h3>
      ${body}
    </div>
  `;
}

function renderResult(data) {
  let badgeClass, badgeLabel;

  if (data.status === 'COMPLIANT') {
    badgeClass = 'compliant';
    badgeLabel = '✅ COMPLIANT';
  } else if (data.status === 'REVIEW_REQUIRED') {
    badgeClass = 'review';
    badgeLabel = `⚠️ REVIEW REQUIRED (${data.reviewCount ?? 0} to verify)`;
  } else {
    badgeClass = 'non-compliant';
    badgeLabel = `❌ NON-COMPLIANT (${data.violationsCount} issue${data.violationsCount === 1 ? '' : 's'})`;
  }
  let checksHtml = '';
  (data.checks || []).forEach((c) => {
    checksHtml += `
      <div class="check-row">
        <div class="check-icon ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✔' : '✘'}</div>
        <div class="check-text">
          <div class="rule">${c.rule}${c.advisory ? ' <span style="color:#999; font-weight:400;">(advisory)</span>' : ''}</div>
          <div class="detail">${c.detail}</div>
        </div>
      </div>`;
  });

resultContent.innerHTML = `
  <p><span class="status-badge ${badgeClass}">${badgeLabel}</span></p>
  <div style="margin: 16px 0;">${checksHtml}</div>
  <div style="margin-top: 16px;">
    <button class="btn" type="button" onclick="downloadReport(${data.id})">⬇ Download PDF Report</button>
    <a class="btn secondary" style="text-decoration:none; display:inline-block; margin-left:10px;" href="dashboard.html">View Dashboard</a>
  </div>
  <details style="margin-top:18px;">
    <summary style="cursor:pointer; font-size:13px; color:#6b7280;">Show raw OCR text</summary>
    <div class="ocr-text-box">${(data.ocrText || '').replace(/</g, '&lt;')}</div>
  </details>
   ${renderManufacturerVerification(data.manufacturerVerification)}
`;
resultCard.style.display = 'block';
}
