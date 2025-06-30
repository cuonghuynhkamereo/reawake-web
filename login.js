const PROXY_URL = 'https://reawake-server-wjmi.onrender.com';

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
  try {
    console.log("Auth response received, processing...");
    
    // Kiểm tra response có hợp lệ không
    if (!response || !response.credential) {
      console.error("Invalid credential response");
      hideLoading();
      document.getElementById('login-error').textContent = 'Invalid authentication response. Please try again.';
      document.getElementById('login-error').style.display = 'block';
      return;
    }
    
    // Lấy phần payload của JWT
    const parts = response.credential.split('.');
    if (parts.length !== 3) {
      console.error("JWT format invalid - expected 3 parts");
      hideLoading();
      document.getElementById('login-error').textContent = 'Authentication data format invalid.';
      document.getElementById('login-error').style.display = 'block';
      return;
    }
    
    // Xử lý base64url thành base64 standard
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Thêm padding nếu cần
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    
    // Decode base64 string với try-catch
    let decodedData;
    try {
      decodedData = atob(base64);
    } catch (error) {
      console.error("Failed to decode base64:", error);
      hideLoading();
      document.getElementById('login-error').textContent = 'Error processing login information. Please try again.';
      document.getElementById('login-error').style.display = 'block';
      return;
    }
    
    // Parse JSON
    let profile;
    try {
      profile = JSON.parse(decodedData);
    } catch (error) {
      console.error("Failed to parse JSON:", error);
      hideLoading();
      document.getElementById('login-error').textContent = 'Error processing user information. Please try again.';
      document.getElementById('login-error').style.display = 'block';
      return;
    }
    
    // Lấy email và tiếp tục xử lý
    const userEmail = profile.email;
    console.log("User email extracted:", userEmail);
    const loginError = document.getElementById('login-error');

    if (!userEmail.endsWith('@kamereo.vn')) {
      hideLoading();
      loginError.textContent = 'Please use a company account (@kamereo.vn).';
      loginError.style.display = 'block';
      return;
    }

    // Phần còn lại của code đăng nhập giữ nguyên
    try {
      const response = await fetch(`${PROXY_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
      if (!navigator.onLine) throw new Error('No internet connection');
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

      const data = await response.json();
      if (data.success) {
        sessionStorage.setItem('userEmail', userEmail);
        showSuccessModal();
      } else {
        loginError.textContent = data.error || 'Email not found or account not active.';
        loginError.style.display = 'block';
      }
    } catch (error) {
      console.error('Error checking email:', error);
      loginError.textContent = error.message.includes('No internet') 
        ? 'Please check your network connection.' 
        : 'Error during sign-in. Please try again.';
      loginError.style.display = 'block';
    } finally {
      hideLoading();
    }
  } catch (error) {
    console.error('Error processing login:', error);
    hideLoading();
    document.getElementById('login-error').textContent = 'Error during sign-in. Please try again.';
    document.getElementById('login-error').style.display = 'block';
  }
}

// Xử lý đăng nhập thủ công
document.addEventListener('DOMContentLoaded', () => {
  const manualLoginForm = document.getElementById('manual-login-form');
  
  if (manualLoginForm) {
    manualLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const loginError = document.getElementById('login-error');
      
      // Kiểm tra định dạng email
      if (!email.endsWith('@kamereo.vn')) {
        loginError.textContent = 'Please use a company account (@kamereo.vn).';
        loginError.style.display = 'block';
        return;
      }
      
      showLoading();
      
      try {
        const response = await fetch(`${PROXY_URL}/manual-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          // Đăng nhập thành công
          sessionStorage.setItem('userEmail', email);
          showSuccessModal();
        } else {
          // Đăng nhập thất bại
          loginError.textContent = data.error || 'Login failed. Please check your credentials.';
          loginError.style.display = 'block';
        }
      } catch (error) {
        console.error('Manual login error:', error);
        loginError.textContent = error.message.includes('No internet')
          ? 'Please check your network connection.'
          : 'Error during sign-in. Please try again.';
        loginError.style.display = 'block';
      } finally {
        hideLoading();
      }
    });
  }
});
