const { google } = require('googleapis');
const axios = require('axios');
const express = require('express');
const cors = require('cors');

// Khởi tạo Express app
const app = express();
app.use(express.json());
app.use(cors({ origin: 'https://cuonghuynhkamereo.github.io', credentials: true }));
app.options('*', cors());

// Hàm mã hóa đơn giản để bảo vệ email trong sessionStorage
function simpleEncrypt(text) {
  return btoa(text.split('').reverse().join(''));
}

// Hàm giải mã email từ sessionStorage
function simpleDecrypt(encrypted) {
  return atob(encrypted).split('').reverse().join('');
}

function showLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'flex';
}

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}

function showSuccessModal() {
  const modal = document.getElementById('success-modal');
  if (modal) {
    modal.style.display = 'flex';
    const okButton = document.getElementById('modal-ok');
    okButton.focus();
    okButton.onclick = () => {
      modal.style.animation = 'fadeOut 0.3s ease-in-out';
      setTimeout(() => {
        modal.style.display = 'none';
        modal.style.animation = 'fadeIn 0.3s ease-in-out';
        window.location.href = '/home';
      }, 300);
    };
  }
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
  const currentDate = new Date('2025-05-08');
  const diffTime = Math.abs(currentDate - lastOrder);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Endpoint /login
app.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: '1BUGQrNXqfWftJQlzzMj6umJz7yGeNAkGJnzji3zY2sc',
      range: 'Authentication!A:K'
    });
    const authRows = response.data.values || [];
    let isActive = false;

    for (let i = 1; i < authRows.length; i++) {
      if (authRows[i][2] === email && authRows[i][10] === 'Active') {
        isActive = true;
        break;
      }
    }

    if (isActive) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Email not found or account not active' });
    }
  } catch (error) {
    console.error('Error checking email:', error.stack);
    res.status(500).json({ error: 'Failed to check email' });
  }
});

// Xử lý client-side login
async function handleCredentialResponse(response) {
  showLoading();
  const profile = JSON.parse(atob(response.credential.split('.')[1]));
  const userEmail = profile.email;
  console.log('User email:', userEmail);
  const loginError = document.getElementById('login-error');

  if (!userEmail.endsWith('@kamereo.vn')) {
    hideLoading();
    if (loginError) {
      loginError.textContent = 'Vui lòng sử dụng tài khoản công ty (@kamereo.vn).';
      loginError.style.display = 'block';
    }
    return;
  }

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      sessionStorage.setItem('userEmail', simpleEncrypt(userEmail));
      showSuccessModal();
    } else {
      if (loginError) {
        loginError.textContent = data.error || 'Email không tồn tại hoặc tài khoản không hoạt động.';
        loginError.style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Lỗi khi đăng nhập:', error);
    if (loginError) {
      loginError.textContent = error.message.includes('aborted')
        ? 'Yêu cầu hết thời gian. Vui lòng kiểm tra kết nối và thử lại.'
        : `Lỗi khi đăng nhập: ${error.message}`;
      loginError.style.display = 'block';
    }
  } finally {
    hideLoading();
  }
}

// Serve HTML (cho client-side)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Chạy server trên Vercel
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { handleCredentialResponse }; // Xuất để dùng trong home.js nếu cần