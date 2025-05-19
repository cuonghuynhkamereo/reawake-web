let progressByStore = {};
let dropdownChurnActions = {};
let dropdownActiveActions = [];
let dropdownWhyReasons = {};
let picInfo = {};

const PROXY_URL = 'http://localhost:3000';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const CURRENT_DATE = new Date();
const ITEMS_PER_PAGE = 20;

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
  
  // Use longer duration for errors
  const duration = type === 'error' ? 6000 : 3000;
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, duration);
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
    { pattern: /^(\d{2})\/(\d{4})$/, parse: ([_, m, y]) => new Date(`${y}-${m}-01`) }
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

function formatDateToDDMMYYYY(date) {
  if (!date || isNaN(date)) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function calculateDaysSinceLastOrder(lastOrderDate) {
  const lastOrder = parseDate(lastOrderDate);
  if (isNaN(lastOrder) || lastOrder.getTime() === 0) {
    return Infinity; // Nếu không có ngày hợp lệ, coi như "rất lâu"
  }
  const diffTime = Math.abs(CURRENT_DATE - lastOrder);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatMonthYear(date) {
  if (!date || isNaN(date)) return '';
  return date.toLocaleString('en-US', { month: '2-digit', year: 'numeric' }).replace(/(\d+)\/(\d+)/, '$1/$2');
}

function formatDateToYYYYMMDD(date) {
  if (!date || isNaN(date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRangeForChurn(churnMonth) {
  const churnDate = parseDate(churnMonth);
  const minDate = new Date(churnDate.getFullYear(), churnDate.getMonth(), 1);
  const maxDate = new Date(CURRENT_DATE);
  return { minDate, maxDate };
}

function getDateRangeForActive(activeMonth) {
  const activeDate = parseDate(activeMonth);
  const minDate = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
  const maxDate = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 0); // Ngày cuối của tháng
  maxDate.setHours(23, 59, 59, 999); // Đảm bảo lấy hết ngày cuối
  return { minDate, maxDate };
}

function isDateInRange(date, minDate, maxDate) {
  return date >= minDate && date <= maxDate;
}

function updateLastUpdated() {
  const lastUpdated = document.getElementById('last-updated');
  if (lastUpdated) {
    const now = new Date(CURRENT_DATE); // Dùng CURRENT_DATE để đồng bộ thời gian
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let displayDate;

    // So sánh thời gian hiện tại với 11:00 AM
    if (currentHour < 11 || (currentHour === 11 && currentMinute < 0)) {
      // Trước 11:00 AM: giữ ngày hiện tại
      displayDate = now;
    } else {
      // Từ 11:00 AM trở đi: hiển thị ngày hiện tại
      displayDate = now;
    }

    const formattedDate = formatDateToDDMMYYYY(displayDate);
    lastUpdated.textContent = `11:00 am - ${formattedDate}`;
  }
}

let currentPage = 1;
let totalPages = 1;
let filteredStores = [];
let userEmail = '';

const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && currentPage < totalPages && typeof progressByStore !== 'undefined') {
    currentPage++;
    updateTable(filteredStores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
  }
}, { threshold: 0.1 });

// Add sentinel element for Intersection Observer
function addSentinel() {
  const sentinel = document.createElement('tr');
  sentinel.id = 'sentinel';
  sentinel.style.height = '1px'; // Đảm bảo không ảnh hưởng giao diện
  document.getElementById('stores-body').appendChild(sentinel);
  observer.observe(sentinel); // Quan sát sentinel thay vì tbody
}

document.addEventListener('DOMContentLoaded', async () => {
  userEmail = sessionStorage.userEmail;
  if (!userEmail) {
    window.location.href = 'index.html';
    return;
  }

  updateLastUpdated();

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
    displayData(cachedData.data, userEmail);
  } else {
    await fetchAndDisplayData(userEmail, cacheKey);
  }

  const resetButton = document.getElementById('reset-button');
  resetButton.addEventListener('click', async () => {
    await performFullDataRefresh();
    showNotification('All data has been refreshed successfully!', 'success');
  });
  
  addSentinel(); // Thêm sentinel khi khởi tạo
});

// New function to handle complete data refresh
async function performFullDataRefresh() {
  showLoading();
  try {
    // Clear cache
    const cacheKey = `homeData_${userEmail}`;
    localStorage.removeItem(cacheKey);
    
    // Fetch fresh customer data
    const response = await fetch(`${PROXY_URL}/home?force=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    
    const data = await response.json();
    if (data.error || !data.picInfo || !data.stores) {
      throw new Error(data.error || 'Invalid data received');
    }
    
    // Update global variables
    picInfo = data.picInfo;
    stores = data.stores;
    
    // Fetch dropdown data (in parallel)
    const [churnActionsResponse, activeActionsResponse, whyReasonsResponse] = await Promise.all([
      fetch(`${PROXY_URL}/dropdown-churn-actions`),
      fetch(`${PROXY_URL}/dropdown-active-actions`),
      fetch(`${PROXY_URL}/dropdown-why-reasons`)
    ]);
    
    // Process dropdown data
    if (churnActionsResponse.ok) {
      const churnActionsData = await churnActionsResponse.json();
      dropdownChurnActions = {};
      churnActionsData.forEach(row => {
        if (!dropdownChurnActions[row.typeOfChurn]) dropdownChurnActions[row.typeOfChurn] = [];
        dropdownChurnActions[row.typeOfChurn].push(row.churnAction);
      });
    }
    
    if (activeActionsResponse.ok) {
      dropdownActiveActions = await activeActionsResponse.json();
    }
    
    if (whyReasonsResponse.ok) {
      const whyReasonsData = await whyReasonsResponse.json();
      dropdownWhyReasons = {};
      whyReasonsData.forEach(row => {
        if (!dropdownWhyReasons[row.typeOfChurn]) dropdownWhyReasons[row.typeOfChurn] = [];
        dropdownWhyReasons[row.typeOfChurn].push(row.whyNotReawaken);
      });
    }
    
    // THIS IS THE KEY CHANGE - fetch progress data with the same method used after submission
    const progressResponse = await fetch(`${PROXY_URL}/progress?force=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    
    if (progressResponse.ok) {
      progressByStore = await progressResponse.json();
    } else {
      throw new Error(`Failed to fetch progress data: ${progressResponse.status}`);
    }
    
    // Reset filters
    document.getElementById('search-store-id').value = '';
    document.getElementById('search-store-name').value = '';
    document.getElementById('search-buyer-id').value = '';
    document.getElementById('pic-filter').value = 'All';
    document.getElementById('status-filter').value = 'All';
    
    // Update last updated time
    updateLastUpdated();
    
    // Reset filtering and update table display
    filteredStores = [...stores];
    currentPage = 1;
    totalPages = Math.ceil(filteredStores.length / ITEMS_PER_PAGE);
    
    // Apply filters and update table
    applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
    
    // Update localStorage with new data
    localStorage.setItem(cacheKey, JSON.stringify({
      data: { picInfo, stores },
      timestamp: new Date().getTime()
    }));
  } catch (error) {
    console.error('Error refreshing data:', error);
    showNotification('Failed to refresh data: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

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

async function displayData(data, userEmailParam) {
  userEmail = userEmailParam; // Cập nhật userEmail toàn cục
  if (!data || !data.picInfo || !data.stores || !Array.isArray(data.stores)) {
    console.error('Invalid data:', data);
    showNotification('Invalid data. Please log in again.', 'error');
    window.location.href = 'index.html';
    return;
  }

  const { picInfo: picInfoData, stores } = data;
  picInfo = picInfoData; // Cập nhật picInfo toàn cục
  document.getElementById('pic-name').textContent = picInfo.fullName || 'N/A';
  document.getElementById('pic-email').textContent = picInfo.email || 'N/A';
  document.getElementById('pic-team').textContent = picInfo.team || 'N/A';
  document.getElementById('pic-subteam').textContent = picInfo.subteam || 'N/A';

  progressByStore = {}; // Khởi tạo lại progressByStore
  dropdownChurnActions = {};
  dropdownActiveActions = [];
  dropdownWhyReasons = {};

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
  picFilter.innerHTML = '<option value="All">All</option>';
  const uniquePICs = [...new Set(stores.map(store => store.finalCurrentPIC).filter(pic => pic && pic !== 'N/A'))];
  uniquePICs.sort();
  uniquePICs.forEach(pic => {
    const option = document.createElement('option');
    option.value = pic;
    option.textContent = pic;
    picFilter.appendChild(option);
  });

  filteredStores = [...stores];

  // Sắp xếp filteredStores ngay từ đầu
  filteredStores.sort((a, b) => {
    const noDaysNoBuyA = calculateDaysSinceLastOrder(a.lastOrderDate);
    const noDaysNoBuyB = calculateDaysSinceLastOrder(b.lastOrderDate);
    const isCriticalA = a.statusChurnThisMonth === 'Active' && noDaysNoBuyA > 20;
    const isCriticalB = b.statusChurnThisMonth === 'Active' && noDaysNoBuyB > 20;

    // Ưu tiên các store Active và chưa mua trên 20 ngày
    if (isCriticalA && !isCriticalB) return -1;
    if (!isCriticalA && isCriticalB) return 1;

    // Nếu cả hai đều là "critical", sắp xếp theo số ngày chưa mua (giảm dần)
    if (isCriticalA && isCriticalB) {
      // Xử lý trường hợp Infinity
      if (noDaysNoBuyA === Infinity && noDaysNoBuyB === Infinity) return 0;
      if (noDaysNoBuyA === Infinity) return -1; // Store A chưa mua lâu hơn
      if (noDaysNoBuyB === Infinity) return 1;  // Store B chưa mua lâu hơn
      return noDaysNoBuyB - noDaysNoBuyA; // So sánh bình thường
    }

    // Còn lại, sắp xếp theo ngày đặt hàng cuối (mới nhất lên đầu)
    const dateA = a.lastOrderDate ? parseDate(a.lastOrderDate) : new Date(0);
    const dateB = b.lastOrderDate ? parseDate(b.lastOrderDate) : new Date(0);
    return dateB - dateA || (a.storeId.localeCompare(b.storeId));
  });

  // Log filteredStores sau khi sắp xếp để kiểm tra
  filteredStores.forEach((store, index) => {
    const noDaysNoBuy = calculateDaysSinceLastOrder(store.lastOrderDate);
    const isCritical = store.statusChurnThisMonth === 'Active' && noDaysNoBuy > 20;
    // console.log(`Initial Sorted Store [${index}]: ${store.storeId}, Status: ${store.statusChurnThisMonth}, Last Order: ${store.lastOrderDate}, No Days No Buy: ${noDaysNoBuy}, Is Critical: ${isCritical}`);
  });

  totalPages = Math.ceil(filteredStores.length / ITEMS_PER_PAGE);
  updateTable(filteredStores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);

  const statusFilter = document.getElementById('status-filter');
  statusFilter.addEventListener('change', debounce(() => {
    applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
  }, 300));

  picFilter.addEventListener('change', debounce(() => {
    applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
  }, 300));

  const searchInputs = ['store-id', 'store-name', 'buyer-id'];
  searchInputs.forEach(field => {
    const input = document.getElementById(`search-${field}`);
    input.addEventListener('input', debounce(() => {
      applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
    }, 300));
  });

  const weekFilter = document.getElementById('week-filter');
  weekFilter.innerHTML = '<option value="">All Weeks</option>';
  getWeekOptions(progressByStore).forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    weekFilter.appendChild(option);
  });
  weekFilter.value = '';

  // Thêm sự kiện change cho weekFilter
  weekFilter.addEventListener('change', debounce(() => {
    applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
  }, 300));
}

function applyFilters(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons) {
  // Log để kiểm tra số lượng store Active trong toàn bộ danh sách
  const activeStoresCount = stores.filter(store => store.statusChurnThisMonth === 'Active').length;
  // console.log(`Total stores: ${stores.length}, Active stores: ${activeStoresCount}`);

  const searchStoreId = document.getElementById('search-store-id').value.trim().toLowerCase();
  const searchStoreName = document.getElementById('search-store-name').value.trim().toLowerCase();
  const searchBuyerId = document.getElementById('search-buyer-id').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const picFilter = document.getElementById('pic-filter').value;
  const weekFilter = document.getElementById('week-filter').value;

  filteredStores = [...stores];

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

  const selectedWeek = document.getElementById('week-filter').value;
  if (selectedWeek) {
    const weekStart = parseDate(selectedWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    filteredStores = filteredStores.filter(store => {
      const storeProgress = progressByStore[store.storeId] || [];
      return storeProgress.some(progress =>
        progress.actions && progress.actions.some(action => {
          const actionDate = parseDate(action.contactDate);
          return actionDate >= weekStart && actionDate <= weekEnd;
        })
      );
    });
  }

  // Log sau khi lọc
  const activeStoresAfterFilter = filteredStores.filter(store => store.statusChurnThisMonth === 'Active').length;
  // console.log(`Filtered stores: ${filteredStores.length}, Active stores after filter: ${activeStoresAfterFilter}`);

  // Sắp xếp toàn bộ filteredStores trước khi phân trang
  filteredStores.sort((a, b) => {
    const noDaysNoBuyA = calculateDaysSinceLastOrder(a.lastOrderDate);
    const noDaysNoBuyB = calculateDaysSinceLastOrder(b.lastOrderDate);
    const isCriticalA = a.statusChurnThisMonth === 'Active' && noDaysNoBuyA > 20;
    const isCriticalB = b.statusChurnThisMonth === 'Active' && noDaysNoBuyB > 20;

    // Ưu tiên các store Active và chưa mua trên 20 ngày
    if (isCriticalA && !isCriticalB) return -1;
    if (!isCriticalA && isCriticalB) return 1;

    // Nếu cả hai đều là "critical", sắp xếp theo số ngày chưa mua (giảm dần)
    if (isCriticalA && isCriticalB) {
      // Xử lý trường hợp Infinity
      if (noDaysNoBuyA === Infinity && noDaysNoBuyB === Infinity) return 0;
      if (noDaysNoBuyA === Infinity) return -1; // Store A chưa mua lâu hơn
      if (noDaysNoBuyB === Infinity) return 1;  // Store B chưa mua lâu hơn
      return noDaysNoBuyB - noDaysNoBuyA; // So sánh bình thường
    }

    // Còn lại, sắp xếp theo ngày đặt hàng cuối (mới nhất lên đầu)
    const dateA = a.lastOrderDate ? parseDate(a.lastOrderDate) : new Date(0);
    const dateB = b.lastOrderDate ? parseDate(b.lastOrderDate) : new Date(0);
    return dateB - dateA || (a.storeId.localeCompare(b.storeId));
  });

  // Log filteredStores sau khi sắp xếp để kiểm tra
  filteredStores.forEach((store, index) => {
    const noDaysNoBuy = calculateDaysSinceLastOrder(store.lastOrderDate);
    const isCritical = store.statusChurnThisMonth === 'Active' && noDaysNoBuy > 20;
    // console.log(`Sorted Store [${index}]: ${store.storeId}, Status: ${store.statusChurnThisMonth}, Last Order: ${store.lastOrderDate}, No Days No Buy: ${noDaysNoBuy}, Is Critical: ${isCritical}`);
  });

  currentPage = 1;
  totalPages = Math.ceil(filteredStores.length / ITEMS_PER_PAGE);
  updateTable(filteredStores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons);
}

async function fetchProgressForStore(storeId) {
  try {
    const response = await fetch(`${PROXY_URL}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching progress for store ${storeId}:`, error);
    return [];
  }
}

async function fetchAllProgress() {
  const newProgressByStore = {};
  
  // Show a loading indicator
  showLoading();
  
  try {
    // Get all store IDs
    const storeIds = stores.map(store => store.storeId);
    
    // Use Promise.all to fetch progress for all stores in parallel
    const progressPromises = storeIds.map(storeId => fetchProgressForStore(storeId));
    const progressResults = await Promise.all(progressPromises);
    
    // Build the new progressByStore object
    storeIds.forEach((storeId, index) => {
      newProgressByStore[storeId] = progressResults[index];
    });
    
    return newProgressByStore;
  } catch (error) {
    console.error('Error fetching all progress:', error);
    throw error;
  } finally {
    hideLoading();
  }
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartAndEndOfWeek(weekValue) {
  const weekStart = parseDate(weekValue);
  const startOfWeek = getStartOfWeek(weekStart);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // End of the week (7 days later)
  return [startOfWeek, endOfWeek];
}

function getWeekOptions(progressByStore) {
  const allDates = [];
  Object.values(progressByStore).forEach(items => {
    items.forEach(item => {
      (item.actions || []).forEach(action => {
        const d = parseDate(action.contactDate);
        if (!isNaN(d)) allDates.push(getStartOfWeek(d).getTime());
      });
    });
  });
  const uniqueWeeks = Array.from(new Set(allDates)).sort((a, b) => b - a);
  return uniqueWeeks.map(ts => {
    const d = new Date(ts);
    return {
      value: formatDateToYYYYMMDD(d),
      label: `${formatDateToDDMMYYYY(d)}`
    };
  });
}

function updateTable(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons) {
  // console.log(`Current Page: ${currentPage}, Total Pages: ${totalPages}`); // Thêm log để debug

  const tbody = document.getElementById('stores-body');
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const paginatedStores = stores.slice(startIdx, endIdx);

  if (currentPage === 1) tbody.innerHTML = ''; // Clear only on first page

  // Thêm log để kiểm tra dữ liệu trong trang hiện tại
  paginatedStores.forEach(store => {
    const noDaysNoBuy = calculateDaysSinceLastOrder(store.lastOrderDate);
    const isCritical = store.statusChurnThisMonth === 'Active' && noDaysNoBuy > 20;
    // console.log(`Store: ${store.storeId}, Status: ${store.statusChurnThisMonth}, Last Order: ${store.lastOrderDate}, No Days No Buy: ${noDaysNoBuy}, Is Critical: ${isCritical}`);
  });

  requestAnimationFrame(() => {
    paginatedStores.forEach(store => {
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
          <button class="action-button" data-store-id="${store.storeId || 'N/A'}">Action</button>
          <button class="journey-button" data-store-id="${store.storeId || 'N/A'}">Journey</button>
        </td>
      `;
      tbody.appendChild(row);

      const progressRow = document.createElement('tr');
      progressRow.className = 'progress-row';
      progressRow.setAttribute('data-store-id', store.storeId || 'N/A');
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
        const storeId = journeyBtn.getAttribute('data-store-id');
        const targetRow = tbody.querySelector(`.progress-row[data-store-id="${storeId}"]`);
        const isCurrentlyOpen = targetRow.classList.contains('open');
        if (isCurrentlyOpen) {
          targetRow.classList.remove('open');
          journeyBtn.classList.remove('active');
          row.classList.remove('open-row');
        } else {
          targetRow.classList.add('open');
          journeyBtn.classList.add('active');
          row.classList.add('open-row');
        }
      });

      const actionBtn = row.querySelector('.action-button');
      actionBtn.addEventListener('click', async () => {
        const storeId = actionBtn.getAttribute('data-store-id');
        const modal = document.getElementById('action-modal');
        modal.classList.add('active');

        document.getElementById('modal-store-id').value = storeId || 'N/A';
        const store = stores.find(s => s.storeId === storeId);
        document.getElementById('modal-store-name').value = store ? store.storeName || 'N/A' : 'N/A';
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
            body: JSON.stringify({ storeId })
          });
          if (!activeHistoryResponse.ok) throw new Error(`HTTP error! Status: ${activeHistoryResponse.status}`);
          activeHistory = await activeHistoryResponse.json();
          
          // Sort active history by date to find the most recent one
          activeHistory.sort((a, b) => {
            const dateA = parseDate(a.activeMonth);
            const dateB = parseDate(b.activeMonth);
            return dateB - dateA; // Sort descending (newest first)
          });
          
          // Get the most recent Active Month
          const latestActiveMonth = activeHistory.length > 0 ? activeHistory[0].activeMonth : null;
          
          // Add all active months to the dropdown
          activeHistory.forEach(history => {
            const option = document.createElement('option');
            option.value = history.activeMonth;
            option.textContent = history.activeMonth + (history.activeMonth === latestActiveMonth ? ' (Latest)' : '');
            activeMonthSelect.appendChild(option);
          });

          // Set the default value to most recent active month
          if (latestActiveMonth) {
            activeMonthSelect.value = latestActiveMonth;
          }
          // For currently active stores with recent orders
          else if (store && store.statusChurnThisMonth === 'Active' && calculateDaysSinceLastOrder(store.lastOrderDate) <= 30) {
            const currentMonth = formatMonthYear(CURRENT_DATE);
            const option = document.createElement('option');
            option.value = currentMonth;
            option.textContent = currentMonth + ' (Current Active)';
            activeMonthSelect.appendChild(option);
            activeMonthSelect.value = currentMonth;
          } 
          // If no active history but the store is active (fallback)
          else if (activeHistory.length === 0) {
            const option = document.createElement('option');
            option.value = 'N/A';
            option.textContent = 'N/A (Current Active)';
            activeMonthSelect.appendChild(option);
            activeMonthSelect.value = 'N/A';
          }
          
          // Disable the dropdown so user can't change it
          activeMonthSelect.disabled = true;
        } catch (error) {
          console.error('Error fetching Active History:', error);
          const option = document.createElement('option');
          option.value = 'N/A';
          option.textContent = store && store.statusChurnThisMonth === 'Active' ? 'N/A (Current Active)' : 'N/A';
          activeMonthSelect.appendChild(option);
          activeMonthSelect.value = 'N/A';
          activeMonthSelect.disabled = true;
        }

        const progressItems = progressByStore[storeId] || [];
        const latestChurn = progressItems.find(item => !!item.churnMonth);

        const churnToggle = document.getElementById('churn-toggle');
        const activeToggle = document.getElementById('active-toggle');
        const churnFields = document.querySelectorAll('.churn-field');
        const activeFields = document.querySelectorAll('.active-field');
        const contactDateInput = document.getElementById('modal-contact-date');
        const churnMonthInput = document.getElementById('modal-churn-month');

        // Replace old date range with 7-day restriction
        // Get current date consistently
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to midnight

        // Calculate sixDaysAgo correctly
        const sixDaysAgo = new Date(today);
        sixDaysAgo.setDate(today.getDate() - 6);
        sixDaysAgo.setHours(0, 0, 0, 0);

        // Set the HTML input constraints - this controls what the calendar shows
        contactDateInput.setAttribute('min', formatDateToYYYYMMDD(sixDaysAgo));
        contactDateInput.setAttribute('max', formatDateToYYYYMMDD(today));

        // Kiểm tra xem có lịch sử churn hay không để bật/tắt nút Churn
        if (latestChurn) {
          // Nếu có lịch sử churn, cho phép chọn cả Churn và Active
          churnToggle.disabled = false;
          // Mặc định chọn tab Active nếu store có status Active
          if (store.statusChurnThisMonth === 'Active') {
            activeToggle.classList.add('active');
            churnToggle.classList.remove('active');
            activeFields.forEach(field => field.style.display = 'block');
            churnFields.forEach(field => field.style.display = 'none');
            whyNotReawakenSelect.style.display = 'none';
            churnMonthInput.value = 'N/A';

            dropdownActiveActions.forEach(action => {
              const option = document.createElement('option');
              option.value = action;
              option.textContent = action;
              actionSelect.appendChild(option);
            });
          } else {
            // Nếu status là Churn, mặc định chọn tab Churn
            churnToggle.classList.add('active');
            activeToggle.classList.remove('active');
            churnFields.forEach(field => field.style.display = 'block');
            activeFields.forEach(field => field.style.display = 'none');
            whyNotReawakenSelect.style.display = 'block';
            churnMonthInput.value = latestChurn.churnMonth || store.lastOrderDate || 'N/A';

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
        } else {
          // Nếu không có lịch sử churn, tắt nút Churn và mặc định chọn Active
          churnToggle.disabled = true;
          activeToggle.classList.add('active');
          churnToggle.classList.remove('active');
          churnFields.forEach(field => field.style.display = 'none');
          activeFields.forEach(field => field.style.display = 'block');
          whyNotReawakenSelect.style.display = 'none';
          churnMonthInput.value = 'N/A';

          dropdownActiveActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action;
            actionSelect.appendChild(option);
          });
        }

        document.getElementById('modal-note').value = '';
        document.getElementById('modal-why-not-reawaken').value = '';

        contactDateInput.addEventListener('change', () => {
          const value = contactDateInput.value;
          if (value) {
            const date = new Date(value);
            contactDateInput.value = formatDateToYYYYMMDD(date);
            // Remove the code that auto-selects Active Month based on contact date
            // since we're now using the most recent Active Month from the database
          }
        });

        churnToggle.addEventListener('click', () => {
          if (!churnToggle.disabled) {
            churnToggle.classList.add('active');
            activeToggle.classList.remove('active');
            churnFields.forEach(field => field.style.display = 'block');
            activeFields.forEach(field => field.style.display = 'none');
            whyNotReawakenSelect.style.display = 'block';

            if (latestChurn) {
              churnMonthInput.value = latestChurn.churnMonth || store.lastOrderDate || 'N/A';
            } else {
              churnMonthInput.value = 'N/A';
            }
            contactDateInput.value = '';

            actionSelect.innerHTML = '<option value="">Select action</option>';
            whyNotReawakenSelect.innerHTML = '<option value="">Select reason</option>';
            if (latestChurn) {
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
          contactDateInput.value = '';
          
          // Keep the Active Month dropdown disabled
          activeMonthSelect.disabled = true;

          actionSelect.innerHTML = '<option value="">Select action</option>';
          dropdownActiveActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action;
            actionSelect.appendChild(option);
          });
        });

        // Remove date range update from activeMonthSelect change event
        activeMonthSelect.addEventListener('change', () => {
          if (!activeToggle.classList.contains('active')) return;
          // No need to update date range based on selected active month
        });
      });
    });

    // Đảm bảo sentinel ở cuối
    const sentinel = document.getElementById('sentinel');
    if (sentinel) tbody.appendChild(sentinel); // Di chuyển sentinel xuống cuối
    else addSentinel(); // Nếu chưa có sentinel, thêm mới

    const modal = document.getElementById('action-modal');
    const closeBtn = modal.querySelector('.close');
    const resetModal = () => {
      modal.classList.remove('active');
      document.getElementById('modal-note').value = '';
      document.getElementById('modal-contact-date').value = '';
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
        return;
      }

      // Update date validation to use the 7-day window
      const selectedContactDate = new Date(contactDate);
      selectedContactDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sixDaysAgo = new Date(today);
      sixDaysAgo.setDate(today.getDate() - 6);
      sixDaysAgo.setHours(0, 0, 0, 0);

      if (selectedContactDate < sixDaysAgo || selectedContactDate > today) {
        const minFormatted = formatDateToDDMMYYYY(sixDaysAgo);
        const maxFormatted = formatDateToDDMMYYYY(today);
        showNotification(`Contact Date must be between ${minFormatted} and ${maxFormatted} (last 7 days)!`, 'error');
        return;
      }

      const progressItems = progressByStore[storeId] || [];
      const isDuplicate = progressItems.some(item => {
        return item.actions.some(actionItem => 
          actionItem.contactDate === formatDateToDDMMYYYY(selectedContactDate) &&
          actionItem.typeOfContact === typeOfContact &&
          actionItem.action === action &&
          (isChurnActive ? item.churnMonth === churnMonthLastOrderDate : item.activeMonth === activeMonth)
        );
      });
      if (isDuplicate) {
        showNotification('This action already exists for the selected date and type!', 'error');
        return;
      }

      const payload = {
        email: userEmail,
        storeId,
        storeName,
        action,
        contactDate: formatDateToDDMMYYYY(selectedContactDate),
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
          resetModal(); // Close the modal immediately on success
          
          // Instead of just updating a single store's progress,
          // perform a full data refresh to ensure everything is up to date
          await performFullDataRefresh();
          
          // Hiển thị thông báo thành công sau khi refresh data xong
          showNotification('Action submitted successfully!', 'success');
        } else {
          hideLoading();
          setTimeout(() => {
            showNotification('Error recording data: ' + (result.error || 'Unknown reason'), 'error');
          }, 300);
        }
      } catch (error) {
        console.error('Error submitting action:', error);
        hideLoading();
        setTimeout(() => {
          if (error.status === 429) {
            showNotification('Too many requests. Please wait 1-2 minutes before trying again.', 'warning');
          } else {
            showNotification(error.message.includes('No internet') ? 'Please check your network connection.' : 'Error recording data: ' + (error.message || 'Please try again.'), 'error');
          }
        }, 300);
      } finally {
        submitBtn.disabled = false;
        // Remove this since we're handling modal close explicitly above
        // if (progressByStore[storeId]) resetModal();
      }
    }, 300);

    submitBtn.addEventListener('click', () => {
      if (!submitBtn.disabled) debouncedSubmit();
    });
  });
}