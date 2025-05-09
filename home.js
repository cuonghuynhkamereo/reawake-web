const { google } = require('googleapis');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const { handleCredentialResponse } = require('./login.js');

// Khởi tạo Express app
const app = express();
app.use(express.json());
app.use(cors({ origin: 'https://cuonghuynhkamereo.github.io', credentials: true }));
app.options('*', cors());

const CACHE_DURATION = 24 * 60 * 60 * 1000;
const CURRENT_DATE = new Date('2025-05-08');

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
  setTimeout(() => notification.classList.remove('show'), 3000);
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
      timeout = setTimeout(() => { isProcessing = false; }, wait);
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

async function getSheetsClient() {
  const credentials = require('./credentials.json');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const axiosInstance = axios.create({
    timeout: 5000,
    retry: 2,
    retryDelay: 1000
  });

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;
      if (!config || !config.retry) return Promise.reject(error);
      config.retryCount = config.retryCount || 0;
      if (config.retryCount >= config.retry) return Promise.reject(error);
      config.retryCount += 1;
      const delay = config.retryDelay * config.retryCount;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return axiosInstance(config);
    }
  );

  return {
    spreadsheets: {
      values: {
        get: async (options) => {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${options.spreadsheetId}/values/${options.range}`;
          const token = await auth.getAccessToken();
          const response = await axiosInstance.get(url, { headers: { Authorization: `Bearer ${token.token}` } });
          return { data: response.data };
        },
        append: async (options) => {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${options.spreadsheetId}/values/${options.range}:append?valueInputOption=${options.valueInputOption}`;
          const token = await auth.getAccessToken();
          const response = await axiosInstance.post(url, options.resource, { headers: { Authorization: `Bearer ${token.token}` } });
          return { data: response.data };
        },
        getById: async (options) => {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${options.spreadsheetId}`;
          const token = await auth.getAccessToken();
          const response = await axiosInstance.get(url, { headers: { Authorization: `Bearer ${token.token}` } });
          return { data: response.data };
        }
      }
    }
  };
}

// Endpoint /home
app.post('/home', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const sheets = await getSheetsClient();
    const picCode = email.split('@')[0];
    const authResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Authentication!A:M'
    });
    const authRows = authResponse.data.values || [];
    let picInfo = null;

    for (let i = 1; i < authRows.length; i++) {
      if (authRows[i][2] === email) {
        picInfo = {
          fullName: authRows[i][1] || '',
          email: authRows[i][2] || '',
          status: authRows[i][10] || '',
          team: authRows[i][4] || 'N/A',
        };
        break;
      }
    }

    if (!picInfo) return res.status(404).json({ error: 'Email not found in Authentication' });

    const decenResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Ex Decentralization!A:C'
    });
    const decenRows = decenResponse.data.values || [];
    const userDecen = decenRows.find(row => row[0] === picCode);
    if (userDecen) picInfo.subteam = userDecen[1] || 'N/A';
    else picInfo.subteam = 'N/A';

    const storeResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Ex Store_info!A:M'
    });
    const storeRows = storeResponse.data.values || [];
    let stores = [];

    const role = userDecen ? userDecen[2] : 'Member';
    if (role === 'Leader') {
      const subteamPICs = decenRows.filter(row => row[1] === picInfo.subteam && row[0]).map(row => row[0]);
      stores = storeRows.filter(row => row[5] && subteamPICs.includes(row[5])).map(row => ({
        storeId: row[0] || '',
        storeName: row[1] || '',
        buyerId: row[2] || '',
        fullAddress: row[9] || '',
        lastOrderDate: row[11] || '',
        finalCurrentPIC: row[5] || '',
        statusChurnThisMonth: row[12] || '',
        noDaysNoBuy: calculateDaysSinceLastOrder(row[11])
      }));
    } else {
      stores = storeRows.filter(row => row[5] === picCode).map(row => ({
        storeId: row[0] || '',
        storeName: row[1] || '',
        buyerId: row[2] || '',
        fullAddress: row[9] || '',
        lastOrderDate: row[11] || '',
        finalCurrentPIC: row[5] || '',
        statusChurnThisMonth: row[12] || '',
        noDaysNoBuy: calculateDaysSinceLastOrder(row[11])
      }));
    }

    stores.sort((a, b) => {
      const dateA = parseDate(a.lastOrderDate);
      const dateB = parseDate(b.lastOrderDate);
      return dateB - dateA;
    });

    res.json({ picInfo, stores });
  } catch (error) {
    console.error('Error fetching data:', error.stack);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Endpoint /progress
app.post('/progress', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const sheets = await getSheetsClient();
    const churnHistoryResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Ex Churn History!A:E'
    });
    const churnHistoryRows = churnHistoryResponse.data.values || [];
    const churnHistoryByStore = {};
    for (let i = 1; i < churnHistoryRows.length; i++) {
      const storeId = churnHistoryRows[i][0];
      if (!churnHistoryByStore[storeId]) churnHistoryByStore[storeId] = [];
      churnHistoryByStore[storeId].push({
        churnMonth: churnHistoryRows[i][1] || '',
        firstChurnMonth: churnHistoryRows[i][1] || '',
        typeOfChurn: churnHistoryRows[i][3] || '',
        reason: churnHistoryRows[i][4] || ''
      });
    }

    const activeHistoryResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Ex Active History!A:B'
    });
    const activeHistoryRows = activeHistoryResponse.data.values || [];
    const activeHistoryByStore = {};
    for (let i = 1; i < activeHistoryRows.length; i++) {
      const storeId = activeHistoryRows[i][0];
      if (!activeHistoryByStore[storeId]) activeHistoryByStore[storeId] = [];
      activeHistoryByStore[storeId].push({ activeMonth: activeHistoryRows[i][1] || '' });
    }

    const churnDatabaseResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Churn Database!A:J'
    });
    const churnDatabaseRows = churnDatabaseResponse.data.values || [];

    const activeDatabaseResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Active Database!A:I'
    });
    const activeDatabaseRows = activeDatabaseResponse.data.values || [];

    const picCode = email.split('@')[0];
    const decenResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Ex Decentralization!A:C'
    });
    const decenRows = decenResponse.data.values || [];
    const userDecen = decenRows.find(row => row[0] === picCode);
    const subteam = userDecen ? userDecen[1] : null;
    const role = userDecen ? userDecen[2] : null;

    const actionsByStore = {};
    const subteamPICs = role === 'Leader' && subteam ? decenRows.filter(row => row[1] === subteam && row[0]).map(row => row[0]) : [picCode];

    for (let i = 1; i < churnDatabaseRows.length; i++) {
      if (subteamPICs.includes(churnDatabaseRows[i][3])) {
        const storeId = churnDatabaseRows[i][0];
        if (!actionsByStore[storeId]) actionsByStore[storeId] = [];
        actionsByStore[storeId].push({
          contactDate: churnDatabaseRows[i][2] || '',
          PIC: churnDatabaseRows[i][3] || '',
          subteam: churnDatabaseRows[i][4] || '',
          typeOfContact: churnDatabaseRows[i][5] || '',
          action: churnDatabaseRows[i][6] || '',
          note: churnDatabaseRows[i][7] || '',
          whyNotReawaken: churnDatabaseRows[i][8] || '',
          churnMonth: churnDatabaseRows[i][9] || ''
        });
      }
    }

    for (let i = 1; i < activeDatabaseRows.length; i++) {
      if (subteamPICs.includes(activeDatabaseRows[i][3])) {
        const storeId = activeDatabaseRows[i][0];
        if (!actionsByStore[storeId]) actionsByStore[storeId] = [];
        actionsByStore[storeId].push({
          contactDate: activeDatabaseRows[i][2] || '',
          PIC: activeDatabaseRows[i][3] || '',
          subteam: activeDatabaseRows[i][4] || '',
          typeOfContact: activeDatabaseRows[i][5] || '',
          action: activeDatabaseRows[i][6] || '',
          note: activeDatabaseRows[i][7] || '',
          activeMonth: activeDatabaseRows[i][8] || '',
          whyNotReawaken: ''
        });
      }
    }

    const progressByStore = {};
    const allStoreIds = new Set([...Object.keys(churnHistoryByStore), ...Object.keys(activeHistoryByStore)]);

    allStoreIds.forEach(storeId => {
      if (!progressByStore[storeId]) progressByStore[storeId] = [];
      const churns = churnHistoryByStore[storeId] || [];
      churns.forEach((churn, index) => {
        const churnActions = (actionsByStore[storeId] || []).filter(action => action.churnMonth === churn.firstChurnMonth);
        churnActions.sort((a, b) => {
          const dateA = parseDate(a.contactDate);
          const dateB = parseDate(b.contactDate);
          return dateB - dateA;
        });
        progressByStore[storeId].push({
          churnMonth: churn.churnMonth,
          firstChurnMonth: churn.firstChurnMonth,
          typeOfChurn: churn.typeOfChurn,
          reason: churn.reason,
          actions: churnActions,
          churnIndex: index + 1
        });
      });
      const actives = activeHistoryByStore[storeId] || [];
      actives.forEach((active, index) => {
        const activeActions = (actionsByStore[storeId] || []).filter(action => action.activeMonth === active.activeMonth);
        if (activeActions.length > 0) {
          activeActions.sort((a, b) => {
            const dateA = parseDate(a.contactDate);
            const dateB = parseDate(b.contactDate);
            return dateB - dateA;
          });
          progressByStore[storeId].push({
            activeMonth: active.activeMonth,
            typeOfChurn: 'Active',
            reason: '',
            actions: activeActions,
            activeIndex: index + 1
          });
        }
      });
      progressByStore[storeId].sort((a, b) => {
        const monthA = a.firstChurnMonth || a.activeMonth || '';
        const monthB = b.firstChurnMonth || b.activeMonth || '';
        const [monthAVal, yearA] = monthA.split('/').map(Number);
        const [monthBVal, yearB] = monthB.split('/').map(Number);
        const dateA = new Date(yearA, monthAVal - 1);
        const dateB = new Date(yearB, monthBVal - 1);
        return dateB - dateA;
      });
    });

    res.json(progressByStore);
  } catch (error) {
    console.error('Error fetching progress:', error.stack);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Endpoint /submit
app.post('/submit', async (req, res) => {
  const { email, storeId, storeName, action, contactDate, PIC, subteam, typeOfContact, note, whyNotReawaken, churnMonthLastOrderDate, activeMonth } = req.body;
  const type = req.query.type;
  if (!email || !storeId || !contactDate || !typeOfContact || !action) return res.status(400).json({ error: 'Missing required fields' });

  const sheetName = type === 'Churn Database' ? 'Churn Database' : 'Active Database';
  const sheetRange = type === 'Churn Database' ? 'Churn Database!A:J' : 'Active Database!A:I';
  const values = type === 'Churn Database'
    ? [storeId, storeName || '', contactDate, PIC, subteam, typeOfContact, action, note || '', whyNotReawaken || '', churnMonthLastOrderDate]
    : [storeId, storeName || '', contactDate, PIC, subteam, typeOfContact, action, note || '', activeMonth];

  try {
    const sheets = await getSheetsClient();
    const spreadsheet = await sheets.spreadsheets.getById({ spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc' });
    const sheetExists = spreadsheet.data.sheets.some(sheet => sheet.properties.title === sheetName);
    if (!sheetExists) return res.status(400).json({ error: `Sheet '${sheetName}' does not exist in the spreadsheet` });

    const existingDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: `${sheetName}!A${2}:I`
    });
    const existingData = existingDataResponse.data.values || [];
    const isDuplicate = existingData.some(row => row[0] === storeId && row[2] === contactDate && row[6] === action);
    if (isDuplicate) return res.json({ success: true });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: sheetRange,
      valueInputOption: 'RAW',
      resource: { values: [values] }
    });

    if (!response.data.updates || response.data.updates.updatedRows !== 1) {
      console.error(`Failed to write data to ${sheetName}: No rows updated`);
      return res.status(500).json({ error: `Failed to write data to ${sheetName}: No rows updated` });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`Error writing data to ${sheetName}:`, error.stack);
    res.status(500).json({ error: `Failed to write data to ${sheetName}: ${error.message}` });
  }
});

// Endpoint /active-history
app.post('/active-history', async (req, res) => {
  const { storeId } = req.body;
  if (!storeId) return res.status(400).json({ error: 'Store ID is required' });

  try {
    const sheets = await getSheetsClient();
    const activeHistoryResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Ex Active History!A:B'
    });
    const activeHistoryRows = activeHistoryResponse.data.values || [];

    const storeActiveHistory = activeHistoryRows
      .filter(row => row[0] === storeId)
      .map(row => ({ activeMonth: row[1] || '' }))
      .sort((a, b) => {
        const [monthA, yearA] = a.activeMonth.split('/').map(Number);
        const [monthB, yearB] = b.activeMonth.split('/').map(Number);
        const dateA = new Date(yearA, monthA - 1);
        const dateB = new Date(yearB, monthB - 1);
        return dateB - dateA;
      });

    res.json(storeActiveHistory);
  } catch (error) {
    console.error('Error fetching active history:', error.stack);
    res.status(500).json({ error: 'Failed to fetch active history' });
  }
});

// Client-side logic
document.addEventListener('DOMContentLoaded', async () => {
  const userEmail = sessionStorage.getItem('userEmail') ? simpleDecrypt(sessionStorage.getItem('userEmail')) : null;
  if (!userEmail) {
    window.location.href = '/';
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
    const response = await fetch('/home', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    const data = await response.json();

    if (data.error || !data.picInfo || !data.stores) {
      console.error('Dữ liệu server không hợp lệ:', data);
      showNotification(data.error || 'Dữ liệu không hợp lệ. Vui lòng thử lại.', 'error');
      window.location.href = '/';
      return;
    }

    localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
    displayData(data, userEmail);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu:', error);
    showNotification('Lỗi khi tải dữ liệu. Vui lòng thử lại.', 'error');
    window.location.href = '/';
  } finally {
    hideLoading();
  }
});

async function displayData(data, userEmail) {
  if (!data || !data.picInfo || !data.stores) {
    console.error('Dữ liệu không hợp lệ:', data);
    showNotification('Dữ liệu không hợp lệ. Vui lòng đăng nhập lại.', 'error');
    window.location.href = '/';
    return;
  }

  const { picInfo, stores } = data;
  document.getElementById('pic-name').textContent = picInfo.fullName || 'N/A';
  document.getElementById('pic-email').textContent = picInfo.email || 'N/A';
  document.getElementById('pic-team').textContent = picInfo.team || 'N/A';
  document.getElementById('pic-subteam').textContent = picInfo.subteam || 'N/A';

  let progressByStore;
  try {
    const progressResponse = await fetch('/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    if (!progressResponse.ok) throw new Error(`HTTP error! status: ${progressResponse.status}`);
    progressByStore = await progressResponse.json();
  } catch (error) {
    console.error('Lỗi khi lấy tiến trình:', error);
    progressByStore = {};
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
  updateTable(filteredStores, progressByStore, userEmail, picInfo);

  const statusFilter = document.getElementById('status-filter');
  statusFilter.addEventListener('change', () => applyFilters(stores, progressByStore, userEmail, picInfo));

  picFilter.addEventListener('change', () => applyFilters(stores, progressByStore, userEmail, picInfo));

  document.getElementById('search-button').addEventListener('click', () => applyFilters(stores, progressByStore, userEmail, picInfo));
}

function applyFilters(stores, progressByStore, userEmail, picInfo) {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const picFilter = document.getElementById('pic-filter').value;

  let filteredStores = [...stores];
  filteredStores = filteredStores.filter(store =>
    (store.storeId || '').toLowerCase().includes(query) ||
    (store.storeName || '').toLowerCase().includes(query) ||
    (store.buyerId || '').toLowerCase().includes(query)
  );

  if (statusFilter !== 'All') {
    filteredStores = filteredStores.filter(store => store.statusChurnThisMonth === statusFilter);
  }

  if (picFilter !== 'All') {
    filteredStores = filteredStores.filter(store => store.finalCurrentPIC === picFilter);
  }

  updateTable(filteredStores, progressByStore, userEmail, picInfo);
}

function updateTable(stores, progressByStore, userEmail, picInfo) {
  const tbody = document.getElementById('stores-body');
  tbody.innerHTML = '';

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
      const header = isChurn ? `${item.churnMonth} | ${item.typeOfChurn} | ${item.reason}` : `${item.activeMonth} | Active`;
      const tableClass = isChurn ? 'progress-table' : 'progress-table active-table';
      const columns = isChurn
        ? `<th class="col-date">Ngày</th><th class="col-pic">PIC</th><th class="col-subteam">Subteam</th><th class="col-contact">Loại liên hệ</th><th class="col-action">Hành động</th><th class="col-note">Ghi chú</th><th class="col-reason">Lý do chưa re-awake</th>`
        : `<th class="col-date">Ngày</th><th class="col-pic">PIC</th><th class="col-subteam">Subteam</th><th class="col-contact">Loại liên hệ</th><th class="col-action">Hành động</th><th class="col-note">Ghi chú</th>`;
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
        <tr><td colspan="${isChurn ? 7 : 6}"><p>Chưa có action nào để ${isChurn ? 'Re-awake' : 'quản lý'} khách hàng này cả</p></td></tr>
      `;

      return `
        <div class="churn-group">
          <h4>${header}</h4>
          <table class="${tableClass}">
            <thead><tr>${columns}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');
    progressRow.innerHTML = `<td colspan="8">${subTableContent}</td>`;
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

      let activeMonth = '';
      try {
        const activeHistoryResponse = await fetch('/active-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: store.storeId })
        });
        const activeHistory = await activeHistoryResponse.json();
        if (activeHistory && activeHistory.length > 0) activeMonth = activeHistory[0].activeMonth;
        else if (store.statusChurnThisMonth === 'Active' && calculateDaysSinceLastOrder(store.lastOrderDate) <= 30) activeMonth = formatMonthYear(CURRENT_DATE);
        else activeMonth = 'N/A (Active hiện tại)';
      } catch (error) {
        console.error('Lỗi khi lấy Active History:', error);
        activeMonth = store.statusChurnThisMonth === 'Active' ? 'N/A (Active hiện tại)' : '';
      }

      const progressItems = progressByStore[store.storeId] || [];
      const latestChurn = progressItems.find(item => !!item.churnMonth);

      const churnToggle = document.getElementById('churn-toggle');
      const activeToggle = document.getElementById('active-toggle');
      const churnFields = document.querySelectorAll('.churn-field');
      const activeFields = document.querySelectorAll('.active-field');

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

    submitBtn.disabled = true;
    try {
      showLoading();
      const endpoint = isChurnActive ? 'Churn Database' : 'Active Database';
      const response = await fetch(`/submit?type=${endpoint}`, {
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
        const progressResponse = await fetch('/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail })
        });
        if (progressResponse.ok) {
          const updatedProgress = await progressResponse.json();
          updateTable(stores, updatedProgress, userEmail, picInfo);
          const storeRow = Array.from(tbody.children).find(row => row.querySelector('td:first-child').textContent === storeId);
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
      if (error.status === 429) showNotification('Quá nhiều request. Vui lòng chờ 1-2 phút trước khi thử lại.', 'warning');
      else showNotification('Lỗi khi ghi dữ liệu: ' + (error.message || 'Vui lòng thử lại.'), 'error');
    } finally {
      hideLoading();
      submitBtn.disabled = false;
      resetModal();
    }
  }, 300);

  submitBtn.addEventListener('click', () => {
    if (!submitBtn.disabled) debouncedSubmit();
  });
}

// Serve HTML
app.get('/home', (req, res) => {
  res.sendFile(__dirname + '/home.html');
});

// Chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});