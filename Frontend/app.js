import { OfflineDatabase } from './db.js';

const db = new OfflineDatabase();
let map;
let markerLayer = [];
let userLocationMarker = null;

let isGpsMockActive = false;
let watchId = null;
let currentCoords = null; // { lat, lon }
let lastTriggeredStallId = null;

const deviceId = getOrCreateDeviceId();

// UI Elements
let serverUrlInput;
let langPicker;
let syncBtn;
let gpsSwitch;
let stallCard;
let stallName;
let stallDistance;
let stallAddress;
let stallDescription;
let chatLog;
let chatInput;
let chatSendBtn;
let syncStatus;
let gpsStatus;
let simWalkBtn;

// HTML5 Audio Elements & States (will be initialized in initApp)
let audioPlayer;
let playAudioBtn;
let playBtnIcon;
let playBtnText;
let audioStatus;
let viewMenuBtn;
let menuModal;
let menuImagesContainer;
let menuModalMessage;
let menuModalClose;
let currentAudioUrl = '';

// Walk simulation variables (Vĩnh Khánh street route District 4)
const simulatedRoute = [
  { lat: 10.761400, lng: 106.699700 }, // Start near West end
  { lat: 10.761245, lng: 106.700124 }, // Bánh Mì Kẹp Thịt nướng Cô Lệ (Trigger)
  { lat: 10.760900, lng: 106.701000 },
  { lat: 10.760600, lng: 106.701800 },
  { lat: 10.760300, lng: 106.702500 },
  { lat: 10.760124, lng: 106.702958 }, // Ốc Oanh (Trigger)
  { lat: 10.759700, lng: 106.703800 },
  { lat: 10.759200, lng: 106.704500 },
  { lat: 10.758364, lng: 106.705291 }, // Phá Lấu Bò Cô Thảo (Trigger)
  { lat: 10.758000, lng: 106.705600 }  // End
];
let simIntervalId = null;
let simRouteIndex = 0;

// Default API Server URL fallback (pointing to port 5080 on the same host)
let defaultServerUrl;

// Set default server URL in initApp() after DOM ready

