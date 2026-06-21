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
if (!token || role !== 'Admin') {
  localStorage.clear();
  window.location.href = 'login.html';
}

let liveMap;
let mapStallsGroup = L.featureGroup();
let mapUsersGroup = L.featureGroup();
let activeTab = 'live-tracking';

// Admin UI state
let modalActionType = ''; // 'registration' or 'submission'
let modalTargetId = null;

// UI Elements
const adminNameSpan = document.getElementById('admin-name');
const logoutBtn = document.getElementById('logout-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const metricStalls = document.getElementById('metric-stalls');
const metricUsers = document.getElementById('metric-users');
const metricOnline = document.getElementById('metric-online');

const registrationsTableBody = document.getElementById('registrations-table-body');
const submissionsTableBody = document.getElementById('submissions-table-body');
const telemetryTableBody = document.getElementById('telemetry-table-body');

const noteModal = document.getElementById('note-modal');
const modalNoteText = document.getElementById('modal-note-text');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

// Initialize Admin Portal
window.addEventListener('DOMContentLoaded', () => {
  adminNameSpan.innerText = `Admin: ${username}`;

  logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
  });

  // Wire Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      activeTab = btn.getAttribute('data-tab');
      document.getElementById(activeTab).classList.add('active');

      if (activeTab === 'live-tracking' && liveMap) {
        // Redraw Leaflet map container fix
        setTimeout(() => liveMap.invalidateSize(), 100);
      }
    });
  });

  // Modal handlers
  modalCancelBtn.addEventListener('click', () => {
    noteModal.style.display = 'none';
    modalNoteText.value = '';
  });

  modalConfirmBtn.addEventListener('click', handleModalConfirm);

  // Initialize Map
  initLiveMap();

  // Load Dashboard Data
  refreshDashboardData();

  // Set interval to update metrics and live tracking map coordinates
  setInterval(refreshDashboardData, 10000);
});

// Refresh all live dashboard statistics
async function refreshDashboardData() {
  await loadMetrics();
  
  if (activeTab === 'live-tracking') {
    await loadLiveUsersOnMap();
  } else if (activeTab === 'registrations') {
    await loadRegistrations();
  } else if (activeTab === 'submissions') {
    await loadSubmissions();
  } else if (activeTab === 'stall-visits') {
    await loadStallVisitSummary();
  } else if (activeTab === 'telemetry') {
    await loadTelemetryLogs();
  }
}

// Load top metrics cards
async function loadMetrics() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/metrics`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      metricStalls.innerText = data.totalStalls;
      metricUsers.innerText = data.totalUsers;
      metricOnline.innerText = data.activeUsers;
    }
  } catch (err) {
    console.error('Load metrics failed:', err);
  }
}

// Initialize Leaflet Map for Admin Tracking
function initLiveMap() {
  const vinhKhanhCenter = [10.760124, 106.702958];
  liveMap = L.map('live-map', {
    zoomControl: true,
    attributionControl: false
  }).setView(vinhKhanhCenter, 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(liveMap);

  mapStallsGroup.addTo(liveMap);
  mapUsersGroup.addTo(liveMap);

  loadStallsOnMap();
}

// Draw static food stalls
async function loadStallsOnMap() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/foodstalls`);
    if (response.ok) {
      const stalls = await response.json();
      mapStallsGroup.clearLayers();

      stalls.forEach(stall => {
        // Only show verified stalls to general visitor, but show all to Admin
        const orangeIcon = L.divIcon({
          html: `<div class="pin-marker" style="background: ${stall.isVerified ? '#FF7A00' : '#858585'}; width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); margin: -11px 0 0 -11px; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.4);"></div>`,
          className: 'custom-stall-icon',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        L.marker([stall.latitude, stall.longitude], { icon: orangeIcon })
          .bindPopup(`<b>${stall.name}</b><br>${stall.address}<br>Trạng thái: ${stall.isVerified ? 'Công khai' : 'Đang duyệt'}`)
          .addTo(mapStallsGroup);
      });
    }
  } catch (err) {
    console.error('Failed loading stalls on admin map:', err);
  }
}

// Draw active live users pulse pins
async function loadLiveUsersOnMap() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/active-users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const users = await response.json();
      mapUsersGroup.clearLayers();

      users.forEach(user => {
        const blueRadarIcon = L.divIcon({
          html: `<div style="position: relative; width: 14px; height: 14px;">
                   <div style="background: #3b82f6; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white;"></div>
                   <div style="position: absolute; top: -5px; left: -5px; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #3b82f6; opacity: 0.5; animation: pulse 1.6s infinite;"></div>
                 </div>`,
          className: 'custom-user-radar',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const activeTime = new Date(user.lastActive).toLocaleTimeString();
        L.marker([user.latitude, user.longitude], { icon: blueRadarIcon })
          .bindPopup(`<b>Người dùng: ${user.username}</b><br>Vai trò: ${user.role}<br>Hoạt động lúc: ${activeTime}<br>Hành động cuối: <i>${user.lastAction}</i>`)
          .addTo(mapUsersGroup);
      });
    }
  } catch (err) {
    console.error('Failed drawing live users:', err);
  }
}

