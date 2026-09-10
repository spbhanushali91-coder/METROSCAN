requireLogin();


// =====================================================
// USER INFO
// =====================================================

const currentUser = getUser();

if (currentUser) {
  const userInfo = document.getElementById('userInfo');

  if (userInfo) {
    userInfo.textContent =
      `${currentUser.displayName || currentUser.username} • ${currentUser.role}`;
  }
}


// =====================================================
// ELEMENTS
// =====================================================

const lotForm = document.getElementById('lotForm');
const registerBtn = document.getElementById('registerBtn');
const formMessage = document.getElementById('formMessage');

const lotsBody = document.getElementById('lotsBody');
const lotSearch = document.getElementById('lotSearch');
const refreshLotsBtn =
  document.getElementById('refreshLotsBtn');
// =====================================================
// COMPONENT NAVIGATION
// =====================================================

const navTabs = document.querySelectorAll('.nav-tab');
const portalSections = document.querySelectorAll('.portal-section');

navTabs.forEach((tab) => {

  tab.addEventListener('click', () => {

    const targetSectionId =
      tab.dataset.section;

    // -----------------------------------------------
    // Update active navigation tab
    // -----------------------------------------------

    navTabs.forEach((item) => {
      item.classList.remove('active');
    });

    tab.classList.add('active');


    // -----------------------------------------------
    // Hide all portal sections
    // -----------------------------------------------

    portalSections.forEach((section) => {
      section.classList.remove('active-section');
    });


    // -----------------------------------------------
    // Show selected section
    // -----------------------------------------------

    const targetSection =
      document.getElementById(targetSectionId);

    if (targetSection) {
      targetSection.classList.add('active-section');
    }

  });

});
// =====================================================
// MESSAGE HELPER
// =====================================================

function showMessage(message, type) {

  formMessage.textContent = message;

  formMessage.className =
    `form-message ${type}`;

  formMessage.style.display = 'block';

  formMessage.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}


function hideMessage() {

  formMessage.style.display = 'none';

}


// =====================================================
// REGISTER LOT
// =====================================================

lotForm.addEventListener('submit', async (event) => {

  event.preventDefault();

  hideMessage();

  registerBtn.disabled = true;

  registerBtn.innerHTML = `
    Registering...
    <span>...</span>
  `;


  const payload = {

    lotNumber:
      document.getElementById('lotNumber').value.trim(),

    productName:
      document.getElementById('productName').value.trim(),

    manufacturerName:
      document.getElementById('manufacturerName').value.trim(),

    manufacturerAddress:
      document.getElementById('manufacturerAddress').value.trim(),

    netQuantity:
      document.getElementById('netQuantity').value.trim(),

    mrp:
      document.getElementById('mrp').value.trim(),

    manufactureDate:
      document.getElementById('manufactureDate').value.trim(),

    consumerCare:
      document.getElementById('consumerCare').value.trim(),

    countryOfOrigin:
      document.getElementById('countryOfOrigin').value.trim()
  };


  try {

  const response = await fetch(
  `${API_BASE}/manufacturer/lots`,
  {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
      ...authHeaders()
    },

    body: JSON.stringify(payload)
  }
);


    const data = await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        'Failed to register manufacturer lot.'
      );
    }


    showMessage(
      `Lot ${data.lot.lot_number} registered successfully.`,
      'success'
    );


    lotForm.reset();


    await loadLots();


  } catch (error) {

    console.error(
      'Register lot failed:',
      error
    );

    showMessage(
      error.message ||
      'Could not register lot.',
      'error'
    );

  } finally {

    registerBtn.disabled = false;

    registerBtn.innerHTML = `
      Register Lot
      <span>→</span>
    `;
  }

});


// =====================================================
// LOAD LOTS
// =====================================================

async function loadLots() {

  lotsBody.innerHTML = `
    <tr>
      <td colspan="7" class="table-loading">
        Loading registered lots...
      </td>
    </tr>
  `;


  try {

    const search =
      lotSearch.value.trim();


    const params =
      new URLSearchParams();


    if (search) {
      params.append(
        'search',
        search
      );
    }


const response = await fetch(
  `${API_BASE}/manufacturer/lots?${params.toString()}`,
    {
    headers: authHeaders()
  }
);


    const data = await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        'Failed to load manufacturer lots.'
      );
    }


    renderLots(data);

    updateStats(data);


  } catch (error) {

    console.error(
      'Load lots failed:',
      error
    );

    lotsBody.innerHTML = `
      <tr>
        <td colspan="7" class="table-loading">
          Could not load registered lots.
        </td>
      </tr>
    `;
  }
}


