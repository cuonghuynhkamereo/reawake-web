try {
  const PROXY_URL = 'http://localhost:3000';
} catch (error) {
  const PROXY_URL = 'https://reawake-server.vercel.app';
}

// const PROXY_URL = 'http://localhost:3000';
const PROXY_URL = 'https://reawake-server.vercel.app';

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 giờ
const CURRENT_DATE = new Date('2025-05-08');

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

// Hàm hiển thị thông báo tùy chỉnh
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

// Debounce sửa lại để chỉ cho phép một lần gọi duy nhất trong khoảng thời gian wait
function debounce(func, wait) {
  let timeout;
  let isProcessing = false;

  return async function executedFunction(...args) {
    if (isProcessing) {
      return; // Bỏ qua các lần gọi mới nếu đang xử lý
    }

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
    { pattern: /^(\d{4})-(\d{2})-(\d{2})$/, parse: ([_, y, m, d]) => new Date(`${y}-${m}-${d}`) }
  ];
  for (const { pattern, parse } of formats) {
    const match = dateStr.match(pattern);
    if (match) {
      const date = parse(match);
      if (!isNaN(date)) return date;
    }
  }
  console.error(`Không thể parse ngày: ${dateStr}`);
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
    console.error('Lỗi parse cache:', error);
    localStorage.removeItem(cacheKey);
    cachedData = null;
  }

  const now = new Date().getTime();
  if (cachedData && cachedData.data && cachedData.timestamp && now - cachedData.timestamp < CACHE_DURATION) {
    console.log('Dữ liệu lấy từ localStorage');
    displayData(cachedData.data, userEmail);
    return;
  }

  showLoading();
  try {
    const response = await fetch(`${PROXY_URL}/home`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    const data = await response.json();

    if (data.error || !data.picInfo || !data.stores) {
      console.error('Dữ liệu server không hợp lệ:', data);
      showNotification(data.error || 'Dữ liệu không hợp lệ. Vui lòng thử lại.', 'error');
      window.location.href = 'index.html';
      return;
    }

    localStorage.setItem(cacheKey, JSON.stringify({
      data,
      timestamp: now
    }));
    displayData(data, userEmail);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu:', error);
    showNotification('Lỗi khi tải dữ liệu. Vui lòng thử lại.', 'error');
    window.location.href = 'index.html';
  } finally {
    hideLoading();
  }
});

