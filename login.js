const PROXY_URL = 'https://reawake-server.onrender.com';

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

  if (!userEmail.endsWith('@kamereo.vn')) {
    hideLoading();
    loginError.textContent = 'Please use a company account (@kamereo.vn).';
    loginError.style.display = 'block';
    return;
  }

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
    loginError.textContent = error.message.includes('No internet') ? 'Please check your network connection.' : 'Error during sign-in. Please try again.';
    loginError.style.display = 'block';
  } finally {
    hideLoading();
  }
}