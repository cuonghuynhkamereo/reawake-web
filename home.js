const PROXY_URL = 'https://reawake-server.onrender.com';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const CURRENT_DATE = new Date();

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  const messageElement = document.getElementById('notification-message');
  
  messageElement.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function debounce(func, wait) {
  let timeout;
  let isProcessing = false;

  return async function executedFunction(...args) {
    if (isProcessing) return;

    isProcessing = true;
    clearTimeout(timeout);

    try {
      const result = await func(...args);
      return result;
    } finally {
      timeout = setTimeout(() => {
        isProcessing = false;
      }, wait);
    }
  };
}

function parseDate(dateStr) {
  if (!dateStr) return new Date(0);
  const formats = [
    { pattern: /^(\d{2})\/(\d{2})\/(\d{4})$/, parse: ([_, d, m, y]) => new Date(`${y}-${m}-${d}`) },
    { pattern: /^(\d{4})-(\d{2})-(\d{2})$/, parse: ([_, y, m, d]) => new Date(`${y}-${m}-${d}`) },
    { pattern: /^(\d{2})\/(\d{4})$/, parse: ([_, m, y]) => new Date(`${y}-${m}-01`) } // For MM/YYYY format
  ];
  for (const { pattern, parse } of formats) {
    const match = dateStr.match(pattern);
    if (match) {
      const date = parse(match);
      if (!isNaN(date)) return date;
    }
  }
  console.error(`Cannot parse date: ${dateStr}`);
  return new Date(0);
}

