const PROXY_URL = 'https://reawake-server.vercel.app';

// Hàm mã hóa đơn giản để bảo vệ email trong sessionStorage
function simpleEncrypt(text) {
  return btoa(text.split('').reverse().join(''));
}

// Hàm giải mã email từ sessionStorage (dùng trong các file khác nếu cần)
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
        window.location.href = 'home.html';
      }, 300);
    };
  }
}

async function handleCredentialResponse(response) {
  showLoading();
  const profile = JSON.parse(atob(response.credential.split('.')[1]));
  const userEmail = profile.email;
  console.log('User email:', userEmail);
  const loginError = document.getElementById('login-error');

  // Kiểm tra domain @kamereo.vn
  if (!userEmail.endsWith('@kamereo.vn')) {
    hideLoading();
    if (loginError) {
      loginError.textContent = 'Vui lòng sử dụng tài khoản công ty (@kamereo.vn).';
      loginError.style.display = 'block';
    }
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout 5 giây
    const fetchResponse = await fetch(`${PROXY_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail }),
      signal: controller.signal,
      credentials: 'include' // Đề phòng trường hợp dùng cookie trong tương lai
    });
    clearTimeout(timeoutId);

    if (!fetchResponse.ok) {
      const errorData = await fetchResponse.json();
      throw new Error(errorData.error || `HTTP error! Status: ${fetchResponse.status}`);
    }

    const data = await fetchResponse.json();

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