// Translation dictionary for Frontend UI elements
const uiTranslations = {
  vi: {
    subtitle: "OFFLINE AUDIO GUIDE & AI TOUR GUIDE",
    gpsLabel: "GPS Mocking / Real",
    syncBtn: "Đồng Bộ",
    chatHeader: "TRỢ LÝ TOUR HƯỚNG DẪN VIÊN AI",
    chatWelcome: "Xin chào! Tôi là Trợ Lý AI của phố ẩm thực Quận 4. Hãy đặt bất kỳ câu hỏi nào về các quán ăn, gợi ý món ăn, hoặc nhờ tôi lên lịch trình food tour Quận 4 cho bạn nhé!",
    chatPlaceholder: "Hỏi AI (Ví dụ: gợi ý quán ốc ngon...)",
    chatSendBtn: "Gửi",
    addressPlaceholder: "Địa chỉ",
    descPlaceholder: "Đang tải thuyết minh...",
    playBtn: "Bắt đầu nghe thuyết minh",
    pauseBtn: "Tạm dừng",
    audioStatusReady: "Sẵn sàng",
    audioStatusLoading: "Đang tải âm thanh...",
    audioStatusPlaying: "Đang phát...",
    audioStatusPaused: "Đã tạm dừng",
    audioStatusEnded: "Đã phát xong",
    audioStatusNoAudio: "Không có âm thanh thuyết minh.",
    audioStatusNoFile: "Không có file âm thanh",
    viewMenuBtn: "Mở xem menu chi tiết",
    syncStatusReady: "Hệ thống sẵn sàng. Vui lòng Đồng bộ để cập nhật dữ liệu.",
    syncStatusRunning: "Đang đồng bộ dữ liệu từ server...",
    syncStatusSuccess: (count) => `Đồng bộ thành công! Đã tải xuống ${count} quán ăn.`,
    syncStatusFailed: "Đồng bộ thất bại. Vui lòng kiểm tra kết nối mạng hoặc URL server.",
    gpsStatusOff: "GPS: Tắt",
    gpsStatusTracking: "GPS: Đang theo dõi...",
    gpsStatusMock: (lat, lng) => `GPS: Giả lập (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsStatusReal: (lat, lng) => `GPS: Định vị (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsNoSupport: "Thiết bị không hỗ trợ định vị GPS.",
    gpsError: "Lỗi định vị GPS. Đang sử dụng chế độ Mocking click bản đồ.",
    simWalkStart: "🚶 Mô phỏng đi bộ",
    simWalkStop: "⏹ Dừng mô phỏng",
    portalBtn: "🔑 Cổng Admin"
  },
  en: {
    subtitle: "OFFLINE AUDIO GUIDE & AI TOUR GUIDE",
    gpsLabel: "GPS Mocking / Real",
    syncBtn: "Sync",
    chatHeader: "AI TOUR ASSISTANT",
    chatWelcome: "Hello! I am the AI Assistant for District 4 Street Food. Ask me anything about stalls, food recommendations, or let me plan a food tour for you!",
    chatPlaceholder: "Ask AI (e.g., recommend delicious snails...)",
    chatSendBtn: "Send",
    addressPlaceholder: "Address",
    descPlaceholder: "Loading narration...",
    playBtn: "Start narration",
    pauseBtn: "Pause",
    audioStatusReady: "Ready",
    audioStatusLoading: "Loading audio...",
    audioStatusPlaying: "Playing...",
    audioStatusPaused: "Paused",
    audioStatusEnded: "Finished",
    audioStatusNoAudio: "No narration audio.",
    audioStatusNoFile: "No audio file",
    viewMenuBtn: "Open detailed menu",
    syncStatusReady: "System ready. Please click Sync to download data.",
    syncStatusRunning: "Synchronizing data from server...",
    syncStatusSuccess: (count) => `Sync success! Downloaded ${count} food stalls.`,
    syncStatusFailed: "Sync failed. Please check network connection or server URL.",
    gpsStatusOff: "GPS: Off",
    gpsStatusTracking: "GPS: Tracking...",
    gpsStatusMock: (lat, lng) => `GPS: Mocked (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsStatusReal: (lat, lng) => `GPS: Located (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsNoSupport: "Device does not support GPS geolocation.",
    gpsError: "GPS error. Using map click mocking mode.",
    simWalkStart: "🚶 Simulate Walk",
    simWalkStop: "⏹ Stop Sim",
    portalBtn: "🔑 Portal"
  },
  ja: {
    subtitle: "オフライン音声ガイド＆AIツアーガイド",
    gpsLabel: "GPSモック / リアル",
    syncBtn: "同期する",
    chatHeader: "AIツアーアシスタント",
    chatWelcome: "こんにちは！第4区ストリートフード of AIアシスタントです。おすすめのお店やメニュー, フードツアーの計画など、何でも聞いてください！",
    chatPlaceholder: "AIに尋ねる (例：美味しい貝のお店を教えて...)",
    chatSendBtn: "送信",
    addressPlaceholder: "住所",
    descPlaceholder: "解説を読み込み中...",
    playBtn: "ナレーションを開始",
    pauseBtn: "一時停止",
    audioStatusReady: "準備完了",
    audioStatusLoading: "音声を読み込み中...",
    audioStatusPlaying: "再生中...",
    audioStatusPaused: "一時停止中",
    audioStatusEnded: "再生終了",
    audioStatusNoAudio: "音声解説はありません。",
    audioStatusNoFile: "音声ファイルがありません",
    viewMenuBtn: "詳細メニューを開く",
    syncStatusReady: "システム準備完了。同期ボタンを押してデータを更新してください。",
    syncStatusRunning: "サーバーからデータを同期中...",
    syncStatusSuccess: (count) => `同期完了！${count}件の店舗情報をダウンロードしました。`,
    syncStatusFailed: "同期失敗。接続またはサーバーURLを確認してください。",
    gpsStatusOff: "GPS: オフ",
    gpsStatusTracking: "GPS: 追跡中...",
    gpsStatusMock: (lat, lng) => `GPS: シミュレーション (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsStatusReal: (lat, lng) => `GPS: 位置特定 (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsNoSupport: "デバイスはGPS位置情報をサポートしていません。",
    gpsError: "GPSエラー。マップクリック模擬モードを使用中。",
    simWalkStart: "🚶 歩行シミュレート",
    simWalkStop: "⏹ シミュレート停止",
    portalBtn: "🔑 ポータル"
  },
  ko: {
    subtitle: "오프라인 오디오 가이드 & AI 투어 가이드",
    gpsLabel: "GPS 시뮬레이션 / 실제",
    syncBtn: "동기화",
    chatHeader: "AI 투어 가이드 어시스턴트",
    chatWelcome: "안녕하세요! 4구 길거리 음식 AI 어시스턴트입니다. 맛집 추천, 메뉴 문의, 푸드 투어 일정 계획 등 무엇이든 물어보세요!",
    chatPlaceholder: "AI에게 질문하기 (예: 맛있는 조개구이 집 추천해줘...)",
    chatSendBtn: "전송",
    addressPlaceholder: "주소",
    descPlaceholder: "오디오 가이드 로딩 중...",
    playBtn: "해설 듣기 시작",
    pauseBtn: "일시정지",
    audioStatusReady: "준비 완료",
    audioStatusLoading: "오디오 로딩 중...",
    audioStatusPlaying: "재생 중...",
    audioStatusPaused: "일시 정지됨",
    audioStatusEnded: "재생 완료",
    audioStatusNoAudio: "가이드 오디오가 없습니다.",
    audioStatusNoFile: "오디오 파일이 없음",
    viewMenuBtn: "상세 메뉴 열기",
    syncStatusReady: "시스템이 준비되었습니다. 데이터를 업데이트하려면 동기화하십시오.",
    syncStatusRunning: "서버에서 데이터를 동기화하는 중...",
    syncStatusSuccess: (count) => `동기화 완료! ${count}개 맛집을 다운로드했습니다.`,
    syncStatusFailed: "동기화 실패. 네트워크 또는 서버 URL을 확인하십시오.",
    gpsStatusOff: "GPS: 꺼짐",
    gpsStatusTracking: "GPS: 추적 중...",
    gpsStatusMock: (lat, lng) => `GPS: 시뮬레이션 (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsStatusReal: (lat, lng) => `GPS: 위치정보 (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    gpsNoSupport: "장치가 GPS 위치정보를 지원하지 않습니다.",
    gpsError: "GPS 오류. 지도 클릭 시뮬레이션 모드를 사용 중입니다.",
    simWalkStart: "🚶 보행 시뮬레이션",
    simWalkStop: "⏹ 시뮬레이션 중지",
    portalBtn: "🔑 포털"
  }
};

// Update UI elements texts based on selected language
function updateUiLanguage(lang) {
  const trans = uiTranslations[lang] || uiTranslations.vi;
  const portalBtn = document.getElementById('portal-btn');
  if (portalBtn) portalBtn.innerText = trans.portalBtn || "🔑 Portal";
  // Update static texts
  const subtitleEl = document.querySelector('.title-section span');
  if (subtitleEl) subtitleEl.innerText = trans.subtitle;

  const gpsSwitchLabelEl = document.getElementById('gps-switch-label');
  if (gpsSwitchLabelEl) gpsSwitchLabelEl.innerText = trans.gpsLabel;

  if (syncBtn) syncBtn.innerText = trans.syncBtn;
  if (viewMenuBtn) viewMenuBtn.innerText = trans.viewMenuBtn || "Xem menu";

  const chatHeaderEl = document.querySelector('.chat-header h3');
  if (chatHeaderEl) chatHeaderEl.innerText = trans.chatHeader;

  if (chatSendBtn) chatSendBtn.innerText = trans.chatSendBtn;
  if (chatInput) chatInput.placeholder = trans.chatPlaceholder;
  // Update welcome bubble in chat log if present
  if (chatLog) {
    const welcomeBubble = chatLog.querySelector('.bubble.ai:first-child');
    if (welcomeBubble) {
      welcomeBubble.innerText = trans.chatWelcome;
    }
  }

  // Update default card details if no stall is active
  if (stallCard && !stallCard.classList.contains('visible')) {
    if (stallName) stallName.innerText = lang === 'vi' ? 'Tên Quán' : (lang === 'en' ? 'Stall Name' : (lang === 'ja' ? '店舗名' : '가게 이름'));
    if (stallAddress) stallAddress.innerText = trans.addressPlaceholder;
    if (stallDescription) stallDescription.innerText = trans.descPlaceholder;
  }

  // Update walk simulation button text dynamically
  if (simWalkBtn) {
    simWalkBtn.innerText = simIntervalId ? trans.simWalkStop : trans.simWalkStart;
  }
  // Update audio control elements
  updatePlayButtonState(false);
  // Update statuses safely
  if (syncStatus) {
    const currentSyncText = syncStatus.innerText || '';
    if (currentSyncText.includes('Hệ thống sẵn sàng') || currentSyncText.includes('System ready') || currentSyncText.includes('システム準備') || currentSyncText.includes('시스템이 준비')) {
      syncStatus.innerText = trans.syncStatusReady;
    } else if (currentSyncText.includes('Đang đồng bộ') || currentSyncText.includes('Synchronizing') || currentSyncText.includes('同期중') || currentSyncText.includes('동기화하는')) {
      syncStatus.innerText = trans.syncStatusRunning;
    } else if (currentSyncText.includes('Đồng bộ thất bại') || currentSyncText.includes('Sync failed') || currentSyncText.includes('同期失敗') || currentSyncText.includes('동기화 실패')) {
      syncStatus.innerText = trans.syncStatusFailed;
    }
  }

  if (gpsStatus) {
    const currentGpsText = gpsStatus.innerText || '';
    if (currentGpsText.includes('Tắt') || currentGpsText.includes('Off') || currentGpsText.includes('オフ') || currentGpsText.includes('꺼짐')) {
      gpsStatus.innerText = trans.gpsStatusOff;
    } else if (currentGpsText.includes('Đang theo dõi') || currentGpsText.includes('Tracking') || currentGpsText.includes('追跡中') || currentGpsText.includes('추적 중')) {
      gpsStatus.innerText = trans.gpsStatusTracking;
    }
  }
}

// Global error handler to help debug mobile devices
window.onerror = function (message, source, lineno, colno, error) {
  const status = document.getElementById('sync-status');
  if (status) {
    status.style.color = '#FF3333';
    status.innerText = `Lỗi JS: ${message} (dòng ${lineno})`;
  }
  console.error('Global Error:', message, 'at', source, ':', lineno);
  return false;
};

// Initialize app immediately since type="module" runs after DOM is ready
async function initApp() {
  // Initialize ALL DOM elements first (must do this before any DOM operations)
  serverUrlInput = document.getElementById('server-url');
  langPicker = document.getElementById('lang-picker');
  syncBtn = document.getElementById('sync-btn');
  gpsSwitch = document.getElementById('gps-switch');
  stallCard = document.getElementById('stall-card');
  stallName = document.getElementById('stall-name');
  stallDistance = document.getElementById('stall-distance');
  stallAddress = document.getElementById('stall-address');
  stallDescription = document.getElementById('stall-description');
  chatLog = document.getElementById('chat-log');
  chatInput = document.getElementById('chat-input');
  chatSendBtn = document.getElementById('chat-send-btn');
  syncStatus = document.getElementById('sync-status');
  gpsStatus = document.getElementById('gps-status');
  simWalkBtn = document.getElementById('sim-walk-btn');

  audioPlayer = document.getElementById('audio-player');
  playAudioBtn = document.getElementById('play-audio-btn');
  playBtnIcon = document.getElementById('play-btn-icon');
  playBtnText = document.getElementById('play-btn-text');
  audioStatus = document.getElementById('audio-status');
  viewMenuBtn = document.getElementById('view-menu-btn');
  menuModal = document.getElementById('menu-modal');
  menuImagesContainer = document.getElementById('menu-images-container');
  menuModalMessage = document.getElementById('menu-modal-message');
  menuModalClose = document.getElementById('menu-modal-close');

  // Set default server URL after DOM ready
  defaultServerUrl = window.location.port === '5080'
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:5080`;
  serverUrlInput.value = defaultServerUrl;

  console.debug('All DOM elements initialized', {
    viewMenuBtn: !!viewMenuBtn,
    menuModal: !!menuModal,
    serverUrlInput: !!serverUrlInput,
    langPicker: !!langPicker
  });
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker registered successfully.');
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }

  try {
    // Initialize DB
    await db.init();

    // Initialize Map
    initMap();

    // Load stalls from local DB
    await loadStallPins();

    // Wire events
    syncBtn.addEventListener('click', onSync);
    gpsSwitch.addEventListener('change', onGpsToggle);
    chatSendBtn.addEventListener('click', onSendChat);
    chatInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') onSendChat();
    });

    simWalkBtn.addEventListener('click', toggleSimulationWalk);

    // Wire language change event
    langPicker.addEventListener('change', () => {
      updateUiLanguage(langPicker.value);
    });

    // Initialize UI language on load
    updateUiLanguage(langPicker.value);

    // Wire audio control events
    // Start Heartbeat loop every 30s
    sendHeartbeat();
    setInterval(sendHeartbeat, 30000);

    console.debug('menu button init', { viewMenuBtn, menuModal, menuModalMessage, menuImagesContainer });

    if (viewMenuBtn) {
      viewMenuBtn.addEventListener('click', async () => {
        console.debug('view-menu-btn clicked', { activeStallId: getActiveStallId() });
        const activeStallId = getActiveStallId();
        if (!activeStallId) {
          showMenuModalMessage('Vui lòng đứng gần một quán để xem menu.');
          return;
        }

        void recordUserAction(activeStallId, 'VIEW_MENU');
        await openMenuModal(activeStallId);
      });
    }

    if (menuModalClose) {
      menuModalClose.addEventListener('click', () => {
        if (menuModal) menuModal.style.display = 'none';
      });
    }

    if (menuModal) {
      menuModal.addEventListener('click', (event) => {
        if (event.target === menuModal) {
          menuModal.style.display = 'none';
        }
      });
    }

    playAudioBtn.addEventListener('click', onToggleAudio);
    audioPlayer.addEventListener('ended', () => {
      const trans = uiTranslations[langPicker.value] || uiTranslations.vi;
      updatePlayButtonState(false);
      audioStatus.innerText = trans.audioStatusEnded;
    });
  } catch (err) {
    console.error('App init failed:', err);
    const status = document.getElementById('sync-status');
    if (status) {
      status.style.color = '#FF3333';
      status.innerText = `Lỗi Khởi Chạy: ${err.message || err}`;
    }
  }
}

// Ensure DOM is fully loaded before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM already loaded, init immediately
  initApp();
}
async function sendHeartbeat() {
  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
  if (!serverUrl) return;

  let lat = null, lon = null;
  if (currentCoords) {
    lat = currentCoords.lat;
    lon = currentCoords.lon;
  }

  try {
    await fetch(`${serverUrl}/api/admin/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deviceUniqueId: deviceId,
        latitude: lat,
        longitude: lon,
        action: 'HEARTBEAT'
      })
    });
  } catch (err) {
    console.warn('Heartbeat failed', err);
  }
}


