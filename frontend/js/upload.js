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
      headers: { 'x-user-role': 'ENFORCEMENT_OFFICER' },
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

function renderResult(data) {
  const badgeClass = data.status === 'COMPLIANT' ? 'compliant' : 'non-compliant';
  const badgeLabel = data.status === 'COMPLIANT' ? '✅ COMPLIANT' : `❌ NON-COMPLIANT (${data.violationsCount} issue${data.violationsCount === 1 ? '' : 's'})`;

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
      <a class="btn" style="text-decoration:none; display:inline-block;" href="${API_BASE}/products/${data.id}/report" target="_blank">⬇ Download PDF Report</a>
      <a class="btn secondary" style="text-decoration:none; display:inline-block; margin-left:10px;" href="dashboard.html">View Dashboard</a>
    </div>
    <details style="margin-top:18px;">
      <summary style="cursor:pointer; font-size:13px; color:#6b7280;">Show raw OCR text</summary>
      <div class="ocr-text-box">${(data.ocrText || '').replace(/</g, '&lt;')}</div>
    </details>
  `;
  resultCard.style.display = 'block';
}
