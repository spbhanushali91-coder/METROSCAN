// Shared auth helpers used across all pages

function getToken() {
  return localStorage.getItem('metroscan_token');
}

function getUser() {
  const raw = localStorage.getItem('metroscan_user');
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  localStorage.removeItem('metroscan_token');
  localStorage.removeItem('metroscan_user');
  window.location.href = 'login.html';
}

// Redirect to login if not authenticated — call this at the top of
// protected pages (index.html, dashboard.html)
function requireLogin() {
  if (!getToken()) {
    window.location.href = 'login.html';
  }
}

// Attach this to every backend fetch call on protected pages
function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// --- Login form handling (only present on login.html) ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    errorEl.style.display = 'none';

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || 'Login failed';
        errorEl.style.display = 'block';
        return;
      }

      localStorage.setItem('metroscan_token', data.token);
      localStorage.setItem('metroscan_user', JSON.stringify(data.user));
      window.location.href = 'dashboard.html';
    } catch (err) {
      errorEl.textContent = 'Could not reach server. Is the backend running?';
      errorEl.style.display = 'block';
    }
  });
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