// Device Unique ID for analytics
function getOrCreateDeviceId() {
  let id = localStorage.getItem('DeviceUniqueId');
  if (!id) {
    id = 'pwa_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('DeviceUniqueId', id);
  }
  return id;
}

// Leaflet Map Initialization
function initMap() {
  // Center on Vinh Khanh street District 4
  const vinhKhanhCenter = [10.760124, 106.702958];

  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView(vinhKhanhCenter, 16);

  // Add OSM tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  // Setup click handler on map for GPS Mocking/Simulation
  map.on('click', e => {
    onMapClicked(e.latlng.lat, e.latlng.lng);
  });
}

// Draw stalls on map
async function loadStallPins() {
  // Clear old markers
  markerLayer.forEach(marker => map.removeLayer(marker));
  markerLayer = [];

  const stalls = await db.getStalls();
  stalls.forEach(stall => {
    // Create beautiful orange marker using Leaflet divIcon and CSS pin-marker
    const orangeIcon = L.divIcon({
      html: `<div class="pin-marker"></div>`,
      className: 'custom-pin-icon',
      iconSize: [26, 26],
      iconAnchor: [13, 26]
    });

    const marker = L.marker([stall.latitude, stall.longitude], { icon: orangeIcon })
      .bindPopup(`<b>${stall.name}</b><br>${stall.address}`)
      .addTo(map);

    markerLayer.push(marker);
  });

  // Automatically zoom and center map to show all orange pins if they exist
  if (markerLayer.length > 0) {
    const group = L.featureGroup(markerLayer);
    map.fitBounds(group.getBounds().pad(0.1));
  }
}