// Load registrations
async function loadRegistrations() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/registrations`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const list = await response.json();
      if (list.length === 0) {
        registrationsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-gray);">Không có hồ sơ đăng ký chủ quán nào.</td></tr>`;
        return;
      }

      registrationsTableBody.innerHTML = list.map(r => {
        let actionCell = `<span style="color: var(--text-gray); font-weight: 600;">${r.status === 'Approved' ? 'Đã duyệt' : 'Đã từ chối'}</span>`;
        if (r.status === 'Pending') {
          actionCell = `
            <button class="action-btn approve" onclick="approveRegistration('${r.id}')">Duyệt</button>
            <button class="action-btn reject" onclick="openRejectModal('registration', '${r.id}')">Từ chối</button>
          `;
        }

        return `
          <tr>
            <td><b>${r.fullName}</b></td>
            <td>${r.username}</td>
            <td><code>${r.cccd}</code></td>
            <td>${new Date(r.createdAt).toLocaleString()}</td>
            <td style="color: ${r.status === 'Pending' ? '#F59E0B' : (r.status === 'Approved' ? '#10B981' : '#EF4444')}; font-weight: bold;">${r.status}</td>
            <td>${actionCell}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Load registrations failed:', err);
  }
}

// Load stall submissions
async function loadSubmissions() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/submissions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const list = await response.json();
      if (list.length === 0) {
        submissionsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-gray);">Không có thuyết minh nào đang chờ phê duyệt.</td></tr>`;
        return;
      }

      submissionsTableBody.innerHTML = list.map(s => `
        <tr>
          <td><b>${s.name}</b></td>
          <td>${s.address}</td>
          <td><code>${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}</code></td>
          <td><div style="max-height: 80px; overflow-y: auto; max-width: 350px; white-space: pre-wrap; font-size: 12px; color: var(--text-gray);">${s.originalHistory}</div></td>
          <td style="color: #F59E0B; font-weight: bold;">Chờ duyệt</td>
          <td>
            <button class="action-btn approve" onclick="approveSubmission('${s.id}')">Duyệt</button>
            <button class="action-btn reject" onclick="openRejectModal('submission', '${s.id}')">Từ chối</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Load submissions failed:', err);
  }
}

// Load telemetry audit logs
async function loadTelemetryLogs() {
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/telemetry`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const logs = await response.json();
      if (logs.length === 0) {
        telemetryTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray);">Nhật ký hoạt động trống.</td></tr>`;
        return;
      }

      telemetryTableBody.innerHTML = logs.map(l => `
        <tr>
          <td>${new Date(l.timestamp).toLocaleString()}</td>
          <td><b>${l.username}</b></td>
          <td><span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.05);">${l.role}</span></td>
          <td><code>${l.action}</code></td>
          <td>${l.latitude.toFixed(6)}, ${l.longitude.toFixed(6)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Load telemetry failed:', err);
  }
}

async function loadStallVisitSummary() {
  const stallVisitsTableBody = document.getElementById('stall-visits-table-body');
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/visit-summary`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      if (!data || data.length === 0) {
        stallVisitsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray);">Chưa có dữ liệu ghé quán.</td></tr>`;
        return;
      }

      stallVisitsTableBody.innerHTML = data.map(item => `
        <tr>
          <td><b>${item.stallName}</b></td>
          <td>${item.visitCount}</td>
          <td>${item.uniqueVisitors}</td>
          <td>${new Date(item.lastVisit).toLocaleString()}</td>
          <td>${item.actionType}</td>
        </tr>
      `).join('');
    } else {
      stallVisitsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #FF3333;">Không thể tải dữ liệu ghé quán.</td></tr>`;
    }
  } catch (err) {
    console.error('Load stall visits failed:', err);
    stallVisitsTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #FF3333;">Lỗi tải dữ liệu ghé quán.</td></tr>`;
  }
}

// Approve action handlers
window.approveRegistration = async (id) => {
  if (!confirm('Bạn có chắc chắn muốn phê duyệt hồ sơ chủ quán này?')) return;
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/registrations/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify('Đăng ký chủ quán đã được phê duyệt thành công.')
    });

    if (response.ok) {
      alert('Đã phê duyệt chủ quán thành công.');
      refreshDashboardData();
      loadStallsOnMap();
    }
  } catch (err) {
    console.error('Approve registration failed:', err);
  }
};

window.approveSubmission = async (id) => {
  if (!confirm('Phê duyệt bài thuyết minh này và phát hành lên ứng dụng?')) return;
  try {
    const response = await fetch(`${defaultServerUrl}/api/admin/submissions/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify('Thuyết minh được duyệt thành công.')
    });

    if (response.ok) {
      alert('Đã duyệt thuyết minh thành công. Tiến trình Edge-TTS tạo âm thanh đã được kích hoạt chạy ngầm.');
      refreshDashboardData();
      loadStallsOnMap();
    }
  } catch (err) {
    console.error('Approve submission failed:', err);
  }
};

// Open reject modal dialog
window.openRejectModal = (type, id) => {
  modalActionType = type;
  modalTargetId = id;
  modalNoteText.value = '';
  noteModal.style.display = 'flex';
};

// Confirm reject note submission
async function handleModalConfirm() {
  const note = modalNoteText.value.trim();
  if (!note) {
    alert('Vui lòng nhập lý do từ chối.');
    return;
  }

  const id = modalTargetId;
  let url = '';
  
  if (modalActionType === 'registration') {
    url = `${defaultServerUrl}/api/admin/registrations/${id}/reject`;
  } else if (modalActionType === 'submission') {
    url = `${defaultServerUrl}/api/admin/submissions/${id}/reject`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(note)
    });

    if (response.ok) {
      alert('Từ chối thành công.');
      noteModal.style.display = 'none';
      refreshDashboardData();
      loadStallsOnMap();
    } else {
      alert('Từ chối thất bại.');
    }
  } catch (err) {
    console.error('Reject failed:', err);
  }
}