async function displayData(data, userEmail) {
  if (!data || !data.picInfo || !data.stores) {
    console.error('Dữ liệu không hợp lệ:', data);
    showNotification('Dữ liệu không hợp lệ. Vui lòng đăng nhập lại.', 'error');
    window.location.href = 'index.html';
    return;
  }

  const { picInfo, stores } = data;
  document.getElementById('pic-name').textContent = picInfo.fullName || 'N/A';
  document.getElementById('pic-email').textContent = picInfo.email || 'N/A';
  document.getElementById('pic-team').textContent = picInfo.team || 'N/A';
  document.getElementById('pic-subteam').textContent = picInfo.subteam || 'N/A';

  let progressByStore = {};
  try {
    const progressResponse = await fetch(`${PROXY_URL}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    if (!progressResponse.ok) {
      throw new Error(`HTTP error! status: ${progressResponse.status}`);
    }
    progressByStore = await progressResponse.json();
  } catch (error) {
    console.error('Lỗi khi lấy tiến trình:', error);
    progressByStore = {};
  }

  // Lấy danh sách PIC từ stores và hiển thị trong dropdown
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
  updateTable(filteredStores, progressByStore, userEmail, picInfo);

  // Thêm sự kiện cho bộ lọc Status
  const statusFilter = document.getElementById('status-filter');
  statusFilter.addEventListener('change', () => {
    applyFilters(stores, progressByStore, userEmail, picInfo);
  });

  // Thêm sự kiện cho bộ lọc PIC
  picFilter.addEventListener('change', () => {
    applyFilters(stores, progressByStore, userEmail, picInfo);
  });

  // Thêm sự kiện cho nút tìm kiếm
  document.getElementById('search-button').addEventListener('click', () => {
    applyFilters(stores, progressByStore, userEmail, picInfo);
  });
}

function applyFilters(stores, progressByStore, userEmail, picInfo) {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const picFilter = document.getElementById('pic-filter').value;

  let filteredStores = [...stores];

  // Lọc theo từ khóa tìm kiếm
  filteredStores = filteredStores.filter(store => 
    (store.storeId || '').toLowerCase().includes(query) ||
    (store.storeName || '').toLowerCase().includes(query) ||
    (store.buyerId || '').toLowerCase().includes(query)
  );

  // Lọc theo Status
  if (statusFilter !== 'All') {
    filteredStores = filteredStores.filter(store => 
      store.statusChurnThisMonth === statusFilter
    );
  }

  // Lọc theo PIC
  if (picFilter !== 'All') {
    filteredStores = filteredStores.filter(store => 
      store.finalCurrentPIC === picFilter
    );
  }

  updateTable(filteredStores, progressByStore, userEmail, picInfo);
}

function updateTable(stores, progressByStore, userEmail, picInfo) {
  const tbody = document.getElementById('stores-body');
  tbody.innerHTML = '';

  // Sắp xếp stores: 
  // 1. Active với No_Day_No_Buy > 20 lên đầu, sắp xếp theo lastOrderDate (mới nhất trước)
  // 2. Phần còn lại sắp xếp theo lastOrderDate (mới nhất trước)
  const sortedStores = [...stores].sort((a, b) => {
    const noDaysNoBuyA = calculateDaysSinceLastOrder(a.lastOrderDate);
    const noDaysNoBuyB = calculateDaysSinceLastOrder(b.lastOrderDate);
    const isCriticalA = a.statusChurnThisMonth === 'Active' && noDaysNoBuyA > 20;
    const isCriticalB = b.statusChurnThisMonth === 'Active' && noDaysNoBuyB > 20;

    if (isCriticalA && !isCriticalB) return -1;
    if (!isCriticalA && isCriticalB) return 1;

    const dateA = parseDate(a.lastOrderDate);
    const dateB = parseDate(b.lastOrderDate);
    return dateB - dateA;
  });

  sortedStores.forEach(store => {
    const noDaysNoBuy = calculateDaysSinceLastOrder(store.lastOrderDate);
    const lastOrderDisplay = store.lastOrderDate || 'N/A';
    const isCritical = store.statusChurnThisMonth === 'Active' && noDaysNoBuy > 20;
    const lastOrderClass = isCritical ? 'warning-last-order' : '';

    const row = document.createElement('tr');
    row.className = store.statusChurnThisMonth === 'Active' ? 'active-row' : 'churn-row';
    const isOpen = false;
    row.innerHTML = `
      <td>${store.storeId || 'N/A'}</td>
      <td>${store.storeName || 'N/A'}</td>
      <td>${store.buyerId || 'N/A'}</td>
      <td>${store.fullAddress || 'N/A'}</td>
      <td class="${lastOrderClass}">${lastOrderDisplay}</td>
      <td>${store.finalCurrentPIC || 'N/A'}</td>
      <td>${store.statusChurnThisMonth || 'N/A'}</td>
      <td>
        <button class="action-button">Action</button>
        <button class="journey-button">Journey</button>
      </td>
    `;
    tbody.appendChild(row);

    const progressRow = document.createElement('tr');
    progressRow.className = 'progress-row';
    if (isOpen) progressRow.classList.add('open');
    const progressItems = progressByStore[store.storeId] || [];
    const subTableContent = progressItems.map(item => {
      const isChurn = !!item.churnMonth;
      const header = isChurn 
        ? `${item.churnMonth} | ${item.typeOfChurn} | ${item.reason}`
        : `${item.activeMonth} | Active`;
      const tableClass = isChurn ? 'progress-table' : 'progress-table active-table';
      const columns = isChurn 
        ? `
          <th class="col-date">Ngày</th>
          <th class="col-pic">PIC</th>
          <th class="col-subteam">Subteam</th>
          <th class="col-contact">Loại liên hệ</th>
          <th class="col-action">Hành động</th>
          <th class="col-note">Ghi chú</th>
          <th class="col-reason">Lý do chưa re-awake</th>
        `
        : `
          <th class="col-date">Ngày</th>
          <th class="col-pic">PIC</th>
          <th class="col-subteam">Subteam</th>
          <th class="col-contact">Loại liên hệ</th>
          <th class="col-action">Hành động</th>
          <th class="col-note">Ghi chú</th>
        `;
      const rows = item.actions.length ? item.actions.map(action => `
        <tr>
          <td class="col-date">${action.contactDate}</td>
          <td class="col-pic">${action.PIC}</td>
          <td class="col-subteam">${action.subteam}</td>
          <td class="col-contact">${action.typeOfContact}</td>
          <td class="col-action">${action.action}</td>
          <td class="col-note">${action.note || ''}</td>
          ${isChurn ? `<td class="col-reason">${action.whyNotReawaken || ''}</td>` : ''}
        </tr>
      `).join('') : `
        <tr>
          <td colspan="${isChurn ? 7 : 6}"><p>Chưa có action nào để ${isChurn ? 'Re-awake' : 'quản lý'} khách hàng này cả</p></td>
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
    progressRow.innerHTML = `
      <td colspan="8">
        ${subTableContent}
      </td>
    `;
    tbody.appendChild(progressRow);

    const journeyBtn = row.querySelector('.journey-button');
    if (isOpen) journeyBtn.classList.add('active');
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
      document.getElementById('modal-action').value = '';
      document.getElementById('modal-note').value = '';
      document.getElementById('modal-why-not-reawaken').value = '';
      document.getElementById('modal-churn-month').value = '';
      document.getElementById('modal-active-month').value = '';

      // Lấy dữ liệu Active Month từ Ex Active History
      let activeMonth = '';
      try {
        const activeHistoryResponse = await fetch(`${PROXY_URL}/active-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: store.storeId })
        });
        const activeHistory = await activeHistoryResponse.json();
        if (activeHistory && activeHistory.length > 0) {
          activeMonth = activeHistory[0].activeMonth; // Lấy tháng Active gần nhất
        } else if (store.statusChurnThisMonth === 'Active' && calculateDaysSinceLastOrder(store.lastOrderDate) <= 30) {
          activeMonth = formatMonthYear(CURRENT_DATE); // Hiển thị tháng hiện tại nếu Active và gần đây
        } else {
          activeMonth = 'N/A (Active hiện tại)';
        }
      } catch (error) {
        console.error('Lỗi khi lấy Active History:', error);
        activeMonth = store.statusChurnThisMonth === 'Active' ? 'N/A (Active hiện tại)' : '';
      }

      // Xử lý toggle mặc định và kiểm tra Churn
      const progressItems = progressByStore[store.storeId] || [];
      const latestChurn = progressItems.find(item => !!item.churnMonth);

      const churnToggle = document.getElementById('churn-toggle');
      const activeToggle = document.getElementById('active-toggle');
      const churnFields = document.querySelectorAll('.churn-field');
      const activeFields = document.querySelectorAll('.active-field');

      // Xác định trạng thái ban đầu dựa trên việc có Churn hay không
      const hasChurn = !!latestChurn;
      if (hasChurn) {
        churnToggle.classList.add('active');
        activeToggle.classList.remove('active');
        churnFields.forEach(field => field.style.display = 'block');
        activeFields.forEach(field => field.style.display = 'none');
        churnToggle.disabled = false;
        document.getElementById('modal-churn-month').value = latestChurn.churnMonth || store.lastOrderDate || 'N/A';
      } else {
        churnToggle.classList.remove('active');
        activeToggle.classList.add('active');
        churnFields.forEach(field => field.style.display = 'none');
        activeFields.forEach(field => field.style.display = 'block');
        churnToggle.disabled = true;
        document.getElementById('modal-active-month').value = activeMonth;
      }

      // Thêm sự kiện toggle
      churnToggle.addEventListener('click', () => {
        if (!churnToggle.disabled) {
          churnToggle.classList.add('active');
          activeToggle.classList.remove('active');
          churnFields.forEach(field => field.style.display = 'block');
          activeFields.forEach(field => field.style.display = 'none');
        }
      });

      activeToggle.addEventListener('click', () => {
        activeToggle.classList.add('active');
        churnToggle.classList.remove('active');
        activeFields.forEach(field => field.style.display = 'block');
        churnFields.forEach(field => field.style.display = 'none');
        document.getElementById('modal-active-month').value = activeMonth;
      });
    });
  });

  const modal = document.getElementById('action-modal');
  const closeBtn = modal.querySelector('.close');
  const resetModal = () => {
    modal.classList.remove('active');
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
    if (event.target === modal) {
      resetModal();
    }
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

    if (!contactDate || !typeOfContact || !action) {
      showNotification('Vui lòng điền đầy đủ Contact Date, Type of Contact và Action!', 'error');
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

    submitBtn.disabled = true; // Vô hiệu hóa ngay khi bắt đầu
    try {
      showLoading();
      const endpoint = isChurnActive ? 'Churn Database' : 'Active Database';
      const response = await fetch(`${PROXY_URL}/submit?type=${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorText = await response.text();
        const errorStatus = response.status;
        throw Object.assign(new Error(`HTTP error! status: ${errorStatus}, ${errorText}`), { status: errorStatus });
      }
      const result = await response.json();
      if (result.success) {
        showNotification('Action đã được ghi nhận thành công!', 'success');
        const progressResponse = await fetch(`${PROXY_URL}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail })
        });
        if (progressResponse.ok) {
          const updatedProgress = await progressResponse.json();
          updateTable(stores, updatedProgress, userEmail, picInfo);
          const storeRow = Array.from(tbody.children).find(row => {
            return row.querySelector('td:first-child').textContent === storeId;
          });
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
        showNotification('Lỗi khi ghi dữ liệu: ' + (result.error || 'Không rõ nguyên nhân'), 'error');
      }
    } catch (error) {
      console.error('Lỗi khi submit action:', error);
      if (error.status === 429) {
        showNotification('Quá nhiều request. Vui lòng chờ 1-2 phút trước khi thử lại.', 'warning');
      } else {
        showNotification('Lỗi khi ghi dữ liệu: ' + (error.message || 'Vui lòng thử lại.'), 'error');
      }
    } finally {
      hideLoading();
      submitBtn.disabled = false;
      resetModal();
    }
  }, 300);

  submitBtn.addEventListener('click', () => {
    if (!submitBtn.disabled) {
      debouncedSubmit();
    }
  });
}