// =====================================================
// RENDER LOTS
// =====================================================

function renderLots(lots) {

  if (!lots.length) {

    lotsBody.innerHTML = `
      <tr>
        <td colspan="7" class="table-loading">
          No registered lots found.
        </td>
      </tr>
    `;

    return;
  }


  lotsBody.innerHTML = lots.map((lot) => {

    const registeredDate =
      lot.created_at
        ? new Date(lot.created_at).toLocaleDateString(
            'en-IN',
            {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            }
          )
        : '—';


    return `
      <tr>

        <td>
          <div class="lot-number">
            ${escapeHtml(lot.lot_number)}
          </div>

          <span class="lot-badge">
            ● REGISTERED
          </span>
        </td>


        <td>
          <div class="product-name">
            ${escapeHtml(
              lot.product_name || '—'
            )}
          </div>
        </td>


        <td>
          <div class="manufacturer-name">
            ${escapeHtml(
              lot.manufacturer_name || '—'
            )}
          </div>
        </td>


        <td>
          ${escapeHtml(
            lot.net_quantity || '—'
          )}
        </td>


        <td>
          ${escapeHtml(
            lot.mrp || '—'
          )}
        </td>


        <td>
          ${registeredDate}
        </td>


        <td>

          <button
            class="table-action"
            type="button"
            onclick="viewLot('${escapeJs(lot.lot_number)}')"
          >
            View →
          </button>

        </td>

      </tr>
    `;

  }).join('');
}


// =====================================================
// STATS
// =====================================================

function updateStats(lots) {

  const totalLots =
    document.getElementById('totalLots');

  const activeLots =
    document.getElementById('activeLots');

  const productTypes =
    document.getElementById('productTypes');


  if (totalLots) {

    totalLots.textContent =
      lots.length;
  }


  if (activeLots) {

    /*
      Current schema does not have an explicit
      status column for manufacturer lots.

      Therefore every successfully registered
      declaration is treated as active.
    */

    activeLots.textContent =
      lots.length;
  }


  if (productTypes) {

    const uniqueProducts =
      new Set(
        lots
          .map(
            lot =>
              (lot.product_name || '')
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      );

    productTypes.textContent =
      uniqueProducts.size;
  }
}


// =====================================================
// VIEW LOT
// =====================================================

async function viewLot(lotNumber) {

  try {

    const response = await fetch(
      `${API_BASE}/manufacturer/lots/${encodeURIComponent(lotNumber)}`,
      {
        headers: authHeaders()
      }
    );


    const lot = await response.json();


    if (!response.ok) {

      throw new Error(
        lot.error ||
        'Could not fetch lot details.'
      );
    }


    const details = `

Lot Number:
${lot.lot_number}

Product:
${lot.product_name || '—'}

Manufacturer:
${lot.manufacturer_name || '—'}

Address:
${lot.manufacturer_address || '—'}

Net Quantity:
${lot.net_quantity || '—'}

MRP:
${lot.mrp || '—'}

Manufacture / Packing Date:
${lot.manufacture_date || '—'}

Consumer Care:
${lot.consumer_care || '—'}

Country of Origin:
${lot.country_of_origin || '—'}

Registered:
${lot.created_at || '—'}

    `;


    alert(details);


  } catch (error) {

    console.error(
      'View lot failed:',
      error
    );

    alert(
      error.message ||
      'Could not fetch lot details.'
    );
  }
}


// =====================================================
// REFRESH LOTS
// =====================================================

if (refreshLotsBtn) {

  refreshLotsBtn.addEventListener(
    'click',
    async () => {

      refreshLotsBtn.disabled = true;

      const originalText =
        refreshLotsBtn.textContent;

      refreshLotsBtn.textContent =
        'Refreshing...';

      try {

        await loadLots();

      } finally {

        refreshLotsBtn.disabled = false;

        refreshLotsBtn.textContent =
          originalText;

      }
    }
  );

}

// =====================================================
// SEARCH
// =====================================================

let searchTimer;

lotSearch.addEventListener(
  'input',
  () => {

    clearTimeout(searchTimer);

    searchTimer = setTimeout(
      loadLots,
      300
    );

  }
);


// =====================================================
// SECURITY HELPERS
// =====================================================

function escapeHtml(value) {

  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


function escapeJs(value) {

  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}


// =====================================================
// INITIAL LOAD
// =====================================================

loadLots();