// Map clicked for GPS simulation
function onMapClicked(lat, lng) {
  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  // Always allow simulation/mocking on map click (extremely useful for development)
  currentCoords = { lat, lon: lng };
  updateUserLocationMarker(lat, lng);
  gpsStatus.innerText = trans.gpsStatusMock(lat, lng);

  // Trigger proximity check
  checkStallsProximity(lat, lng);
}

// Update User Location marker on map
function updateUserLocationMarker(lat, lng) {
  if (userLocationMarker) {
    userLocationMarker.setLatLng([lat, lng]);
  } else {
    const bluePulseIcon = L.divIcon({
      html: `<div class="user-pulse-marker"></div>`,
      className: 'custom-pin-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    userLocationMarker = L.marker([lat, lng], { icon: bluePulseIcon }).addTo(map);
  }
  map.panTo([lat, lng]);
}

// Handle GPS Toggle switch
function onGpsToggle(e) {
  isGpsMockActive = e.target.checked;
  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  if (isGpsMockActive) {
    gpsStatus.innerText = trans.gpsStatusTracking;

    // Check if secure context for geolocation
    const isSecureContext = window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isSecureContext && window.location.protocol === 'http:') {
      const httpsWarning = {
        vi: "Định vị GPS thực tế yêu cầu kết nối bảo mật HTTPS khi chạy trên điện thoại di động.\\n\\nHãy dùng tính năng 'Mô phỏng đi bộ' hoặc truy cập qua HTTPS (ví dụ ngrok/localtunnel) để test GPS thực tế.",
        en: "Real GPS geolocation requires a secure HTTPS connection on mobile devices.\\n\\nPlease use the 'Simulate Walk' feature, or configure HTTPS (e.g. ngrok/localtunnel) to test real GPS.",
        ja: "モバイルデバイスで実際のGPSを使用するには、セキュアなHTTPS接続が必要です。\\n\\n「歩行シミュレート」機能を使用するか、HTTPS（例：ngrok/localtunnel）経由でアクセスしてください。",
        ko: "모바일 기기에서 실제 GPS를 사용하려면 안전한 HTTPS 연결이 필요합니다.\\n\\n'보행 시뮬레이션' 기능을 사용하거나 HTTPS(예: ngrok/localtunnel)를 구성해 주세요."
      };
      alert(httpsWarning[langCode] || httpsWarning.vi);
      gpsSwitch.checked = false;
      isGpsMockActive = false;
      gpsStatus.innerText = trans.gpsStatusOff;
      return;
    }

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        position => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          currentCoords = { lat, lon: lng };
          updateUserLocationMarker(lat, lng);
          gpsStatus.innerText = trans.gpsStatusReal(lat, lng);
          checkStallsProximity(lat, lng);
        },
        err => {
          console.error('GPS tracking failed:', err);
          syncStatus.innerText = trans.gpsError;

          // Reset toggle switch state
          gpsSwitch.checked = false;
          isGpsMockActive = false;
          gpsStatus.innerText = trans.gpsStatusOff;
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
          if (userLocationMarker) {
            map.removeLayer(userLocationMarker);
            userLocationMarker = null;
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      syncStatus.innerText = trans.gpsNoSupport;
      gpsSwitch.checked = false;
      isGpsMockActive = false;
      gpsStatus.innerText = trans.gpsStatusOff;
    }
  } else {
    gpsStatus.innerText = trans.gpsStatusOff;
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    stallCard.classList.remove('visible');
    lastTriggeredStallId = null;
    audioPlayer.pause();
  }
}

// Sync stalls and prefetch audio files
// Replace existing onSync() with this improved diagnostic version
async function onSync() {
  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  if (!serverUrl) {
    alert(langCode === 'vi' ? 'Không tìm thấy URL Server.' : 'Server URL not found.');
    return;
  }

  const requestUrl = `${serverUrl}/api/foodstalls/sync?lang=${langCode}`;
  console.log('Sync request URL:', requestUrl);
  syncStatus.style.color = '#FF7A00';
  syncStatus.innerText = trans.syncStatusRunning;

  try {
    const response = await fetch(requestUrl);

    if (!response.ok) {
      const serverText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText} ${serverText ? '- ' + serverText : ''}`);
    }

    const responseData = await response.json();
    const stalls = (responseData.stalls || []).map(item => ({
      id: item.id,
      name: item.name,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      originalHistory: item.originalHistory,
      translatedText: item.translation?.translatedText || item.originalHistory,
      audioUrl: item.translation?.audioUrl || ''
    }));

    await db.clearAll();
    await db.saveStalls(stalls);
    await loadStallPins();

    syncStatus.style.color = '#00FF66';
    syncStatus.innerText = trans.syncStatusSuccess(stalls.length);


    prefetchAudioFiles(stalls, serverUrl);

  } catch (err) {
    console.error('Sync failed:', err);
    syncStatus.style.color = '#FF3333';
    syncStatus.innerText = `${trans.syncStatusFailed} (${err.message || err})`;
  }
}
// Fetch all audio files to populate service worker cache for offline use
function prefetchAudioFiles(stalls, serverUrl) {
  stalls.forEach(async stall => {
    if (stall.audioUrl) {
      // Re-route audioUrl relative to serverUrl if needed
      const fullAudioUrl = stall.audioUrl.startsWith('http')
        ? stall.audioUrl
        : `${serverUrl}${stall.audioUrl}`;
      try {
        const audioRes = await fetch(fullAudioUrl);
        if (audioRes.ok) {
          console.log(`Audio cached successfully for: ${stall.name}`);
        }
      } catch (err) {
        console.warn('Failed to pre-cache audio file for stall:', stall.name, err);
      }
    }
  });
}

// Calculate distances & check geofencing proximity
async function checkStallsProximity(userLat, userLon) {
  const stalls = await db.getStalls();
  const thresholdMeters = 20.0;

  let nearestStall = null;
  let minDistance = Infinity;

  stalls.forEach(stall => {
    const dist = calculateHaversineDistance(userLat, userLon, stall.latitude, stall.longitude);
    if (dist <= thresholdMeters && dist < minDistance) {
      minDistance = dist;
      nearestStall = stall;
    }
  });

  if (nearestStall) {
    // Show stall card details
    stallCard.dataset.stallId = nearestStall.id;
    stallName.innerText = nearestStall.name;
    stallAddress.innerText = nearestStall.address;
    stallDistance.innerText = `${Math.round(minDistance)}m`;
    stallDescription.innerText = nearestStall.translatedText || nearestStall.originalHistory;
    stallCard.classList.add('visible');

    // Trigger audio narration if it's a new shop
    if (nearestStall.id !== lastTriggeredStallId) {
      lastTriggeredStallId = nearestStall.id;
      playNarrationAudio(nearestStall.audioUrl);
    }
  } else {
    // Hide card if not near any stall
    const langCode = langPicker.value;
    const trans = uiTranslations[langCode] || uiTranslations.vi;
    stallCard.classList.remove('visible');
    delete stallCard.dataset.stallId;
    lastTriggeredStallId = null;
    audioPlayer.pause();
    audioPlayer.removeAttribute('src');
    currentAudioUrl = '';
    updatePlayButtonState(false);
    audioStatus.innerText = trans.audioStatusReady;
  }
}

// Toggle audio play/pause manually (user click)
function onToggleAudio() {
  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  if (!audioPlayer.src && currentAudioUrl) {
    audioPlayer.src = currentAudioUrl;
  }

  if (!audioPlayer.src) {
    audioStatus.innerText = trans.audioStatusNoAudio;
    return;
  }

  if (audioPlayer.paused) {
    const activeStallId = getActiveStallId();
    if (activeStallId) {
      void recordUserAction(activeStallId, 'START_AUDIO');
    }
    audioPlayer.play()
      .then(() => {
        updatePlayButtonState(true);
        audioStatus.innerText = trans.audioStatusPlaying;
      })
      .catch(err => {
        console.error('Audio playback failed:', err);
        audioStatus.innerText = langCode === 'vi' ? 'Lỗi phát âm thanh.' : 'Audio playback error.';
      });
  } else {
    audioPlayer.pause();
    updatePlayButtonState(false);
    audioStatus.innerText = trans.audioStatusPaused;
  }
}

function updatePlayButtonState(isPlaying) {
  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  if (isPlaying) {
    playBtnIcon.innerText = '⏸';
    playBtnText.innerText = trans.pauseBtn;
  } else {
    playBtnIcon.innerText = '▶';
    playBtnText.innerText = trans.playBtn;
  }
}

function showMenuModalMessage(message) {
  if (!menuModal || !menuModalMessage || !menuImagesContainer) return;
  menuImagesContainer.innerHTML = '';
  menuModalMessage.innerText = message;
  menuModal.style.display = 'flex';
}

function renderMenuImages(images) {
  if (!menuImagesContainer || !menuModalMessage) return;
  menuImagesContainer.innerHTML = '';
  const indicators = document.getElementById('menu-carousel-indicators');
  if (indicators) indicators.innerHTML = '';
  if (!Array.isArray(images) || images.length === 0) {
    menuModalMessage.innerText = 'Quán này chưa cập nhật menu.';
    return;
  }

  menuModalMessage.innerText = '';
  // Build slides
  images.forEach((url, idx) => {
    const item = document.createElement('div');
    item.className = 'menu-image-item';

    const image = document.createElement('img');
    image.src = url;
    image.alt = `Menu image ${idx + 1}`;
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.style.opacity = '0.5'; });

    item.appendChild(image);
    menuImagesContainer.appendChild(item);

    // indicator
    if (indicators) {
      const btn = document.createElement('button');
      btn.dataset.index = String(idx);
      btn.addEventListener('click', () => showSlide(idx));
      indicators.appendChild(btn);
    }
  });

  // Initialize carousel state
  currentCarouselIndex = 0;
  updateCarousel();
}

async function openMenuModal(activeStallId) {
  if (!activeStallId) {
    showMenuModalMessage('Không tìm thấy quán hiện tại.');
    return;
  }

  const serverUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
  const url = `${serverUrl}/api/foodstalls/${activeStallId}/menu`;

  console.debug('openMenuModal fetch url', url);

  showMenuModalMessage('Đang tải menu...');

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      showMenuModalMessage('Không thể tải menu. Vui lòng thử lại.');
      console.error('Menu load failed:', errorText);
      return;
    }

    const imageUrls = await response.json();
    renderMenuImages(imageUrls);
    // show modal
    if (menuModal) menuModal.style.display = 'flex';
    // attach nav handlers
    attachCarouselHandlers();
  } catch (error) {
    showMenuModalMessage('Lỗi kết nối. Vui lòng kiểm tra mạng.');
    console.error(error);
  }
}

function getActiveStallId() {
  return stallCard?.dataset?.stallId || lastTriggeredStallId || '';
}

// Carousel state & helpers
let currentCarouselIndex = 0;
function updateCarousel() {
  const slides = document.querySelectorAll('.menu-slides .menu-image-item');
  const indicators = document.querySelectorAll('.carousel-indicators button');
  const slidesContainer = document.querySelector('.menu-slides');
  if (!slidesContainer || slides.length === 0) return;
  const w = slidesContainer.clientWidth;
  slidesContainer.style.transform = `translateX(-${currentCarouselIndex * w}px)`;
  indicators.forEach((b, i) => b.classList.toggle('active', i === currentCarouselIndex));
}

function showSlide(index) {
  const slides = document.querySelectorAll('.menu-slides .menu-image-item');
  if (!slides || slides.length === 0) return;
  currentCarouselIndex = Math.max(0, Math.min(index, slides.length - 1));
  updateCarousel();
}

function attachCarouselHandlers() {
  const prev = document.getElementById('menu-prev');
  const next = document.getElementById('menu-next');
  const indicators = document.getElementById('menu-carousel-indicators');
  if (prev) prev.onclick = () => showSlide(currentCarouselIndex - 1);
  if (next) next.onclick = () => showSlide(currentCarouselIndex + 1);

  // swipe support
  const viewport = document.querySelector('.menu-viewport');
  if (viewport) {
    let startX = 0;
    viewport.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    viewport.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      if (endX - startX > 40) showSlide(currentCarouselIndex - 1);
      else if (startX - endX > 40) showSlide(currentCarouselIndex + 1);
    }, { passive: true });
  }

  // keyboard navigation when modal open
  window.addEventListener('keydown', carouselKeyHandler);
}

function carouselKeyHandler(e) {
  if (!menuModal || menuModal.style.display !== 'flex') return;
  if (e.key === 'ArrowLeft') showSlide(currentCarouselIndex - 1);
  if (e.key === 'ArrowRight') showSlide(currentCarouselIndex + 1);
  if (e.key === 'Escape') { if (menuModal) menuModal.style.display = 'none'; }
}

async function recordUserAction(foodStallId, actionType) {
  if (!foodStallId || !actionType) return null;

  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
  if (!serverUrl) return null;

  const token = localStorage.getItem('authToken');
  if (!token) return null;

  const coords = await new Promise(resolve => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve(currentCoords ? { lat: currentCoords.lat, lng: currentCoords.lon } : null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
      return;
    }

    resolve(currentCoords ? { lat: currentCoords.lat, lng: currentCoords.lon } : null);
  });

  if (!coords) return null;

  try {
    const response = await fetch(`${serverUrl}/api/visits/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        foodStallId,
        actionType,
        userLat: coords.lat,
        userLng: coords.lng
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('Visit record rejected:', errorText || response.statusText);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.warn('Visit record failed:', err);
    return null;
  }
}
// Play narration audio file (automatic proximity trigger)
function playNarrationAudio(audioUrl) {
  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  if (!audioUrl) {
    currentAudioUrl = '';
    audioPlayer.removeAttribute('src');
    updatePlayButtonState(false);
    audioStatus.innerText = trans.audioStatusNoFile;
    return;
  }

  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
  const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `${serverUrl}${audioUrl}`;

  currentAudioUrl = fullAudioUrl;
  audioPlayer.src = fullAudioUrl;
  audioStatus.innerText = trans.audioStatusLoading;

  // Try to autoplay (might be blocked by mobile browser autoplay policies)
  audioPlayer.play()
    .then(() => {
      updatePlayButtonState(true);
      audioStatus.innerText = trans.audioStatusPlaying;
    })
    .catch(err => {
      console.warn('Autoplay blocked. User interaction required.', err);
      updatePlayButtonState(false);
      audioStatus.innerText = langCode === 'vi' ? 'Bấm Phát Thuyết Minh để nghe' : 'Tap Play Narration to listen';
    });
}

// Haversine formula
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000.0; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180.0;
}

