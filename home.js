let progressByStore = {};
let dropdownChurnActions = {};
let dropdownActiveActions = [];
let dropdownWhyReasons = {};
let picInfo = {};

const PROXY_URL = 'https://reawake-server.onrender.com';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const CURRENT_DATE = new Date();
const ITEMS_PER_PAGE = 20;

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

// Cập nhật hàm hiển thị notification
function showNotification(message, type = 'info') {
  // Kiểm tra xem notification đã tồn tại hay chưa, nếu chưa thì tạo mới
  let notification = document.getElementById('notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = 'notification';
    
    const messageElement = document.createElement('span');
    messageElement.id = 'notification-message';
    notification.appendChild(messageElement);
    
    document.body.appendChild(notification);
  }
  
  const messageElement = document.getElementById('notification-message');
  if (!messageElement) {
    console.error('Notification message element not found');
    return;
  }
  
  // Đặt nội dung thông báo
  messageElement.textContent = message;
  
  // Xóa animation timeout cũ nếu có
  if (window.notificationTimeout) {
    clearTimeout(window.notificationTimeout);
  }
  
  // Xóa tất cả class trước đó
  notification.className = 'notification';
  
  // Buộc trình duyệt redraw
  void notification.offsetWidth;
  
  // Thêm class loại thông báo
  notification.classList.add(type);
  
  // Hiển thị notification
  setTimeout(() => {
    notification.classList.add('active');
  }, 10);
  
  // Tự động ẩn sau 5 giây
  window.notificationTimeout = setTimeout(() => {
    notification.classList.remove('active');
  }, 5000);
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

// Thêm utility function thống nhất cho xử lý ngày
const dateUtils = {
  // Parse từ chuỗi dd/mm/yyyy hoặc yyyy-mm-dd thành Date
  parseDate: function(dateStr) {
    if (!dateStr) return null;
    
    if (typeof dateStr === 'object' && dateStr.value) {
      dateStr = dateStr.value;
    }
    
    if (typeof dateStr !== 'string') return null;
    
    let day, month, year;
    
    if (dateStr.includes('/')) { // dd/mm/yyyy
      [day, month, year] = dateStr.split('/').map(Number);
      return new Date(year, month - 1, day);
    } else if (dateStr.includes('-')) { // yyyy-mm-dd hoặc dd-mm-yyyy
      const parts = dateStr.split('-').map(Number);
      if (parts[0] > 1000) { // yyyy-mm-dd
        [year, month, day] = parts;
      } else { // dd-mm-yyyy
        [day, month, year] = parts;
      }
      return new Date(year, month - 1, day);
    }
    
    return null;
  },
  
  // Format từ Date sang dd/mm/yyyy
  formatToDDMMYYYY: function(date) {
    if (!(date instanceof Date)) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  },
  
  // Format từ Date sang yyyy-mm-dd
  formatToYYYYMMDD: function(date) {
    if (!(date instanceof Date)) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
};

function calculateDaysSinceLastOrder(lastOrderDate) {
  const lastOrder = dateUtils.parseDate(lastOrderDate);
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

function getDateRangeForChurn(churnMonth) {
  const churnDate = dateUtils.parseDate(churnMonth);
  const minDate = new Date(churnDate.getFullYear(), churnDate.getMonth(), 1);
  const maxDate = new Date(CURRENT_DATE);
  return { minDate, maxDate };
}

function getDateRangeForActive(activeMonth) {
  const activeDate = dateUtils.parseDate(activeMonth);
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

    const formattedDate = dateUtils.formatToDDMMYYYY(displayDate);
    lastUpdated.textContent = `11:00 am - ${formattedDate}`;
  }
}

let currentPage = 1;
let totalPages = 1;
let filteredStores = [];
let userEmail = '';

// Thêm hàm standardizeDateObjects ở phạm vi toàn cục
function standardizeDateObjects(data) {
  // Xử lý lastOrderDate trong danh sách stores
  if (data && data.stores) {
    data.stores.forEach(store => {
      if (typeof store.lastOrderDate === 'object' && store.lastOrderDate && store.lastOrderDate.value) {
        const dateParts = store.lastOrderDate.value.split('-');
        if (dateParts.length === 3) {
          store.lastOrderDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        } else {
          store.lastOrderDate = String(store.lastOrderDate.value);
        }
      }
    });
  }
  
  // Xử lý progressByStore nếu có
  if (data && data.progressByStore) {
    Object.keys(data.progressByStore).forEach(storeId => {
      const items = data.progressByStore[storeId];
      if (Array.isArray(items)) {
        items.forEach(item => {
          // Xử lý churnMonth nếu là object
          if (typeof item.churnMonth === 'object' && item.churnMonth && item.churnMonth.value) {
            const dateParts = item.churnMonth.value.split('-');
            if (dateParts.length === 3) {
              item.churnMonth = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            }
          }
          
          // Xử lý ngày trong actions
          if (item.actions && Array.isArray(item.actions)) {
            item.actions.forEach(action => {
              // Xử lý contactDate
              if (typeof action.contactDate === 'object' && action.contactDate && action.contactDate.value) {
                const dateParts = action.contactDate.value.split('-');
                if (dateParts.length === 3) {
                  action.contactDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                }
              }
              
              // Xử lý churnMonth trong action
              if (typeof action.churnMonth === 'object' && action.churnMonth && action.churnMonth.value) {
                const dateParts = action.churnMonth.value.split('-');
                if (dateParts.length === 3) {
      action.churnMonth = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                }
              }
            });
          }
        });
      }
    });
  }
  
  return data;
}

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
    
    // Also refresh motivation messages
    await fetchAndDisplayMotivationMessages();
    
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
    
    // Fetch progress data with the same method used after submission
    const progressResponse = await fetch(`${PROXY_URL}/progress?force=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    
    if (progressResponse.ok) {
      progressByStore = await progressResponse.json();
      
      // THÊM VÀO ĐÂY: Cập nhật bộ lọc week với dữ liệu progress mới
      updateWeekFilter(progressByStore);
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

    // Sử dụng hàm đã được định nghĩa ở phạm vi toàn cục
    const standardizedData = standardizeDateObjects(data);

    const now = new Date().getTime();
    localStorage.setItem(cacheKey, JSON.stringify({
      data: standardizedData,
      timestamp: now
    }));

    displayData(standardizedData, userEmail);
  } catch (error) {
    console.error('Error fetching data:', error);
    hideLoading();
    showNotification(error.message.includes('No internet') ? 'Please check your network connection.' : error.message || 'Failed to load data', 'error');
  } finally {
    hideLoading();
  }
}

async function displayData(data, userEmailParam) {
  // Chuẩn hóa dữ liệu ngày tháng
  data = standardizeDateObjects(data);
  
  userEmail = userEmailParam; // Tiếp tục với code hiện tại
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
    return noDaysNoBuyB - noDaysNoBuyA; // So sánh bình thường
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
  // Chuyển đổi lastOrderDate từ [object Object] sang chuỗi trước khi lọc
  stores.forEach(store => {
    if (typeof store.lastOrderDate === 'object' && store.lastOrderDate && store.lastOrderDate.value) {
      // Chuyển đổi từ yyyy-mm-dd sang dd/mm/yyyy
      const dateParts = store.lastOrderDate.value.split('-');
      if (dateParts.length === 3) {
        store.lastOrderDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
      } else {
        store.lastOrderDate = store.lastOrderDate.value;
      }
    }
  });
  
  // Log để kiểm tra số lượng store Active trong toàn bộ danh sách
  const activeStoresCount = stores.filter(store => store.statusChurnThisMonth === 'Active').length;

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
    const weekStart = dateUtils.parseDate(selectedWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    filteredStores = filteredStores.filter(store => {
      const storeProgress = progressByStore[store.storeId] || [];
      return storeProgress.some(progress =>
        progress.actions && progress.actions.some(action => {
          const actionDate = dateUtils.parseDate(action.contactDate);
          return actionDate >= weekStart && actionDate <= weekEnd;
        })
      );
    });
  }

  // Log sau khi lọc
  const activeStoresAfterFilter = filteredStores.filter(store => store.statusChurnThisMonth === 'Active').length;

  // Sắp xếp toàn bộ filteredStores trước khi phân trang
  filteredStores.sort((a, b) => {
    const noDaysNoBuyA = calculateDaysSinceLastOrder(a.lastOrderDate);
    const noDaysNoBuyB = calculateDaysSinceLastOrder(b.lastOrderDate);
    const isCriticalA = a.statusChurnThisMonth === 'Active' && noDaysNoBuyA > 20;
    const isCriticalB = b.statusChurnThisMonth === 'Active' && noDaysNoBuyB > 20;

    // Ưu tiên các store Active và chưa mua trên 20 ngày
    if (isCriticalA && !isCriticalB) return -1;
    if (!isCriticalA && isCriticalB) return 1;
    return noDaysNoBuyB - noDaysNoBuyA; // So sánh bình thường
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
  const weekStart = dateUtils.parseDate(weekValue);
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
        const d = dateUtils.parseDate(action.contactDate);
        if (!isNaN(d)) allDates.push(getStartOfWeek(d).getTime());
      });
    });
  });
  const uniqueWeeks = Array.from(new Set(allDates)).sort((a, b) => b - a);
  return uniqueWeeks.map(ts => {
    const d = new Date(ts);
    return {
      value: dateUtils.formatToYYYYMMDD(d),
      label: `${dateUtils.formatToDDMMYYYY(d)}`
    };
  });
}

function updateTable(stores, progressByStore, userEmail, picInfo, dropdownChurnActions, dropdownActiveActions, dropdownWhyReasons) {
  // Kiểm tra và xử lý đối tượng ngày tháng trước khi hiển thị
  stores.forEach(store => {
    if (typeof store.lastOrderDate === 'object' && store.lastOrderDate) {
      if (store.lastOrderDate.value) {
        const dateParts = store.lastOrderDate.value.split('-');
        if (dateParts.length === 3) {
          store.lastOrderDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        } else {
          store.lastOrderDate = String(store.lastOrderDate.value);
        }
      } else {
        store.lastOrderDate = 'N/A'; // Fallback nếu không có value
      }
    }
  });
  

  const tbody = document.getElementById('stores-body');
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const paginatedStores = stores.slice(startIdx, endIdx);

  if (currentPage === 1) tbody.innerHTML = ''; // Clear only on first page

  // Thêm log để kiểm tra dữ liệu trong trang hiện tại
  paginatedStores.forEach(store => {
    const noDaysNoBuy = calculateDaysSinceLastOrder(store.lastOrderDate);
    const isCritical = store.statusChurnThisMonth === 'Active' && noDaysNoBuy > 20;
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
        showActionModal();

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
          const activeHistory = await activeHistoryResponse.json();

          // Sort active history by date (most recent first)
          activeHistory.sort((a, b) => {
            const dateA = dateUtils.parseDate(a.activeMonth);
            const dateB = dateUtils.parseDate(b.activeMonth);
            return dateB - dateA;
          });

          // Get current month in the same format as activeMonth (MM/YYYY)
          const currentMonth = formatMonthYear(CURRENT_DATE);

          // Check if current month exists in active history
          const hasCurrentMonthInHistory = activeHistory.some(item => 
            item.activeMonth === currentMonth
          );

          // Determine which month to select - prioritize current month if store is Active
          let selectedMonth;
          if (store.statusChurnThisMonth === 'Active') {
            // For active stores, prefer current month
            selectedMonth = currentMonth;
          } else {
            // For non-active stores, use latest active month from history
            selectedMonth = activeHistory.length > 0 ? activeHistory[0].activeMonth : null;
          }

          // Populate dropdown with all history items
          activeHistory.forEach(item => {
            const option = document.createElement('option');
            option.value = item.activeMonth;
            option.textContent = item.activeMonth;
            activeMonthSelect.appendChild(option);
          });

          // Add current month if it's not in the history and store is Active
          if (store.statusChurnThisMonth === 'Active' && !hasCurrentMonthInHistory) {
            const option = document.createElement('option');
            option.value = currentMonth;
            option.textContent = currentMonth + ' (Current)';
            activeMonthSelect.appendChild(option);
          }

          // Select the appropriate month
          if (selectedMonth) {
            activeMonthSelect.value = selectedMonth;
          }

          // Keep the dropdown disabled as before
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
        contactDateInput.setAttribute('min', dateUtils.formatToYYYYMMDD(sixDaysAgo));
        contactDateInput.setAttribute('max', dateUtils.formatToYYYYMMDD(today));

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
            contactDateInput.value = dateUtils.formatToYYYYMMDD(date);
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
      hideActionModal();
      document.getElementById('modal-note').value = '';
      document.getElementById('modal-link-hubspot').value = ''; // Thêm dòng này
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
      const linkHubspot = document.getElementById('modal-link-hubspot').value; // Thêm dòng này
      const whyNotReawaken = document.getElementById('modal-why-not-reawaken').value;
      const churnToggle = document.getElementById('churn-toggle');
      const isChurnActive = !churnToggle.disabled && churnToggle.classList.contains('active');
      const churnMonthLastOrderDate = isChurnActive ? document.getElementById('modal-churn-month').value : '';
      const activeMonth = !isChurnActive ? document.getElementById('modal-active-month').value : '';

      if (!contactDate || !typeOfContact || !action || (!isChurnActive && !activeMonth)) {
        showNotification('Please fill in all required fields: Contact Date, Type of Contact, Action, and Active Month (if applicable)!', 'warning');
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
        const minFormatted = dateUtils.formatToDDMMYYYY(sixDaysAgo);
        const maxFormatted = dateUtils.formatToDDMMYYYY(today);
        showNotification(`Contact Date must be between ${minFormatted} and ${maxFormatted} (last 7 days)!`, 'error');
        return;
      }

      const payload = {
        email: userEmail,
        storeId,
        storeName,
        action,
        contactDate: dateUtils.formatToDDMMYYYY(selectedContactDate),
        PIC: pic,
        subteam,
        typeOfContact,
        note,
        linkHubspot, // Thêm dòng này
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
          hideLoading(); // Thêm dòng này
          resetModal();
          showSuccessModal();
        } else {
          hideLoading();
          setTimeout(() => {
            showNotification('Error recording data: ' + (result.error || 'Unknown reason'), 'error');
          }, 300);
        }
      } catch (error) {
        console.error('Error submitting action:', error);
        hideLoading(); // Đảm bảo ẩn loading trong mọi trường hợp
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

// Thêm hàm mới để cập nhật bộ lọc week
function updateWeekFilter(progressByStore) {
  const weekFilter = document.getElementById('week-filter');
  const selectedWeek = weekFilter.value;

  // Tạo fragment để batch update
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Weeks';
  fragment.appendChild(defaultOption);

  const weekOptions = getWeekOptions(progressByStore);
  weekOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    fragment.appendChild(option);
  });

  weekFilter.innerHTML = '';
  weekFilter.appendChild(fragment);

  // Giữ lại tuần đã chọn nếu còn tồn tại
  const weekExists = weekOptions.some(opt => opt.value === selectedWeek);
  weekFilter.value = weekExists ? selectedWeek : '';
}

// Cập nhật hàm hiển thị success modal
function showSuccessModal() {
  toggleModal('success-modal', true);
}

// Cập nhật hàm hiển thị export confirmation modal
function showExportConfirmationModal() {
  toggleModal('export-confirmation-modal', true);
}

function toggleModal(modalId, show = true) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  if (show) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
  } else {
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);
  }
}

// Cập nhật hàm ẩn export confirmation modal
function hideExportConfirmationModal() {
  toggleModal('export-confirmation-modal', false);
}

// Hàm lấy dữ liệu theo bộ lọc hiện tại
async function exportFilteredData() {
  showLoading();
  
  try {
    // Lấy danh sách store IDs đã được lọc
    const storeIds = filteredStores.map(store => store.storeId);
    
    // Lấy giá trị từ bộ lọc week
    const weekFilter = document.getElementById('week-filter').value;
    let weekValue = weekFilter;
    
    // Nếu chọn phương thức mới, chuyển từ định dạng YYYY-MM-DD_to_YYYY-MM-DD sang một ngày bắt đầu
    if (weekFilter && weekFilter.includes('_to_')) {
      const [startDate] = weekFilter.split('_to_');
      weekValue = startDate; // Chỉ lấy ngày bắt đầu
    }
    
    // Lấy dữ liệu progress đã được lọc từ server
    const response = await fetch(`${PROXY_URL}/export-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: userEmail,
        storeIds: storeIds,
        filters: {
          pic: document.getElementById('pic-filter').value,
          status: document.getElementById('status-filter').value,
          week: weekValue
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data || !data.success || !data.exportData) {
      throw new Error('Invalid data received from server');
    }
    
    // Xử lý dữ liệu - gộp cột Churn_Month và Month
    const processedData = data.exportData.map(item => {
      const newItem = {...item};
      
      // Nếu có Churn_Month, đặt giá trị cho Month và xóa Churn_Month
      if (newItem.Churn_Month !== undefined) {
        newItem.Month = newItem.Churn_Month;
        delete newItem.Churn_Month;
      }
      
      return newItem;
    });
    
    // Tạo và tải file Excel với dữ liệu đã xử lý
    generateAndDownloadExcel(processedData);
    
  } catch (error) {
    console.error('Error exporting data:', error);
    showNotification('Failed to export data: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

// Hàm tạo và tải file Excel
function generateAndDownloadExcel(data) {
  try {
    // Sử dụng thư viện SheetJS để tạo file Excel
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Export Data");
    
    // Tạo tên file theo định dạng pic_subteam_datetime
    const now = new Date();
    const dateTimeStr = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const picCode = userEmail.split('@')[0];
    const subteam = picInfo.subteam ? picInfo.subteam.replace(/\s+/g, '_') : 'all';
    const fileName = `${picCode}_${subteam}_${dateTimeStr}.xlsx`;
    
    // Tạo và tải file
    XLSX.writeFile(workbook, fileName);
    
    // Hiển thị thông báo thành công
    showNotification('Data exported successfully!', 'success');
  } catch (error) {
    console.error('Error generating Excel:', error);
    showNotification('Failed to generate Excel file: ' + error.message, 'error');
  }
}

// Thiết lập các sự kiện khi trang đã tải
document.addEventListener('DOMContentLoaded', () => {
  // Thêm vào DOMContentLoaded event để setup các event listeners
  const exportButton = document.getElementById('export-button');
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      showExportConfirmationModal();
    });
  }
  
  const exportYesBtn = document.getElementById('export-yes-btn');
  if (exportYesBtn) {
    exportYesBtn.addEventListener('click', () => {
      hideExportConfirmationModal();
      exportFilteredData();
    });
  }
  
  const exportNoBtn = document.getElementById('export-no-btn');
  if (exportNoBtn) {
    exportNoBtn.addEventListener('click', () => {
      hideExportConfirmationModal();
    });
  }
  
  // Thêm đoạn mã để load thư viện SheetJS (xlsx)
  if (typeof XLSX === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.async = true;
    document.head.appendChild(script);
  }

  // Thêm vào phần document.addEventListener('DOMContentLoaded', () => {...})
  const successOkBtn = document.getElementById('success-ok-btn');
  if (successOkBtn) {
    successOkBtn.addEventListener('click', () => {
      toggleModal('success-modal', false);
    });
  }
});

// Thêm hiệu ứng cho hàm hiển thị action modal
function showActionModal() {
  toggleModal('action-modal', true);
}

// Thêm hiệu ứng cho hàm ẩn action modal
function hideActionModal() {
  toggleModal('action-modal', false);
}

// Replace the existing DOMContentLoaded event at the end of the file

document.addEventListener('DOMContentLoaded', async function() {
  // Fetch motivation messages on initial page load
  await fetchAndDisplayMotivationMessages();
  
  // Other DOMContentLoaded code...
});

// Extract the rotation logic to a separate function
function setupChatBubbleRotation() {
  const chatBubbles = document.querySelectorAll('.chat-bubbles .chat-bubble');
  let currentBubbleIndex = 0;
  
  function rotateChatBubbles() {
    // Hide all bubbles
    chatBubbles.forEach(bubble => bubble.classList.remove('active'));
    
    // Show current bubble
    chatBubbles[currentBubbleIndex].classList.add('active');
    
    // Increment index for next rotation
    currentBubbleIndex = (currentBubbleIndex + 1) % chatBubbles.length;
    
    // Schedule next rotation
    setTimeout(rotateChatBubbles, 3500);
  }
  
  // Start the rotation
  if (chatBubbles.length > 0) {
    rotateChatBubbles();
  }
}

// Add this function before setupChatBubbleRotation()

async function fetchAndDisplayMotivationMessages() {
  try {
    const response = await fetch(`${PROXY_URL}/motivation-messages?force=true`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    
    const messages = await response.json();
    if (messages && messages.length > 0) {
      // Get chat-bubbles container
      const chatBubblesContainer = document.querySelector('.chat-bubbles');
      
      // Clear existing chat bubbles
      chatBubblesContainer.innerHTML = '';
      
      // Create new chat bubbles from fetched messages
      messages.forEach((message, index) => {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        if (index === 0) bubble.classList.add('active'); // Make first bubble active
        bubble.textContent = message;
        chatBubblesContainer.appendChild(bubble);
      });
      
      // Setup rotation for new bubbles
      setupChatBubbleRotation();
    }
  } catch (error) {
    console.error('Failed to load motivation messages:', error);
    // If fetch fails, still setup rotation for existing hardcoded bubbles
    setupChatBubbleRotation();
  }
}