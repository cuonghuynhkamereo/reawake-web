try {
  const PROXY_URL = 'http://localhost:3000';
} catch (error) {
  const PROXY_URL = 'https://reawake-server.vercel.app';
}

// const PROXY_URL = 'http://localhost:3000';
const PROXY_URL = 'https://reawake-server.vercel.app';

function showLoading() {
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

function showSuccessModal() {
  const modal = document.getElementById('success-modal');
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

async function handleCredentialResponse(response) {
  showLoading();
  const profile = JSON.parse(atob(response.credential.split('.')[1]));
  const userEmail = profile.email;
  console.log('User email:', userEmail);
  const loginError = document.getElementById('login-error');

  // Kiểm tra domain @kamereo.vn
  if (!userEmail.endsWith('@kamereo.vn')) {
    hideLoading();
    loginError.textContent = 'Vui lòng sử dụng tài khoản công ty (@kamereo.vn).';
    loginError.style.display = 'block';
    return;
  }

  try {
    const response = await fetch(`${PROXY_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    const data = await response.json();

    if (data.success) {
      sessionStorage.setItem('userEmail', userEmail);
      showSuccessModal();
    } else {
      loginError.textContent = data.error || 'Email không tồn tại hoặc tài khoản không hoạt động.';
      loginError.style.display = 'block';
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra email:', error);
    loginError.textContent = 'Lỗi khi đăng nhập. Vui lòng thử lại.';
    loginError.style.display = 'block';
  } finally {
    hideLoading();
  }
}