// AI Chatbot Logic (Online Mode)
async function onSendChat() {
  const question = chatInput.value.trim();
  if (!question) return;

  chatInput.value = '';

  // Append user bubble
  addChatBubble(question, 'user');

  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
  const langCode = langPicker.value;

  if (!serverUrl) {
    addChatBubble(langCode === 'vi' ? 'Lỗi: Không tìm thấy URL Server.' : 'Error: Server URL not found.', 'ai');
    return;
  }

  // Append loader bubble
  const loader = addChatBubble(langCode === 'vi' ? 'Đang suy nghĩ...' : 'Thinking...', 'ai loader');

  // Add coordinate context if available
  let lat = null, lon = null;
  if (currentCoords) {
    lat = currentCoords.lat;
    lon = currentCoords.lon;
  }

  try {
    const response = await fetch(`${serverUrl}/api/chat/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deviceUniqueId: deviceId,
        question: question,
        latitude: lat,
        longitude: lon
      })
    });

    // Remove loader
    loader.remove();

    if (response.ok) {
      const data = await response.json();
      addChatBubble(data.answer || (langCode === 'vi' ? 'Không nhận được câu trả lời từ AI.' : 'No response from AI.'), 'ai');
    } else {
      addChatBubble((langCode === 'vi' ? `Lỗi kết nối server: ${response.status}` : `Server connection error: ${response.status}`), 'ai');
    }

  } catch (err) {
    loader.remove();
    console.error('Chat AI failed:', err);
    addChatBubble(langCode === 'vi' ? 'Không thể kết nối đến máy chủ AI. Vui lòng kiểm tra lại mạng.' : 'Unable to connect to AI server. Please check your network.', 'ai');
  }
}

function addChatBubble(text, className) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${className}`;
  bubble.innerText = text;
  chatLog.appendChild(bubble);

  // Auto scroll
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

// Toggle walking simulation along Vĩnh Khánh street
function toggleSimulationWalk() {
  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  if (simIntervalId) {
    // Stop simulation
    clearInterval(simIntervalId);
    simIntervalId = null;
    simWalkBtn.innerText = trans.simWalkStart;
    simWalkBtn.style.background = '#10B981';

    // Clean up user marker
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    stallCard.classList.remove('visible');
    lastTriggeredStallId = null;
    audioPlayer.pause();
    audioPlayer.removeAttribute('src');
    currentAudioUrl = '';
    updatePlayButtonState(false);
    audioStatus.innerText = trans.audioStatusReady;
  } else {
    // Start simulation
    // Turn off real GPS switch if active
    if (gpsSwitch.checked) {
      gpsSwitch.checked = false;
      onGpsToggle({ target: gpsSwitch });
    }

    simRouteIndex = 0;
    simWalkBtn.innerText = trans.simWalkStop;
    simWalkBtn.style.background = '#EF4444'; // Red color when active

    runSimStep(); // Run first step immediately

    simIntervalId = setInterval(() => {
      simRouteIndex++;
      if (simRouteIndex >= simulatedRoute.length) {
        simRouteIndex = 0; // Loop back to start
      }
      runSimStep();
    }, 5000); // 5 seconds per step
  }
}

function runSimStep() {
  const point = simulatedRoute[simRouteIndex];
  const lat = point.lat;
  const lng = point.lng;
  currentCoords = { lat, lon: lng };
  updateUserLocationMarker(lat, lng);

  const langCode = langPicker.value;
  const trans = uiTranslations[langCode] || uiTranslations.vi;

  gpsStatus.innerText = `${trans.gpsStatusMock(lat, lng)} (Step ${simRouteIndex + 1}/${simulatedRoute.length})`;
  // Trigger proximity check
  checkStallsProximity(lat, lng);
}