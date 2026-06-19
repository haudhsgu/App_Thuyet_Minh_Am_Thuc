const defaultServerUrl = window.location.port === '3000'
  ? `${window.location.protocol}//${window.location.hostname}:5080`
  : (window.location.port === '5080' ? window.location.origin : `${window.location.protocol}//${window.location.hostname}:5080`);

const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMessage.innerText = '';

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  try {
    const response = await fetch(`${defaultServerUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (response.ok) {
      const data = await response.json();
      
      // Save details to localStorage for session persistence
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userRole', data.user.role);
      localStorage.setItem('username', data.user.username);
      localStorage.setItem('userId', data.user.id);
      localStorage.setItem('deviceUniqueId', data.user.deviceUniqueId);

      // Redirect depending on user role
      if (data.user.role === 'Admin') {
        window.location.href = 'admin.html';
      } else if (data.user.role === 'Owner') {
        window.location.href = 'owner.html';
      } else {
        errorMessage.innerText = 'Vai trò người dùng không hợp lệ.';
      }
    } else {
      const errorText = await response.text();
      errorMessage.innerText = errorText || 'Đăng nhập thất bại. Vui lòng kiểm tra lại.';
    }
  } catch (err) {
    console.error('Login error:', err);
    errorMessage.innerText = 'Lỗi kết nối đến máy chủ. Vui lòng kiểm tra lại mạng.';
  }
});
