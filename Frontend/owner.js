const defaultServerUrl = (() => {
  if (window.location.protocol === 'file:') {
    return 'http://localhost:5080';
  }
  if (window.location.port === '5080' || window.location.port === '7089') {
    return window.location.origin;
  }
  if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '5241') {
    return `${window.location.protocol}//${window.location.hostname}:5080`;
  }
  if (window.location.port === '3000' || window.location.port === '4173' || window.location.port === '4200') {
    return `${window.location.protocol}//${window.location.hostname}:5080`;
  }
  if (window.location.protocol === 'https:') {
    return `${window.location.protocol}//${window.location.hostname}:7089`;
  }
  return `${window.location.protocol}//${window.location.hostname}:5080`;
})();

const token = localStorage.getItem('authToken');
const role = localStorage.getItem('userRole');
const username = localStorage.getItem('username');

// Authentication check
if (!token || role !== 'Owner') {
  localStorage.clear();
  window.location.href = 'login.html';
}

let ownerMap;
let stallMarker = null;
let currentStall = null;

// UI Elements
const ownerNameSpan = document.getElementById('owner-name');
const logoutBtn = document.getElementById('logout-btn');
const notifyBell = document.getElementById('notify-bell');
const notifyCount = document.getElementById('notify-count');
const notifyList = document.getElementById('notify-list');
const notificationsContent = document.getElementById('notifications-content');

const stallForm = document.getElementById('stall-form');
const stallNameInput = document.getElementById('stallName');
const stallAddressInput = document.getElementById('stallAddress');
const latInput = document.getElementById('latitude');
const lngInput = document.getElementById('longitude');
const descInput = document.getElementById('description');
const stallStatusSpan = document.getElementById('stall-status');
const submitFeedback = document.getElementById('submit-feedback');

const aiQuotaSpan = document.getElementById('ai-quota');
const aiEnhanceBtn = document.getElementById('ai-enhance-btn');
const aiResponseDiv = document.getElementById('ai-response');
const aiApplyBtn = document.getElementById('ai-apply-btn');
const aiStatusText = document.getElementById('ai-status-text');

// Init details on load
window.addEventListener('DOMContentLoaded', () => {
  ownerNameSpan.innerText = `Chủ quán: ${username}`;
  
  // Wire notification toggle
  notifyBell.addEventListener('click', (e) => {
    e.stopPropagation();
    notifyList.style.display = notifyList.style.display === 'block' ? 'none' : 'block';
  });

  document.addEventListener('click', () => {
    notifyList.style.display = 'none';
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
  });

  loadStallDetails();
  loadNotifications();
  loadAiUsage();

  aiEnhanceBtn.addEventListener('click', enhanceDescription);
  aiApplyBtn.addEventListener('click', applyAiDescription);
});

// Load food stall details
async function loadStallDetails() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/owner/pois`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const stalls = await response.json();
      if (stalls && stalls.length > 0) {
        currentStall = stalls[0]; // Active owner stall
        
        stallNameInput.value = currentStall.name;
        stallAddressInput.value = currentStall.address;
        latInput.value = currentStall.latitude.toFixed(6);
        lngInput.value = currentStall.longitude.toFixed(6);
        descInput.value = currentStall.originalHistory;

        // Render status badge
        updateStatusBadge(currentStall.isVerified, currentStall.adminNote);

        // Init Map
        initOwnerMap(currentStall.latitude, currentStall.longitude);
      } else {
        stallStatusSpan.innerText = 'Chưa có quán ăn';
        stallStatusSpan.style.background = '#3e3e50';
        initOwnerMap(10.760124, 106.702958);
      }
    }
  } catch (err) {
    console.error('Error loading stall:', err);
  }
}

function updateStatusBadge(isVerified, note) {
  if (isVerified) {
    stallStatusSpan.innerText = 'Đang hoạt động (Công khai)';
    stallStatusSpan.style.background = '#10B981';
    stallStatusSpan.style.color = '#ffffff';
    stallStatusSpan.title = note || '';
  } else {
    stallStatusSpan.innerText = 'Chờ duyệt / Ẩn';
    stallStatusSpan.style.background = '#F59E0B';
    stallStatusSpan.style.color = '#ffffff';
    stallStatusSpan.title = note || 'Đang chờ quản trị viên phê duyệt.';
  }
}

// Initialize map select/drag coordinates
function initOwnerMap(lat, lng) {
  ownerMap = L.map('owner-map', {
    zoomControl: true,
    attributionControl: false
  }).setView([lat, lng], 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(ownerMap);

  stallMarker = L.marker([lat, lng], {
    draggable: true,
    icon: L.divIcon({
      html: `<div class="pin-marker" style="background: #FF7A00; width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); margin: -11px 0 0 -11px; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
      className: 'custom-drag-icon',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    })
  }).addTo(ownerMap);

  // Update input on drag end
  stallMarker.on('dragend', () => {
    const position = stallMarker.getLatLng();
    latInput.value = position.lat.toFixed(6);
    lngInput.value = position.lng.toFixed(6);
  });

  ownerMap.on('click', (e) => {
    stallMarker.setLatLng(e.latlng);
    latInput.value = e.latlng.lat.toFixed(6);
    lngInput.value = e.latlng.lng.toFixed(6);
  });
}