function calculateDaysSinceLastOrder(lastOrderDate) {
  const lastOrder = parseDate(lastOrderDate);
  const diffTime = Math.abs(CURRENT_DATE - lastOrder);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatMonthYear(date) {
  if (!date || isNaN(date)) return '';
  return date.toLocaleString('en-US', { month: '2-digit', year: 'numeric' }).replace(/(\d+)\/(\d+)/, '$1/$2');
}

function formatDateToYYYYMMDD(date) {
  if (!date || isNaN(date)) return '';
  return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

function getDateRangeForChurn(churnMonth, activeHistory) {
  const churnDate = parseDate(churnMonth);
  let minDate = new Date(churnDate.getFullYear(), churnDate.getMonth(), 1);
  
  let maxDate;
  if (activeHistory && activeHistory.length > 0) {
    const earliestActive = activeHistory
      .map(history => parseDate(history.activeMonth))
      .filter(date => !isNaN(date) && date > churnDate)
      .sort((a, b) => a - b)[0];
    
    if (earliestActive) {
      maxDate = new Date(earliestActive.getFullYear(), earliestActive.getMonth(), 0); // Last day of the previous month
    } else {
      maxDate = new Date(CURRENT_DATE.getFullYear(), CURRENT_DATE.getMonth(), 0); // Last day of previous month from current date
    }
  } else {
    maxDate = new Date(CURRENT_DATE.getFullYear(), CURRENT_DATE.getMonth(), 0);
  }

  return { minDate, maxDate };
}

function getDateRangeForActive(activeMonth) {
  const activeDate = parseDate(activeMonth);
  const minDate = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
  const maxDate = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 0); // Last day of the active month
  return { minDate, maxDate };
}

function isDateInRange(date, minDate, maxDate) {
  return date >= minDate && date <= maxDate;
}

document.addEventListener('DOMContentLoaded', async () => {
  const userEmail = 'hieu.ngoc@kamereo.vn';
  if (!userEmail) {
    window.location.href = 'index.html';
    return;
  }

  const cacheKey = `homeData_${userEmail}`;
  let cachedData;
  try {
    cachedData = localStorage.getItem(cacheKey);
    cachedData = cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Error parsing cache:', error);
    localStorage.removeItem(cacheKey);
    cachedData = null;
  }

  const now = new Date().getTime();
  if (cachedData && cachedData.data && cachedData.timestamp && now - cachedData.timestamp < CACHE_DURATION) {
    console.log('Data loaded from localStorage');
    displayData(cachedData.data, userEmail);
  } else {
    await fetchAndDisplayData(userEmail, cacheKey);
  }

  const resetButton = document.getElementById('reset-button');
  resetButton.addEventListener('click', async () => {
    showLoading();
    try {
      localStorage.removeItem(cacheKey);
      await fetchAndDisplayData(userEmail, cacheKey);
      showNotification('Data refreshed successfully!', 'success');
    } catch (error) {
      console.error('Error resetting data:', error);
      showNotification('Error refreshing data. Please try again.', 'error');
    } finally {
      hideLoading();
    }
  });
});

async function fetchAndDisplayData(userEmail, cacheKey) {
  showLoading();
  try {
    const response = await fetch(`${PROXY_URL}/home`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    if (!navigator.onLine) throw new Error('No internet connection');
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    const data = await response.json();
    if (data.error || !data.picInfo || !data.stores) {
      console.error('Invalid server data:', data);
      showNotification(data.error || 'Invalid data. Please try again.', 'error');
      window.location.href = 'index.html';
      return;
    }

    const now = new Date().getTime();
    localStorage.setItem(cacheKey, JSON.stringify({
      data,
      timestamp: now
    }));
    displayData(data, userEmail);
  } catch (error) {
    console.error('Error fetching data:', error);
    showNotification(error.message.includes('No internet') ? 'Please check your network connection.' : 'Error loading data. Please try again.', 'error');
    window.location.href = 'index.html';
  } finally {
    hideLoading();
  }
}

async function displayData(data, userEmail) {
  if (!data || !data.picInfo || !data.stores || !Array.isArray(data.stores)) {
    console.error('Invalid data:', data);
    showNotification('Invalid data. Please log in again.', 'error');
    window.location.href = 'index.html';
    return;
  }

  const { picInfo, stores } = data;
  document.getElementById('pic-name').textContent = picInfo.fullName || 'N/A';
  document.getElementById('pic-email').textContent = picInfo.email || 'N/A';
  document.getElementById('pic-team').textContent = picInfo.team || 'N/A';
  document.getElementById('pic-subteam').textContent = picInfo.subteam || 'N/A';

  let progressByStore = {};
  let dropdownChurnActions = {};
  let dropdownActiveActions = [];
  let dropdownWhyReasons = {};

  try {
    const [progressResponse, churnActionsResponse, activeActionsResponse, whyReasonsResponse] = await Promise.all([
      fetch(`${PROXY_URL}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      }),
      fetch(`${PROXY_URL}/dropdown-churn-actions`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }),
      fetch(`${PROXY_URL}/dropdown-active-actions`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }),
      fetch(`${PROXY_URL}/dropdown-why-reasons`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
    ]);

    if (!progressResponse.ok) throw new Error(`HTTP error! Status: ${progressResponse.status}`);
    progressByStore = await progressResponse.json();

    if (!churnActionsResponse.ok) throw new Error(`HTTP error! Status: ${churnActionsResponse.status}`);
    const churnActionsData = await churnActionsResponse.json();
    churnActionsData.forEach(row => {
      if (!dropdownChurnActions[row.typeOfChurn]) dropdownChurnActions[row.typeOfChurn] = [];
      dropdownChurnActions[row.typeOfChurn].push(row.churnAction);
    });

    if (!activeActionsResponse.ok) throw new Error(`HTTP error! Status: ${activeActionsResponse.status}`);
    dropdownActiveActions = await activeActionsResponse.json();

    if (!whyReasonsResponse.ok) throw new Error(`HTTP error! Status: ${whyReasonsResponse.status}`);
    const whyReasonsData = await whyReasonsResponse.json();
    whyReasonsData.forEach(row => {
      if (!dropdownWhyReasons[row.typeOfChurn]) dropdownWhyReasons[row.typeOfChurn] = [];
      dropdownWhyReasons[row.typeOfChurn].push(row.whyNotReawaken);
    });
  } catch (error) {
    console.error('Error fetching dropdown data:', error);
    progressByStore = {};
    dropdownChurnActions = {};
    dropdownActiveActions = [];
    dropdownWhyReasons = {};
  }

  const picFilter = document.getElementById('pic-filter');
  const uniquePICs = [...new Set(stores.map(store => store.finalCurrentPIC).filter(pic => pic && pic !== 'N/A'))];
  uniquePICs.sort();
  uniquePICs.forEach(pic => {
    const option = document.createElement('option');
    option.value = pic;
    option.textContent = pic;
    picFilter.appendChild(option);
  });

  let filteredStores = [...stores];
  updateTable(filteredStores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);

  const statusFilter = document.getElementById('status-filter');
  statusFilter.addEventListener('change', () => {
    applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
  });

  picFilter.addEventListener('change', () => {
    applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
  });

  const searchInputs = ['store-id', 'store-name', 'buyer-id'];
  searchInputs.forEach(field => {
    const input = document.getElementById(`search-${field}`);
    input.addEventListener('input', () => {
      applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
    });
  });
}

function applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons) {
  const searchStoreId = document.getElementById('search-store-id').value.trim().toLowerCase();
  const searchStoreName = document.getElementById('search-store-name').value.trim().toLowerCase();
  const searchBuyerId = document.getElementById('search-buyer-id').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const picFilter = document.getElementById('pic-filter').value;

  let filteredStores = [...stores];

  if (searchStoreId) {
    filteredStores = filteredStores.filter(store => 
      (store.storeId || '').toLowerCase().includes(searchStoreId)
    );
  }

  if (searchStoreName) {
    filteredStores = filteredStores.filter(store => 
      (store.storeName || '').toLowerCase().includes(searchStoreName)
    );
  }

  if (searchBuyerId) {
    filteredStores = filteredStores.filter(store => 
      (store.buyerId || '').toLowerCase().includes(searchBuyerId)
    );
  }

  if (statusFilter !== 'All') {
    filteredStores = filteredStores.filter(store => 
      store.statusChurnThisMonth === statusFilter
    );
  }

  if (picFilter !== 'All') {
    filteredStores = filteredStores.filter(store => 
      store.finalCurrentPIC === picFilter
    );
  }

  updateTable(filteredStores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
}

function updateTable(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons) {
  const tbody = document.getElementById('stores-body');
  tbody.innerHTML = '';

  const sortedStores = [...stores].sort((a, b) => {
    const noDaysNoBuyA = calculateDaysSinceLastOrder(a.lastOrderDate);
    const noDaysNoBuyB = calculateDaysSinceLastOrder(b.lastOrderDate);
    const isCriticalA = a.statusChurnThisMonth === 'Active' && noDaysNoBuyA > 20;
    const isCriticalB = b.statusChurnThisMonth === 'Active' && noDaysNoBuyB > 20;

    if (isCriticalA && !isCriticalB) return -1;
    if (!isCriticalA && isCriticalB) return 1;

    const dateA = a.lastOrderDate ? parseDate(a.lastOrderDate) : new Date(0);
    const dateB = b.lastOrderDate ? parseDate(b.lastOrderDate) : new Date(0);
    return dateB - dateA || (a.storeId.localeCompare(b.storeId));
  });

  requestAnimationFrame(() => {
    sortedStores.forEach(store => {
      const noDaysNoBuy = calculateDaysSinceLastOrder(store.lastOrderDate);
      const lastOrderDisplay = store.lastOrderDate || 'N/A';
      const isCritical = store.statusChurnThisMonth === 'Active' && noDaysNoBuy > 20;
      const lastOrderClass = isCritical ? 'warning-last-order' : '';

      const row = document.createElement('tr');
      row.className = store.statusChurnThisMonth === 'Active' ? 'active-row' : 'churn-row';
      row.innerHTML = `
        <td>${store.storeId || 'N/A'}</td>
        <td>${store.storeName || 'N/A'}</td>
        <td>${store.buyerId || 'N/A'}</td>
        <td>${store.fullAddress || 'N/A'}</td>
        <td class="${lastOrderClass}">${lastOrderDisplay}</td>
        <td>${store.finalCurrentPIC || 'N/A'}</td>
        <td>${store.statusChurnThisMonth || 'N/A'}</td>
        <td>
          <button class="action-button" aria-label="Add action for store ${store.storeId || 'N/A'}">Action</button>
          <button class="journey-button" aria-label="View progress for store ${store.storeId || 'N/A'}">Journey</button>
        </td>
      `;
      tbody.appendChild(row);

      const progressRow = document.createElement('tr');
      progressRow.className = 'progress-row';
      const progressItems = progressByStore[store.storeId] || [];
      const subTableContent = progressItems.map(item => {
        const isChurn = !!item.churnMonth;
        const header = isChurn 
          ? `${item.churnMonth} | ${item.typeOfChurn} | ${item.reason}`
          : `${item.activeMonth} | Active`;
        const tableClass = isChurn ? 'progress-table' : 'progress-table active-table';
        const columns = isChurn 
          ? `
            <th class="col-date">Date</th>
            <th class="col-pic">PIC</th>
            <th class="col-subteam">Subteam</th>
            <th class="col-contact">Contact Type</th>
            <th class="col-action">Action</th>
            <th class="col-note">Note</th>
            <th class="col-reason">Reason for not re-awaken</th>
          `
          : `
            <th class="col-date">Date</th>
            <th class="col-pic">PIC</th>
            <th class="col-subteam">Subteam</th>
            <th class="col-contact">Contact Type</th>
            <th class="col-action">Action</th>
            <th class="col-note">Note</th>
          `;
        const rows = item.actions.length ? item.actions.map(action => `
          <tr>
            <td class="col-date">${action.contactDate || 'N/A'}</td>
            <td class="col-pic">${action.PIC || 'N/A'}</td>
            <td class="col-subteam">${action.subteam || 'N/A'}</td>
            <td class="col-contact">${action.typeOfContact || 'N/A'}</td>
            <td class="col-action">${action.action || 'N/A'}</td>
            <td class="col-note">${action.note || ''}</td>
            ${isChurn ? `<td class="col-reason">${action.whyNotReawaken || ''}</td>` : ''}
          </tr>
        `).join('') : `
          <tr>
            <td colspan="${isChurn ? 7 : 6}"><p>No actions yet to ${isChurn ? 're-awaken' : 'manage'} this customer</p></td>
          </tr>
        `;

        return `
          <div class="churn-group">
            <h4>${header}</h4>
            <table class="${tableClass}">
              <thead>
                <tr>
                  ${columns}
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      }).join('');
      progressRow.innerHTML = `<td colspan="8">${subTableContent || '<p>No progress for this store</p>'}</td>`;
      tbody.appendChild(progressRow);

      const journeyBtn = row.querySelector('.journey-button');
      journeyBtn.addEventListener('click', () => {
        const isCurrentlyOpen = progressRow.classList.contains('open');
        if (isCurrentlyOpen) {
          progressRow.classList.remove('open');
          journeyBtn.classList.remove('active');
          row.classList.remove('open-row');
        } else {
          progressRow.classList.add('open');
          journeyBtn.classList.add('active');
          row.classList.add('open-row');
        }
      });

      const actionBtn = row.querySelector('.action-button');
      actionBtn.addEventListener('click', async () => {
        const modal = document.getElementById('action-modal');
        modal.classList.add('active');

        document.getElementById('modal-store-id').value = store.storeId || 'N/A';
        document.getElementById('modal-store-name').value = store.storeName || 'N/A';
        document.getElementById('modal-pic').value = userEmail.split('@')[0];
        document.getElementById('modal-subteam').value = picInfo.subteam || 'N/A';
        document.getElementById('modal-contact-date').value = '';
        document.getElementById('modal-type-of-contact').value = '';

        const actionSelect = document.getElementById('modal-action');
        actionSelect.innerHTML = '<option value="">Select action</option>';

        const whyNotReawakenSelect = document.getElementById('modal-why-not-reawaken');
        whyNotReawakenSelect.innerHTML = '<option value="">Select reason</option>';

        const activeMonthSelect = document.getElementById('modal-active-month');
        activeMonthSelect.innerHTML = '<option value="">Select Active Month</option>';
        let activeHistory = [];
        try {
          const activeHistoryResponse = await fetch(`${PROXY_URL}/active-history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId: store.storeId })
          });
          if (!activeHistoryResponse.ok) throw new Error(`HTTP error! Status: ${activeHistoryResponse.status}`);
          activeHistory = await activeHistoryResponse.json();
          activeHistory.forEach(history => {
            const option = document.createElement('option');
            option.value = history.activeMonth;
            option.textContent = history.activeMonth;
            activeMonthSelect.appendChild(option);
          });

          if (store.statusChurnThisMonth === 'Active' && calculateDaysSinceLastOrder(store.lastOrderDate) <= 30) {
            const currentMonth = formatMonthYear(CURRENT_DATE);
            const option = document.createElement('option');
            option.value = currentMonth;
            option.textContent = currentMonth + ' (Current Active)';
            activeMonthSelect.appendChild(option);
            activeMonthSelect.value = currentMonth;
          } else if (activeHistory.length === 0) {
            const option = document.createElement('option');
            option.value = 'N/A';
            option.textContent = 'N/A (Current Active)';
            activeMonthSelect.appendChild(option);
            activeMonthSelect.value = 'N/A';
          }
        } catch (error) {
          console.error('Error fetching Active History:', error);
          const option = document.createElement('option');
          option.value = 'N/A';
          option.textContent = store.statusChurnThisMonth === 'Active' ? 'N/A (Current Active)' : 'N/A';
          activeMonthSelect.appendChild(option);
          activeMonthSelect.value = 'N/A';
        }

        const progressItems = progressByStore[store.storeId] || [];
        const latestChurn = progressItems.find(item => !!item.churnMonth);

        const churnToggle = document.getElementById('churn-toggle');
        const activeToggle = document.getElementById('active-toggle');
        const churnFields = document.querySelectorAll('.churn-field');
        const activeFields = document.querySelectorAll('.active-field');
        const contactDateInput = document.getElementById('modal-contact-date');

        const hasChurn = !!latestChurn;
        let dateRange = { minDate: null, maxDate: null };

        if (hasChurn) {
          churnToggle.classList.add('active');
          activeToggle.classList.remove('active');
          churnFields.forEach(field => field.style.display = 'block');
          activeFields.forEach(field => field.style.display = 'none');
          churnToggle.disabled = false;
          document.getElementById('modal-churn-month').value = latestChurn.churnMonth || store.lastOrderDate || 'N/A';

          dateRange = getDateRangeForChurn(latestChurn.churnMonth, activeHistory);
          contactDateInput.setAttribute('min', formatDateToYYYYMMDD(dateRange.minDate));
          contactDateInput.setAttribute('max', formatDateToYYYYMMDD(dateRange.maxDate));

          const churnType = latestChurn.typeOfChurn || '';
          const availableChurnActions = dropdownChurnActions[churnType] || [];
          availableChurnActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action;
            actionSelect.appendChild(option);
          });

          const availableWhyReasons = dropdownWhyReasons[churnType] || [];
          availableWhyReasons.forEach(reason => {
            const option = document.createElement('option');
            option.value = reason;
            option.textContent = reason;
            whyNotReawakenSelect.appendChild(option);
          });
        } else {
          churnToggle.classList.remove('active');
          activeToggle.classList.add('active');
          churnFields.forEach(field => field.style.display = 'none');
          activeFields.forEach(field => field.style.display = 'block');
          churnToggle.disabled = true;

          const selectedActiveMonth = activeMonthSelect.value || 'N/A';
          if (selectedActiveMonth !== 'N/A') {
            dateRange = getDateRangeForActive(selectedActiveMonth);
            contactDateInput.setAttribute('min', formatDateToYYYYMMDD(dateRange.minDate));
            contactDateInput.setAttribute('max', formatDateToYYYYMMDD(dateRange.maxDate));
          }

          dropdownActiveActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action;
            actionSelect.appendChild(option);
          });
          whyNotReawakenSelect.style.display = 'none';
        }

        document.getElementById('modal-note').value = '';
        document.getElementById('modal-why-not-reawaken').value = '';

        churnToggle.addEventListener('click', () => {
          if (!churnToggle.disabled) {
            churnToggle.classList.add('active');
            activeToggle.classList.remove('active');
            churnFields.forEach(field => field.style.display = 'block');
            activeFields.forEach(field => field.style.display = 'none');
            whyNotReawakenSelect.style.display = 'block';

            dateRange = getDateRangeForChurn(latestChurn.churnMonth, activeHistory);
            contactDateInput.setAttribute('min', formatDateToYYYYMMDD(dateRange.minDate));
            contactDateInput.setAttribute('max', formatDateToYYYYMMDD(dateRange.maxDate));

            actionSelect.innerHTML = '<option value="">Select action</option>';
            whyNotReawakenSelect.innerHTML = '<option value="">Select reason</option>';
            if (hasChurn) {
              const churnType = latestChurn.typeOfChurn || '';
              const availableChurnActions = dropdownChurnActions[churnType] || [];
              availableChurnActions.forEach(action => {
                const option = document.createElement('option');
                option.value = action;
                option.textContent = action;
                actionSelect.appendChild(option);
              });

              const availableWhyReasons = dropdownWhyReasons[churnType] || [];
              availableWhyReasons.forEach(reason => {
                const option = document.createElement('option');
                option.value = reason;
                option.textContent = reason;
                whyNotReawakenSelect.appendChild(option);
              });
            }
          }
        });

        activeToggle.addEventListener('click', () => {
          activeToggle.classList.add('active');
          churnToggle.classList.remove('active');
          activeFields.forEach(field => field.style.display = 'block');
          churnFields.forEach(field => field.style.display = 'none');
          whyNotReawakenSelect.style.display = 'none';

          const selectedActiveMonth = activeMonthSelect.value || 'N/A';
          if (selectedActiveMonth !== 'N/A') {
            dateRange = getDateRangeForActive(selectedActiveMonth);
            contactDateInput.setAttribute('min', formatDateToYYYYMMDD(dateRange.minDate));
            contactDateInput.setAttribute('max', formatDateToYYYYMMDD(dateRange.maxDate));
          }

          actionSelect.innerHTML = '<option value="">Select action</option>';
          dropdownActiveActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action;
            actionSelect.appendChild(option);
          });
        });

        activeMonthSelect.addEventListener('change', () => {
          if (!activeToggle.classList.contains('active')) return;

          const selectedActiveMonth = activeMonthSelect.value || 'N/A';
          if (selectedActiveMonth !== 'N/A') {
            dateRange = getDateRangeForActive(selectedActiveMonth);
            contactDateInput.setAttribute('min', formatDateToYYYYMMDD(dateRange.minDate));
            contactDateInput.setAttribute('max', formatDateToYYYYMMDD(dateRange.maxDate));
          } else {
            contactDateInput.removeAttribute('min');
            contactDateInput.removeAttribute('max');
          }
        });
      });
    });

    const modal = document.getElementById('action-modal');
    const closeBtn = modal.querySelector('.close');
    const resetModal = () => {
      modal.classList.remove('active');
      document.getElementById('modal-note').value = '';
      const selectElements = modal.querySelectorAll('select');
      selectElements.forEach(select => {
        select.blur();
        const event = new Event('change', { bubbles: true });
        select.dispatchEvent(event);
      });
      document.activeElement.blur();
    };

    closeBtn.addEventListener('click', resetModal);
    window.addEventListener('click', (event) => {
      if (event.target === modal) resetModal();
    });

    const submitBtn = document.getElementById('submit-action');
    const debouncedSubmit = debounce(async () => {
      const storeId = document.getElementById('modal-store-id').value;
      const storeName = document.getElementById('modal-store-name').value;
      const contactDate = document.getElementById('modal-contact-date').value;
      const pic = document.getElementById('modal-pic').value;
      const subteam = document.getElementById('modal-subteam').value;
      const typeOfContact = document.getElementById('modal-type-of-contact').value;
      const action = document.getElementById('modal-action').value;
      const note = document.getElementById('modal-note').value;
      const whyNotReawaken = document.getElementById('modal-why-not-reawaken').value;
      const churnToggle = document.getElementById('churn-toggle');
      const isChurnActive = !churnToggle.disabled && churnToggle.classList.contains('active');
      const churnMonthLastOrderDate = isChurnActive ? document.getElementById('modal-churn-month').value : '';
      const activeMonth = !isChurnActive ? document.getElementById('modal-active-month').value : '';

      if (!contactDate || !typeOfContact || !action || (!isChurnActive && !activeMonth)) {
        showNotification('Please fill in all required fields: Contact Date, Type of Contact, Action, and Active Month (if applicable)!', 'error');
        resetModal();
        return;
      }

      let dateRange;
      let activeHistory = [];
      try {
        const activeHistoryResponse = await fetch(`${PROXY_URL}/active-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId })
        });
        if (!activeHistoryResponse.ok) throw new Error(`HTTP error! Status: ${activeHistoryResponse.status}`);
        activeHistory = await activeHistoryResponse.json();
      } catch (error) {
        console.error('Error fetching Active History for validation:', error);
      }

      if (isChurnActive) {
        dateRange = getDateRangeForChurn(churnMonthLastOrderDate, activeHistory);
      } else {
        dateRange = getDateRangeForActive(activeMonth);
      }

      const selectedContactDate = new Date(contactDate);
      if (!isDateInRange(selectedContactDate, dateRange.minDate, dateRange.maxDate)) {
        const minFormatted = formatDateToYYYYMMDD(dateRange.minDate);
        const maxFormatted = formatDateToYYYYMMDD(dateRange.maxDate);
        showNotification(`Contact Date must be between ${minFormatted} and ${maxFormatted}!`, 'error');
        resetModal();
        return;
      }

      const payload = {
        email: userEmail,
        storeId,
        storeName,
        action,
        contactDate,
        PIC: pic,
        subteam,
        typeOfContact,
        note,
        whyNotReawaken,
        churnMonthLastOrderDate,
        activeMonth
      };

      submitBtn.disabled = true;
      try {
        showLoading();
        const endpoint = isChurnActive ? 'Churn Database' : 'Active Database';
        const response = await fetch(`${PROXY_URL}/submit?type=${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!navigator.onLine) throw new Error('No internet connection');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const result = await response.json();
        if (result.success) {
          showNotification('Action recorded successfully!', 'success');
          const progressResponse = await fetch(`${PROXY_URL}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail })
          });
          if (progressResponse.ok) {
            const updatedProgress = await progressResponse.json();
            updateTable(stores, updatedProgress, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
            const storeRow = Array.from(tbody.children).find(row => 
              row.querySelector('td:first-child').textContent === storeId
            );
            if (storeRow) {
              const journeyBtn = storeRow.querySelector('.journey-button');
              const progressRow = storeRow.nextElementSibling;
              if (progressRow && journeyBtn) {
                progressRow.classList.add('open');
                journeyBtn.classList.add('active');
                storeRow.classList.add('open-row');
              }
            }
          }
        } else {
          showNotification('Error recording data: ' + (result.error || 'Unknown reason'), 'error');
        }
      } catch (error) {
        console.error('Error submitting action:', error);
        if (error.status === 429) {
          showNotification('Too many requests. Please wait 1-2 minutes before trying again.', 'warning');
        } else {
          showNotification(error.message.includes('No internet') ? 'Please check your network connection.' : 'Error recording data: ' + (error.message || 'Please try again.'), 'error');
        }
      } finally {
        hideLoading();
        submitBtn.disabled = false;
        resetModal();
      }
    }, 300);

    submitBtn.addEventListener('click', () => {
      if (!submitBtn.disabled) debouncedSubmit();
    });
  });
}