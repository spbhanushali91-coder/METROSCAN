requireLogin(); // redirect to login.html if no valid token
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`,{ headers: authHeaders() });
    const stats = await res.json();
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = `
      <div class="stat-card"><div class="value">${stats.totalScanned}</div><div class="label">Total Scanned</div></div>
      <div class="stat-card"><div class="value" style="color:#0a7d2c;">${stats.compliant}</div><div class="label">Compliant</div></div>
      <div class="stat-card"><div class="value" style="color:#b30000;">${stats.nonCompliant}</div><div class="label">Non-Compliant</div></div>
      <div class="stat-card"><div class="value">${stats.complianceRate}%</div><div class="label">Compliance Rate</div></div>
    `;
  } catch (e) {
    console.error('Failed to load stats', e);
  }
}

async function loadProducts() {
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('statusFilter').value;
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status) params.append('status', status);

  const tbody = document.getElementById('productsBody');
  tbody.innerHTML = `<tr><td colspan="5" class="loading">Loading...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/products?${params.toString()}`,{ headers: authHeaders() });
    const rows = await res.json();

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="loading">No products scanned yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => {
  const badgeClass = r.status === 'COMPLIANT' ? 'compliant' : 'non-compliant';
  const badgeLabel = r.status === 'COMPLIANT' ? 'Compliant' : `Non-Compliant`;
  return `
    <tr onclick="window.location='product.html?id=${r.id}'">
      <td>#${r.id}</td>
      <td>${r.product_name || 'Untitled'}</td>
      <td><span class="status-badge ${badgeClass}">${badgeLabel}</span></td>
      <td>${new Date(r.scanned_at).toLocaleString()}</td>
      <td><a href="#" onclick="event.stopPropagation(); event.preventDefault(); downloadReport(${r.id})">Report ⬇</a></td>
    </tr>`;
}).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading">Could not reach backend.</td></tr>`;
  }
}

document.getElementById('searchInput').addEventListener('input', debounce(loadProducts, 300));
document.getElementById('statusFilter').addEventListener('change', loadProducts);

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
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

document.getElementById('exportCsvBtn').addEventListener('click', async () => {
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('statusFilter').value;
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status) params.append('status', status);

  const res = await fetch(`${API_BASE}/products/export/csv?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) {
    alert('Export failed. Please try again.');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compliance-scans-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});


const currentUser = getUser();
if (currentUser) {
  document.getElementById('userInfo').textContent = `${currentUser.displayName} (${currentUser.role})`;
}

loadStats();
loadProducts();