// Update Food Stall Form Submit
stallForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitFeedback.innerText = '';
  submitFeedback.style.color = 'inherit';

  if (!currentStall) {
    submitFeedback.innerText = 'Lỗi: Không tìm thấy quán ăn của bạn.';
    submitFeedback.style.color = '#ff3333';
    return;
  }

  const payload = {
    id: currentStall.id,
    name: stallNameInput.value.trim(),
    address: stallAddressInput.value.trim(),
    latitude: parseFloat(latInput.value),
    longitude: parseFloat(lngInput.value),
    originalHistory: descInput.value.trim()
  };

  try {
    const response = await fetch(`${defaultServerUrl}/api/owner/pois/${currentStall.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      submitFeedback.innerText = 'Cập nhật thành công. Đang chờ Admin phê duyệt để hiển thị lên bản đồ.';
      submitFeedback.style.color = '#10B981';
      
      currentStall.isVerified = false;
      updateStatusBadge(false, 'Chờ duyệt thuyết minh mới.');
    } else {
      const errText = await response.text();
      submitFeedback.innerText = errText || 'Cập nhật thất bại.';
      submitFeedback.style.color = '#ff3333';
    }
  } catch (err) {
    console.error('Update POI failed:', err);
    submitFeedback.innerText = 'Lỗi kết nối máy chủ.';
    submitFeedback.style.color = '#ff3333';
  }
});

// Load owner notifications
async function loadNotifications() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/owner/notifications`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const list = await response.json();
      
      const unreadCount = list.filter(n => !n.isRead).length;
      if (unreadCount > 0) {
        notifyCount.innerText = unreadCount;
        notifyCount.style.display = 'block';
      } else {
        notifyCount.style.display = 'none';
      }

      if (list && list.length > 0) {
        notificationsContent.innerHTML = list.map(n => `
          <div class="notify-item" style="${n.isRead ? '' : 'background: rgba(255,122,0,0.05); font-weight: 600;'}">
            <div>${n.message}</div>
            <span class="time">${new Date(n.createdAt).toLocaleString()}</span>
          </div>
        `).join('');
      } else {
        notificationsContent.innerHTML = `<div class="notify-item" style="color: var(--text-gray); text-align: center;">Không có thông báo nào.</div>`;
      }
    }
  } catch (err) {
    console.error('Fetch notifications failed:', err);
  }
}

// Load AI quota remaining
async function loadAiUsage() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/ai/usage`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const usage = await response.json();
      const count = usage.count;
      const limit = usage.limit;
      
      aiQuotaSpan.innerText = `Hôm nay đã dùng: ${count}/${limit} lượt`;
      if (count >= limit) {
        aiEnhanceBtn.disabled = true;
        aiEnhanceBtn.style.opacity = '0.5';
      }
    }
  } catch (err) {
    console.warn('Load AI quota failed:', err);
  }
}

// Call AI Advisor API
async function enhanceDescription() {
  const currentDesc = descInput.value.trim();
  if (!currentDesc) {
    alert('Vui lòng nhập mô tả thuyết minh hiện tại để AI có dữ liệu tối ưu.');
    return;
  }

  aiStatusText.innerText = 'Đang gọi trợ lý AI Gemini (Tối đa 30s)...';
  aiResponseDiv.innerText = 'Đang tối ưu hóa thuyết minh của bạn...';
  aiEnhanceBtn.disabled = true;
  aiApplyBtn.style.display = 'none';

  try {
    const response = await fetch(`${defaultServerUrl}/api/ai/enhance-description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ description: currentDesc })
    });

    if (response.ok) {
      const data = await response.json();
      aiResponseDiv.innerText = data.enhancedText;
      aiStatusText.innerText = 'Tối ưu hóa thành công!';
      aiApplyBtn.style.display = 'inline-block';
      
      // Update quota
      loadAiUsage();
    } else {
      const errText = await response.text();
      aiResponseDiv.innerText = errText || 'Tối ưu hóa thất bại.';
      aiStatusText.innerText = 'Lỗi gọi AI.';
    }
  } catch (err) {
    console.error('AI call failed:', err);
    aiResponseDiv.innerText = 'Quá thời gian kết nối AI (30 giây) hoặc lỗi mạng.';
    aiStatusText.innerText = 'Lỗi kết nối AI.';
  } finally {
    aiEnhanceBtn.disabled = false;
  }
}

function applyAiDescription() {
  const aiText = aiResponseDiv.innerText.trim();
  if (aiText && !aiText.startsWith('Kết quả') && !aiText.startsWith('Tối ưu hóa thất bại')) {
    descInput.value = aiText;
    aiApplyBtn.style.display = 'none';
    aiStatusText.innerText = 'Đã áp dụng mô tả AI vào bài viết gốc!';
  }
}
