/**
 * Fluido — app.js
 * Production-grade ES6+ modular application logic.
 * Firebase Auth · Firestore · Google Sheets/Drive REST API · Chart.js
 */

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 0: FIREBASE CONFIGURATION — REPLACE WITH YOUR PROJECT DETAILS ═╗
═══════════════════════════════════════════════════════════════════════════ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import {
  getAuth, signInWithPopup, signOut,
  GoogleAuthProvider, browserLocalPersistence,
  setPersistence, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc,
  updateDoc, collection, query, orderBy,
  onSnapshot, deleteDoc, writeBatch,
  serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAOpcato3QlcdGFr279fkp3E8dkOxhjxXg",
  authDomain: "fluido-61626.firebaseapp.com",
  projectId: "fluido-61626",
  storageBucket: "fluido-61626.firebasestorage.app",
  messagingSenderId: "76011614652",
  appId: "1:76011614652:web:d377bf482c19c5dd913bb9",
};

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 1: FIREBASE INITIALIZATION ═══════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 2: GOOGLE OAUTH SCOPES ═══════════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 3: APPLICATION STATE ═════════════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
const State = {
  user: null,   // Firebase Auth user
  userProfile: null,   // Firestore /users/{uid} doc
  bookings: [],     // Cached bookings array (sorted by createdAt desc)
  googleToken: null,   // OAuth access token for Sheets/Drive APIs
  unsubscribeSnap: null,   // Active Firestore onSnapshot unsubscribe fn
  charts: {
    bookedStatus: null,
    consumedStatus: null,
  },
  activeView: 'view-welcome',
  currentFilter: 'all',
  selectedYear: 'all',
  syncKeyPendingAction: null, // callback awaiting sync key verification
  confirmPendingResolve: null,
};

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 4: DOM ELEMENT CACHE ═════════════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const DOM = {
  loadingOverlay: $('loading-overlay'),
  authView: $('auth-view'),
  appShell: $('app-shell'),
  toastContainer: $('toast-container'),
  // Auth
  btnGoogleSignin: $('btn-google-signin'),
  authThemeToggle: $('auth-theme-toggle'),
  // Topbar
  btnMenuToggle: $('btn-menu-toggle'),
  appThemeToggle: $('app-theme-toggle'),
  topbarViewTitle: $('topbar-view-title'),
  btnSheetSyncTopbar: $('btn-sheet-sync-topbar'),
  // Sidebar
  sidebar: $('sidebar'),
  sidebarClose: $('sidebar-close'),
  navBackdrop: $('nav-backdrop'),
  sidebarAvatar: $('sidebar-avatar'),
  sidebarName: $('sidebar-name'),
  sidebarEmail: $('sidebar-email'),
  btnSignout: $('btn-signout'),
  btnSheetSyncSidebar: $('btn-sheet-sync-sidebar'),
  sheetSyncBadge: $('sheet-sync-badge'),
  // Welcome
  welcomeAvatar: $('welcome-avatar'),
  welcomeName: $('welcome-name'),
  welcomeEmail: $('welcome-email'),
  kpiTotal: $('kpi-total'),
  kpiDelivered: $('kpi-delivered'),
  kpiPending: $('kpi-pending'),
  kpiSheetStatus: $('kpi-sheet-status'),
  recentEmpty: $('recent-empty-msg'),
  recentTable: $('recent-bookings-table'),
  recentTbody: $('recent-bookings-tbody'),
  // New booking form
  formNewBooking: $('form-new-booking'),
  inputBookingId: $('input-booking-id'),
  inputDacId: $('input-dac-id'),
  inputBookingDate: $('input-booking-date'),
  inputCost: $('input-cost'),
  btnBookingSubmit: $('btn-booking-submit'),
  // Delivered form
  formGasDelivered: $('form-gas-delivered'),
  inputDeliverBookingId: $('input-deliver-booking-id'),
  btnDeliveredSubmit: $('btn-delivered-submit'),
  deliverResultPanel: $('deliver-result-panel'),
  deliverResultContent: $('deliver-result-content'),
  // Booked status
  chartBookedStatus: $('chart-booked-status'),
  statusChartWrapper: $('status-chart-wrapper'),
  statusChartEmpty: $('status-chart-empty'),
  statusTbody: $('status-table-tbody'),
  // Consumed
  chartConsumedStatus: $('chart-consumed-status'),
  consumedChartWrapper: $('consumed-chart-wrapper'),  // BUG-FIX #4: was missing from DOM cache
  consumedChartEmpty: $('consumed-chart-empty'),
  yearSelect: $('year-select'),
  consumedSummaryTbody: $('consumed-summary-tbody'),
  // Sheets modal
  sheetsModal: $('sheets-modal'),
  btnCloseModal: $('btn-close-modal'),
  sheetsModalBody: $('sheets-modal-body'),
  // Sync key modal
  syncKeyModal: $('sync-key-modal'),
  syncKeyModalTitleText: $('sync-key-modal-title-text'),
  syncKeyModalDesc: $('sync-key-modal-description'),
  formSyncKey: $('form-sync-key'),
  inputSyncKey: $('input-sync-key'),
  btnSyncKeyConfirm: $('btn-sync-key-confirm'),
  btnSyncKeyCancel: $('btn-sync-key-cancel'),
  btnToggleSyncKeyVis: $('btn-toggle-sync-key-vis'),
  errorSyncKey: $('error-sync-key'),
  // Confirm modal
  confirmModal: $('confirm-modal'),
  confirmModalTitle: $('confirm-modal-title'),
  confirmModalDesc: $('confirm-modal-desc'),
  btnConfirmOk: $('btn-confirm-ok'),
  btnConfirmCancel: $('btn-confirm-cancel'),
};

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 5: THEME ENGINE ═══════════════════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
const ThemeEngine = (() => {
  const STORAGE_KEY = 'fluido_theme';
  const DEFAULT = 'dark';

  function getStored() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT;
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  function toggle() {
    const current = document.documentElement.getAttribute('data-theme') || DEFAULT;
    apply(current === 'dark' ? 'light' : 'dark');
    // Redraw charts for new theme colors
    if (State.activeView === 'view-booked-status') renderBookedStatusChart(State.bookings, State.currentFilter);
    if (State.activeView === 'view-consumed-status') renderConsumedChart(State.bookings, State.selectedYear);
  }

  function init() {
    apply(getStored());
  }

  return { init, toggle, apply };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 6: TOAST NOTIFICATION SYSTEM ═════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
function showToast(type, title, message, durationMs = 4500) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${sanitizeHTML(title)}</div>
      ${message ? `<div class="toast-msg">${sanitizeHTML(message)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Dismiss notification" type="button">×</button>
  `;

  const dismiss = () => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  DOM.toastContainer.appendChild(toast);
  const timer = setTimeout(dismiss, durationMs);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 7: DOM SANITIZER (XSS protection) ════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>"'`\\]/g, '');
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 8: WEB CRYPTO SHA-256 UTILITY ════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
async function sha256Hex(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 9: CONFIRM DIALOG UTILITY ════════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
function showConfirmDialog(title, description) {
  return new Promise((resolve) => {
    DOM.confirmModal.querySelector('#confirm-modal-title').textContent = title;
    DOM.confirmModalDesc.textContent = description;
    State.confirmPendingResolve = resolve;
    openModal(DOM.confirmModal);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 10: MODAL HELPERS ════════════════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
function openModal(modalEl) {
  modalEl.hidden = false;
  modalEl.style.display = '';          // Remove any inline display override
  modalEl.setAttribute('aria-hidden', 'false');
  // Trap focus on first focusable element
  const focusable = modalEl.querySelectorAll('button, input, select, a[href]');
  if (focusable.length) setTimeout(() => focusable[0].focus(), 60);
}

function closeModal(modalEl) {
  if (!modalEl) return;                // Guard against null refs
  modalEl.hidden = true;
  modalEl.style.display = 'none';     // Explicit inline override — beats any CSS class
  modalEl.setAttribute('aria-hidden', 'true');
}

function closeAllModals() {
  closeModal(DOM.sheetsModal);
  closeModal(DOM.syncKeyModal);
  closeModal(DOM.confirmModal);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 11: SYNC KEY MODAL ════════════════════════════════════════════╗
═══════════════════════════════════════════════════════════════════════════ */
function promptSyncKey(title, description) {
  return new Promise((resolve) => {
    DOM.syncKeyModalTitleText.textContent = title;
    DOM.syncKeyModalDesc.textContent = description;
    DOM.inputSyncKey.value = '';
    DOM.errorSyncKey.textContent = '';
    State.syncKeyPendingAction = resolve;
    openModal(DOM.syncKeyModal);
    setTimeout(() => DOM.inputSyncKey.focus(), 80);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 12: VIEW ROUTER ───────────────────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
const VIEW_TITLES = {
  'view-welcome': 'Dashboard',
  'view-new-booking': 'New Gas Booking',
  'view-gas-delivered': 'Mark Delivered',
  'view-booked-status': 'Booking Status',
  'view-consumed-status': 'Consumption Analytics',
};

function navigateTo(viewId) {
  // Hide all views
  $$('.view').forEach(v => {
    v.classList.remove('active');
    v.hidden = true;
    v.setAttribute('aria-hidden', 'true');
  });

  // Show target view
  const target = $(viewId);
  if (!target) return;
  target.classList.add('active');
  target.hidden = false;
  target.setAttribute('aria-hidden', 'false');
  State.activeView = viewId;

  // Update nav items
  $$('.nav-item[data-view]').forEach(btn => {
    const isActive = btn.dataset.view === viewId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Update topbar title
  DOM.topbarViewTitle.textContent = VIEW_TITLES[viewId] || 'Fluido';

  // Desktop (≥1024px): sidebar is a persistent push-panel — stays open across nav.
  // Mobile (<1024px): overlay drawer — always close after navigation.
  if (window.innerWidth < 1024) closeSidebar();

  // View-specific render
  if (viewId === 'view-booked-status') {
    renderBookedStatusChart(State.bookings, State.currentFilter);
    renderBookedStatusTable(State.bookings, State.currentFilter);
  }
  if (viewId === 'view-consumed-status') {
    refreshYearSelect();
    renderConsumedChart(State.bookings, State.selectedYear);
    renderConsumedSummaryTable(State.bookings);
  }
  if (viewId === 'view-welcome') {
    refreshKPIs();
    renderRecentBookings();
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 13: SIDEBAR DRAWER CONTROL ───────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
/**
 * Unified sidebar drawer — works on both desktop and mobile.
 * #app-shell.sidebar-open drives the main-wrapper margin shift (CSS).
 * .sidebar.open drives the panel translate (CSS).
 * Backdrop pointer-events handled via CSS .nav-backdrop.active.
 */
function openSidebar() {
  DOM.appShell.classList.add('sidebar-open');
  DOM.sidebar.classList.add('open');
  DOM.navBackdrop.classList.add('active');
  DOM.btnMenuToggle.setAttribute('aria-expanded', 'true');
  DOM.sidebar.setAttribute('aria-hidden', 'false');
  // Move focus into sidebar for keyboard / screen-reader users
  const firstFocusable = DOM.sidebar.querySelector('button, [href], input, select');
  if (firstFocusable) setTimeout(() => firstFocusable.focus(), 60);
}

function closeSidebar() {
  DOM.appShell.classList.remove('sidebar-open');
  DOM.sidebar.classList.remove('open');
  DOM.navBackdrop.classList.remove('active');
  DOM.btnMenuToggle.setAttribute('aria-expanded', 'false');
  DOM.sidebar.setAttribute('aria-hidden', 'true');
}


/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 14: USER PROFILE (FIRESTORE) ─────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function ensureUserProfile(user) {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      email: user.email,
      displayName: user.displayName || '',
      linkedSheetId: null,
      linkedSheetUrl: null,
      syncKeyHash: null,
      updatedAt: Timestamp.now(),
    });
    State.userProfile = {
      email: user.email, displayName: user.displayName || '',
      linkedSheetId: null, linkedSheetUrl: null, syncKeyHash: null,
    };
  } else {
    State.userProfile = snap.data();
  }
}

async function refreshUserProfile() {
  if (!State.user) return;
  const snap = await getDoc(doc(db, 'users', State.user.uid));
  if (snap.exists()) State.userProfile = snap.data();
  updateSheetBadge();
  refreshKPIs();
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 15: POPULATE UI WITH USER DATA ───────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function populateUserUI(user) {
  const avatar = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=f97316&color=fff`;
  const displayName = user.displayName || user.email.split('@')[0];
  const email = user.email;

  // Sidebar
  DOM.sidebarAvatar.src = avatar;
  DOM.sidebarAvatar.alt = `${displayName} avatar`;
  DOM.sidebarName.textContent = displayName;
  DOM.sidebarEmail.textContent = email;

  // Welcome view
  DOM.welcomeAvatar.src = avatar;
  DOM.welcomeAvatar.alt = `${displayName} avatar`;
  DOM.welcomeName.textContent = displayName;
  DOM.welcomeEmail.textContent = email;
}

function refreshKPIs() {
  const bookings = State.bookings;
  const total = bookings.length;
  const delivered = bookings.filter(b => b.delivered).length;
  const pending = total - delivered;

  DOM.kpiTotal.textContent = total;
  DOM.kpiDelivered.textContent = delivered;
  DOM.kpiPending.textContent = pending;

  const linked = State.userProfile?.linkedSheetId;
  DOM.kpiSheetStatus.textContent = linked ? '🟢 Linked' : '⭕ Not linked';
}

function updateSheetBadge() {
  const linked = State.userProfile?.linkedSheetId;
  DOM.sheetSyncBadge.hidden = !linked;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 16: FIRESTORE REALTIME LISTENER ──────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function startBookingsListener(uid) {
  if (State.unsubscribeSnap) State.unsubscribeSnap();

  const q = query(
    collection(db, 'users', uid, 'bookings'),
    orderBy('createdAt', 'desc'),
  );

  State.unsubscribeSnap = onSnapshot(q, (snapshot) => {
    State.bookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    onBookingsUpdated();
  }, (err) => {
    console.error('Firestore snapshot error:', err);
    showToast('error', 'Data Sync Error', 'Failed to load booking data. Check your connection.');
  });
}

function onBookingsUpdated() {
  refreshKPIs();
  renderRecentBookings();
  refreshYearSelect();

  if (State.activeView === 'view-booked-status') {
    renderBookedStatusChart(State.bookings, State.currentFilter);
    renderBookedStatusTable(State.bookings, State.currentFilter);
  }
  if (State.activeView === 'view-consumed-status') {
    renderConsumedChart(State.bookings, State.selectedYear);
    renderConsumedSummaryTable(State.bookings);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 17: NEW BOOKING FORM ─────────────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function validateNewBookingForm() {
  let valid = true;

  const clearError = id => { $(id).textContent = ''; $(id.replace('error-', 'input-'))?.classList.remove('error'); };
  const setError = (id, msg, inputId) => {
    $(id).textContent = msg;
    if (inputId) { $(inputId)?.classList.add('error'); }
    valid = false;
  };

  clearError('error-booking-id');
  clearError('error-dac-id');
  clearError('error-booking-date');
  clearError('error-cost');

  const bookingId = sanitizeInput(DOM.inputBookingId.value);
  const dacId = sanitizeInput(DOM.inputDacId.value);
  const bookingDate = DOM.inputBookingDate.value;
  const cost = parseFloat(DOM.inputCost.value);

  if (!bookingId) setError('error-booking-id', 'Booking ID is required.', 'input-booking-id');
  if (!dacId) setError('error-dac-id', 'DAC ID is required.', 'input-dac-id');
  if (!bookingDate) setError('error-booking-date', 'Booking Date is required.', 'input-booking-date');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) setError('error-booking-date', 'Invalid date format.', 'input-booking-date');
  if (isNaN(cost) || cost <= 0) setError('error-cost', 'Cost must be a positive number.', 'input-cost');

  return valid ? { bookingId, dacId, bookingDate, cost } : null;
}

async function handleNewBookingSubmit(e) {
  e.preventDefault();
  const fields = validateNewBookingForm();
  if (!fields) return;

  const { bookingId, dacId, bookingDate, cost } = fields;
  const uid = State.user.uid;

  setButtonBusy(DOM.btnBookingSubmit, true);

  try {
    // Check for duplicate
    const existingRef = doc(db, 'users', uid, 'bookings', bookingId);
    const existingSnap = await getDoc(existingRef);

    if (existingSnap.exists()) {
      const confirmed = await showConfirmDialog(
        'Duplicate Booking ID',
        `A booking with ID "${bookingId}" already exists. Do you want to overwrite it?`
      );
      if (!confirmed) { setButtonBusy(DOM.btnBookingSubmit, false); return; }
    }

    const bookingData = {
      bookingId,
      dacId,
      bookingDate,
      cost,
      delivered: false,
      deliveredAt: null,
      createdAt: Date.now(),
    };

    await setDoc(existingRef, bookingData);
    showToast('success', 'Booking Created', `Booking ${bookingId} saved successfully.`);
    DOM.formNewBooking.reset();
    $$('.form-input').forEach(i => i.classList.remove('error'));

    // Auto-sync to Google Sheet if linked
    if (State.userProfile?.linkedSheetId && State.googleToken) {
      try {
        await appendBookingToSheet(bookingData);
      } catch (sheetErr) {
        showToast('warning', 'Sheet Sync Warning', 'Booking saved but failed to sync to Google Sheet.');
      }
    }
  } catch (err) {
    console.error('Create booking error:', err);
    showToast('error', 'Save Failed', err.message || 'Could not save booking. Try again.');
  } finally {
    setButtonBusy(DOM.btnBookingSubmit, false);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 18: MARK DELIVERED FORM ─────────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function handleMarkDelivered(e) {
  e.preventDefault();
  const rawId = DOM.inputDeliverBookingId.value;
  const bookingId = sanitizeInput(rawId);
  $('error-deliver-booking-id').textContent = '';
  DOM.inputDeliverBookingId.classList.remove('error');

  if (!bookingId) {
    $('error-deliver-booking-id').textContent = 'Booking ID is required.';
    DOM.inputDeliverBookingId.classList.add('error');
    return;
  }

  setButtonBusy(DOM.btnDeliveredSubmit, true);
  DOM.deliverResultPanel.hidden = true;

  try {
    const uid = State.user.uid;
    const docRef = doc(db, 'users', uid, 'bookings', bookingId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      renderDeliverResult('error', `Booking Not Found`,
        `No booking with ID "<strong>${sanitizeHTML(bookingId)}</strong>" was found in your account. Please verify the Booking ID and try again.`);
      return;
    }

    const data = docSnap.data();

    if (data.delivered) {
      const ts = data.deliveredAt
        ? new Date(data.deliveredAt).toLocaleString()
        : 'unknown time';
      renderDeliverResult('info', 'Already Delivered',
        `Booking <strong>${sanitizeHTML(bookingId)}</strong> was already marked as delivered on ${ts}.`);
      return;
    }

    const deliveredAt = new Date().toISOString();
    await updateDoc(docRef, { delivered: true, deliveredAt });
    renderDeliverResult('success', 'Delivery Confirmed',
      `Booking <strong>${sanitizeHTML(bookingId)}</strong> has been marked as delivered at ${new Date(deliveredAt).toLocaleString()}.`);
    showToast('success', 'Marked Delivered', `Booking ${bookingId} delivery confirmed.`);
    DOM.formGasDelivered.reset();

    // Auto-sync to sheet
    if (State.userProfile?.linkedSheetId && State.googleToken) {
      try {
        await syncDeliveredStatusToSheet(bookingId, deliveredAt);
      } catch {
        showToast('warning', 'Sheet Sync Warning', 'Status updated but sheet sync failed.');
      }
    }
  } catch (err) {
    console.error('Mark delivered error:', err);
    renderDeliverResult('error', 'Update Failed', err.message || 'Could not update delivery status.');
    showToast('error', 'Update Failed', err.message);
  } finally {
    setButtonBusy(DOM.btnDeliveredSubmit, false);
  }
}

function renderDeliverResult(type, title, html) {
  DOM.deliverResultPanel.hidden = false;
  DOM.deliverResultPanel.className = `result-panel result-panel--${type}`;
  DOM.deliverResultContent.innerHTML =
    `<div class="result-title">${title}</div><div class="result-meta">${html}</div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 19: CHART.JS RENDERER — BOOKING STATUS ───────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function getChartThemeColors() {
  const theme = document.documentElement.getAttribute('data-theme');
  return {
    gridColor: theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
    textColor: theme === 'dark' ? '#9ba3c4' : '#4b5563',
    tickColor: theme === 'dark' ? '#636a8a' : '#9ca3af',
    borderColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
  };
}

function filterBookings(bookings, filter) {
  if (filter === 'delivered') return bookings.filter(b => b.delivered);
  if (filter === 'pending') return bookings.filter(b => !b.delivered);
  return bookings;
}

/**
 * Sort comparator: ascending by bookingDate (YYYY-MM-DD).
 * Records with a missing/invalid date are pushed to the end.
 * YYYY-MM-DD strings compare correctly with plain localeCompare.
 */
function sortByBookingDateAsc(a, b) {
  const da = a.bookingDate || '';
  const db = b.bookingDate || '';
  if (!da && !db) return 0;
  if (!da) return 1;   // missing date → end
  if (!db) return -1;  // missing date → end
  return da.localeCompare(db);
}

function renderBookedStatusChart(bookings, filter = 'all') {
  const filtered = filterBookings([...bookings].sort(sortByBookingDateAsc), filter);
  const { gridColor, textColor } = getChartThemeColors();
  const isEmpty = filtered.length === 0;

  DOM.statusChartWrapper.hidden = isEmpty;
  DOM.statusChartEmpty.hidden = !isEmpty;
  if (isEmpty) return;

  const labels = filtered.map(b => `${b.bookingId}\n${b.bookingDate}`);
  const data = filtered.map(b => b.cost);
  const bgColors = filtered.map(b =>
    b.delivered
      ? 'rgba(16, 185, 129, 0.80)'
      : 'rgba(239, 68, 68, 0.80)'
  );
  const borderColors = filtered.map(b =>
    b.delivered ? '#10B981' : '#EF4444'
  );

  if (State.charts.bookedStatus) {
    State.charts.bookedStatus.destroy();
    State.charts.bookedStatus = null;
  }

  State.charts.bookedStatus = new Chart(DOM.chartBookedStatus, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Booking Cost (₹)',
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              return `Booking: ${filtered[idx].bookingId}`;
            },
            afterTitle: (items) => {
              const idx = items[0].dataIndex;
              return `Date: ${filtered[idx].bookingDate}`;
            },
            label: (item) => ` Cost: ₹${item.raw.toFixed(2)}`,
            afterLabel: (item) => {
              const b = filtered[item.dataIndex];
              return ` Status: ${b.delivered ? '✅ Delivered' : '⏳ Pending'}`;
            },
          },
          backgroundColor: 'rgba(17,20,32,0.95)',
          titleColor: '#f0f2ff',
          bodyColor: '#9ba3c4',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
        },
      },
      scales: {
        x: {
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 11 },
            maxRotation: 45,
          },
          grid: { color: gridColor },
          border: { display: false },
        },
        y: {
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: v => `₹${v}`,
          },
          grid: { color: gridColor },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderBookedStatusTable(bookings, filter = 'all') {
  const filtered = filterBookings([...bookings].sort(sortByBookingDateAsc), filter);
  const tbody = DOM.statusTbody;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-td">No bookings match this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td><span class="monospace">${sanitizeHTML(b.bookingId)}</span></td>
      <td><span class="monospace">${sanitizeHTML(b.dacId)}</span></td>
      <td>${sanitizeHTML(b.bookingDate)}</td>
      <td>₹${parseFloat(b.cost).toFixed(2)}</td>
      <td>
        <span class="status-badge status-badge--${b.delivered ? 'delivered' : 'pending'}">
          ${b.delivered ? '✅ Delivered' : '⏳ Pending'}
        </span>
      </td>
      <td>${b.deliveredAt ? new Date(b.deliveredAt).toLocaleString() : '—'}</td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 20: CHART.JS RENDERER — CONSUMED ANALYTICS ───────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildMonthlyAggregation(bookings, year) {
  const target = bookings.filter(b => {
    if (!b.bookingDate) return false;
    const y = parseInt(b.bookingDate.substring(0, 4), 10);
    return year === 'all' || y === parseInt(year, 10);
  });

  if (year !== 'all') {
    const counts = new Array(12).fill(0);
    const costs = new Array(12).fill(0);
    target.forEach(b => {
      const m = parseInt(b.bookingDate.substring(5, 7), 10) - 1;
      counts[m]++;
      costs[m] += parseFloat(b.cost) || 0;
    });
    return [{ year, counts, costs }];
  }

  // All years: group
  const byYear = {};
  target.forEach(b => {
    const y = b.bookingDate.substring(0, 4);
    if (!byYear[y]) byYear[y] = { counts: new Array(12).fill(0), costs: new Array(12).fill(0) };
    const m = parseInt(b.bookingDate.substring(5, 7), 10) - 1;
    byYear[y].counts[m]++;
    byYear[y].costs[m] += parseFloat(b.cost) || 0;
  });

  return Object.entries(byYear)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .map(([yr, d]) => ({ year: yr, counts: d.counts, costs: d.costs }));
}

const YEAR_COLORS = [
  { bg: 'rgba(249,115,22,0.75)', border: '#f97316' },
  { bg: 'rgba(139,92,246,0.75)', border: '#8b5cf6' },
  { bg: 'rgba(59,130,246,0.75)', border: '#3b82f6' },
  { bg: 'rgba(16,185,129,0.75)', border: '#10b981' },
  { bg: 'rgba(245,158,11,0.75)', border: '#f59e0b' },
  { bg: 'rgba(236,72,153,0.75)', border: '#ec4899' },
];

function renderConsumedChart(bookings, year = 'all') {
  const agg = buildMonthlyAggregation(bookings, year);
  const { gridColor, textColor } = getChartThemeColors();
  const isEmpty = agg.length === 0 || agg.every(a => a.counts.every(c => c === 0));

  // BUG-FIX #3: consumedChartWrapper visibility was never toggled (unlike statusChartWrapper).
  // Without this, the canvas container stays hidden/visible regardless of data state.
  DOM.consumedChartWrapper.hidden = isEmpty;
  DOM.consumedChartEmpty.hidden = !isEmpty;

  if (State.charts.consumedStatus) {
    State.charts.consumedStatus.destroy();
    State.charts.consumedStatus = null;
  }
  if (isEmpty) return;

  const datasets = agg.map((entry, i) => {
    const col = YEAR_COLORS[i % YEAR_COLORS.length];
    return {
      label: `${entry.year} — Cylinders`,
      data: entry.counts,
      backgroundColor: col.bg,
      borderColor: col.border,
      borderWidth: 2,
      borderRadius: 5,
      borderSkipped: false,
    };
  });

  State.charts.consumedStatus = new Chart(DOM.chartConsumedStatus, {
    type: 'bar',
    data: { labels: MONTH_NAMES, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: agg.length > 1,
          labels: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 12 },
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 4,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(17,20,32,0.95)',
          titleColor: '#f0f2ff',
          bodyColor: '#9ba3c4',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: item => ` ${item.dataset.label.split('—')[0].trim()}: ${item.raw} cylinder${item.raw !== 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 12 } },
          grid: { color: gridColor },
          border: { display: false },
        },
        y: {
          ticks: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 12 },
            stepSize: 1,
            callback: v => Number.isInteger(v) ? v : null,
          },
          grid: { color: gridColor },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderConsumedSummaryTable(bookings) {
  const byYear = {};
  bookings.forEach(b => {
    if (!b.bookingDate) return;
    const y = b.bookingDate.substring(0, 4);
    if (!byYear[y]) byYear[y] = { count: 0, cost: 0, months: new Array(12).fill(0) };
    byYear[y].count++;
    byYear[y].cost += parseFloat(b.cost) || 0;
    const m = parseInt(b.bookingDate.substring(5, 7), 10) - 1;
    byYear[y].months[m]++;
  });

  const years = Object.entries(byYear).sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

  if (years.length === 0) {
    DOM.consumedSummaryTbody.innerHTML = '<tr><td colspan="5" class="empty-td">No data available.</td></tr>';
    return;
  }

  DOM.consumedSummaryTbody.innerHTML = years.map(([yr, d]) => {
    const avg = d.count > 0 ? (d.cost / d.count).toFixed(2) : '—';
    const peakIdx = d.months.indexOf(Math.max(...d.months));
    const peakMonth = d.months[peakIdx] > 0 ? MONTH_NAMES[peakIdx] : '—';
    return `
      <tr>
        <td><strong>${sanitizeHTML(yr)}</strong></td>
        <td>${d.count}</td>
        <td>₹${d.cost.toFixed(2)}</td>
        <td>₹${avg}</td>
        <td>${peakMonth}</td>
      </tr>
    `;
  }).join('');
}

function refreshYearSelect() {
  const years = [...new Set(
    State.bookings
      .filter(b => b.bookingDate)
      .map(b => b.bookingDate.substring(0, 4))
  )].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const current = DOM.yearSelect.value;
  DOM.yearSelect.innerHTML = '<option value="all">All Years</option>' +
    years.map(y => `<option value="${sanitizeHTML(y)}">${sanitizeHTML(y)}</option>`).join('');

  if (years.includes(current)) DOM.yearSelect.value = current;
  else { DOM.yearSelect.value = 'all'; State.selectedYear = 'all'; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 21: RECENT BOOKINGS TABLE (DASHBOARD) ─────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function renderRecentBookings() {
  const recent = State.bookings.slice(0, 6);

  if (recent.length === 0) {
    DOM.recentEmpty.hidden = false;
    DOM.recentTable.hidden = true;
    return;
  }

  DOM.recentEmpty.hidden = true;
  DOM.recentTable.hidden = false;

  DOM.recentTbody.innerHTML = recent.map(b => `
    <tr>
      <td><span class="monospace">${sanitizeHTML(b.bookingId)}</span></td>
      <td>${sanitizeHTML(b.bookingDate)}</td>
      <td>₹${parseFloat(b.cost).toFixed(2)}</td>
      <td>
        <span class="status-badge status-badge--${b.delivered ? 'delivered' : 'pending'}">
          ${b.delivered ? '✅ Delivered' : '⏳ Pending'}
        </span>
      </td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 22: GOOGLE OAUTH TOKEN FLOW ──────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function ensureGoogleAccessToken() {
  // Try sessionStorage first
  const cached = sessionStorage.getItem('fluido_g_token');
  const expiry = sessionStorage.getItem('fluido_g_token_exp');
  if (cached && expiry && Date.now() < parseInt(expiry, 10)) {
    State.googleToken = cached;
    return cached;
  }

  // Re-auth with popup to get fresh token
  const provider = new GoogleAuthProvider();
  GOOGLE_SCOPES.forEach(s => provider.addScope(s));

  try {
    const result = await signInWithPopup(auth, provider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    const token = cred.accessToken;
    State.googleToken = token;
    // Cache for 55 minutes
    sessionStorage.setItem('fluido_g_token', token);
    sessionStorage.setItem('fluido_g_token_exp', String(Date.now() + 55 * 60 * 1000));
    return token;
  } catch (err) {
    if (err.code === 'auth/popup-blocked') {
      showToast('warning', 'Pop-Up Blocked', 'Your browser blocked the Google authentication window. Please enable pop-ups for this site in your browser bar and try again.', 8000);
    } else if (err.code !== 'auth/popup-closed-by-user') {
      showToast('error', 'Google Auth Failed', err.message);
    }
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 23: DRIVE HEALTH CHECK & AUTO-UNLINK ─────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function verifyLinkedSheetStatus() {
  if (!State.userProfile?.linkedSheetId) return;
  const token = State.googleToken || sessionStorage.getItem('fluido_g_token');
  if (!token) return;

  const sheetId = State.userProfile.linkedSheetId;
  try {
    const res = await fetch(`${DRIVE_API}/${sheetId}?fields=id,trashed`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 404 || res.status === 403) {
      await autoUnlinkSheet(`The linked Google Sheet was ${res.status === 404 ? 'deleted' : 'access-revoked'} and has been automatically unlinked.`);
      return;
    }

    if (res.ok) {
      const json = await res.json();
      if (json.trashed) {
        await autoUnlinkSheet('The linked Google Sheet was moved to trash and has been automatically unlinked.');
      }
    }
  } catch {
    // Network error — don't unlink, silent fail
  }
}

async function autoUnlinkSheet(message) {
  try {
    const uid = State.user.uid;
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      linkedSheetId: null,
      linkedSheetUrl: null,
      syncKeyHash: null,
      updatedAt: Timestamp.now(),
    });
    await refreshUserProfile();
    showToast('warning', 'Sheet Auto-Unlinked', message, 7000);
  } catch (err) {
    console.error('Auto-unlink error:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 24: GOOGLE SHEETS API CLIENT ─────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
const SHEET_HEADERS = ['Booking ID', 'DAC ID', 'Booking Date', 'Cost', 'Delivered Status', 'Updated At'];

async function sheetsRequest(method, url, body, token) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function createNewSheet(token) {
  const spreadsheet = await sheetsRequest('POST', SHEETS_API, {
    properties: { title: `Fluido Gas Bookings — ${State.user.displayName || State.user.email}` },
    sheets: [{
      properties: { title: 'Bookings', sheetId: 0 },
    }],
  }, token);

  const spreadsheetId = spreadsheet.spreadsheetId;

  // Write header row
  await sheetsRequest('PUT',
    `${SHEETS_API}/${spreadsheetId}/values/Bookings!A1:F1?valueInputOption=RAW`,
    { values: [SHEET_HEADERS] }, token);

  // Format header row bold + freeze
  await sheetsRequest('POST',
    `${SHEETS_API}/${spreadsheetId}:batchUpdate`,
    {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.243, green: 0.275, blue: 0.435 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      ],
    }, token);

  // Populate existing data
  if (State.bookings.length > 0) {
    const rows = bookingsToSheetRows(State.bookings);
    await sheetsRequest('POST',
      `${SHEETS_API}/${spreadsheetId}/values/Bookings!A2:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: rows }, token);
  }

  return { spreadsheetId, spreadsheetUrl: spreadsheet.spreadsheetUrl };
}

function bookingToRow(b) {
  return [
    b.bookingId,
    b.dacId,
    b.bookingDate,
    b.cost,
    b.delivered ? 'DELIVERED' : 'PENDING',
    b.deliveredAt || '',
  ];
}

function bookingsToSheetRows(bookings) {
  return [...bookings].sort((a, b) => a.createdAt - b.createdAt).map(bookingToRow);
}

async function appendBookingToSheet(booking) {
  const token = State.googleToken;
  if (!token || !State.userProfile?.linkedSheetId) return;
  const sid = State.userProfile.linkedSheetId;
  await sheetsRequest('POST',
    `${SHEETS_API}/${sid}/values/Bookings!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values: [bookingToRow(booking)] }, token);
}

async function syncDeliveredStatusToSheet(bookingId, deliveredAt) {
  const token = State.googleToken;
  if (!token || !State.userProfile?.linkedSheetId) return;
  const sid = State.userProfile.linkedSheetId;

  // Fetch all rows to find the row index
  const data = await sheetsRequest('GET',
    `${SHEETS_API}/${sid}/values/Bookings!A:F`, null, token);

  const rows = data.values || [];
  const rowIdx = rows.findIndex((row, i) => i > 0 && row[0] === bookingId);
  if (rowIdx === -1) return; // Not found in sheet — skip

  const sheetRowNum = rowIdx + 1; // 1-indexed, +1 for header
  await sheetsRequest('PUT',
    `${SHEETS_API}/${sid}/values/Bookings!E${sheetRowNum}:F${sheetRowNum}?valueInputOption=RAW`,
    { values: [['DELIVERED', deliveredAt]] }, token);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 25: SHEET-TO-DATABASE PULL SYNC (KEY-GATED) ──────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function pullSyncFromSheet() {
  const token = await ensureGoogleAccessToken();
  if (!token) return;

  const sheetId = State.userProfile?.linkedSheetId;
  if (!sheetId) { showToast('info', 'No Sheet Linked', 'Link a Google Sheet first.'); return; }

  // Verify sheet health before pull
  await verifyLinkedSheetStatus();
  if (!State.userProfile?.linkedSheetId) return; // was auto-unlinked

  // Gate with sync key
  const inputKey = await promptSyncKey(
    'Sync Permission Key',
    'Enter your Sync Key to authorize pulling edits from the Google Sheet into Fluido.'
  );
  if (inputKey === null) return;

  const inputHash = await sha256Hex(inputKey);
  const storedHash = State.userProfile.syncKeyHash;
  if (inputHash !== storedHash) {
    showToast('error', 'Invalid Sync Key', 'The Sync Key you entered does not match. Pull sync aborted.');
    return;
  }

  showToast('info', 'Pulling from Sheet…', 'Fetching rows from your Google Sheet.');

  try {
    const data = await sheetsRequest('GET',
      `${SHEETS_API}/${sheetId}/values/Bookings!A2:F`, null, token);

    const rows = (data.values || []).filter(r => r.length >= 4);
    if (rows.length === 0) { showToast('info', 'Sheet Empty', 'No data rows found in the sheet.'); return; }

    const uid = State.user.uid;
    const batch = writeBatch(db);
    let updated = 0;

    // BUG-FIX #2: Pre-fetch all existing booking docs so we can preserve
    // their original `createdAt` timestamps. Overwriting createdAt on every
    // pull destroys the Firestore sort order (ordered by createdAt desc),
    // causing charts and tables to show scrambled or empty data.
    const existingDocs = {};
    const existingSnaps = await Promise.all(
      rows.map(row => {
        const id = sanitizeInput(String(row[0] || ''));
        return id ? getDoc(doc(db, 'users', uid, 'bookings', id)) : Promise.resolve(null);
      })
    );
    existingSnaps.forEach(snap => {
      if (snap && snap.exists()) {
        existingDocs[snap.id] = snap.data();
      }
    });

    for (const row of rows) {
      const bookingId = sanitizeInput(String(row[0] || ''));
      const dacId = sanitizeInput(String(row[1] || ''));
      const bookingDate = sanitizeInput(String(row[2] || ''));
      const cost = parseFloat(row[3]);
      const deliveredRaw = String(row[4] || '').trim().toUpperCase();
      const deliveredAt = row[5] ? sanitizeInput(String(row[5])) : null;

      // Schema validation
      if (!bookingId || !dacId || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || isNaN(cost) || cost <= 0) continue;
      const delivered = deliveredRaw === 'DELIVERED';

      // Preserve original createdAt so Firestore ordering (createdAt desc) is intact.
      // Only assign a new timestamp for genuinely new documents.
      const existingData = existingDocs[bookingId];
      const createdAt = existingData?.createdAt ?? Date.now();

      const docRef = doc(db, 'users', uid, 'bookings', bookingId);
      batch.set(docRef, {
        bookingId,
        dacId,
        bookingDate,
        cost,
        delivered,
        deliveredAt: delivered ? (deliveredAt || new Date().toISOString()) : null,
        createdAt,
      }, { merge: true });
      updated++;
    }

    await batch.commit();
    showToast('success', 'Sync Complete', `${updated} booking record${updated !== 1 ? 's' : ''} synced from Google Sheet.`);
  } catch (err) {
    console.error('Pull sync error:', err);
    showToast('error', 'Sync Failed', err.message || 'Could not pull data from sheet.');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 26: SHEETS SYNC MODAL RENDERING ───────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function renderSheetsModalBody() {
  const profile = State.userProfile;
  const linked = profile?.linkedSheetId;

  if (linked) {
    DOM.sheetsModalBody.innerHTML = `
      <div class="alert-box alert-box--success">
        <span class="alert-icon">🟢</span>
        <span class="alert-text">A Google Sheet is currently linked to your account.</span>
      </div>
      <div class="sheet-section">
        <div class="sheet-linked-info">
          <p>✅ Sheet linked successfully</p>
          <div class="sheet-linked-url">${sanitizeHTML(profile.linkedSheetUrl || linked)}</div>
        </div>
      </div>
      <hr class="modal-divider" />
      <div class="sheet-section">
        <div class="sheet-section-title">⬆️ Push All Data to Sheet</div>
        <p style="font-size:0.875rem;color:var(--text-secondary)">Overwrite the sheet with all current Firestore bookings.</p>
        <div class="modal-actions-row mt-4">
          <button class="btn btn-secondary" id="modal-btn-push-all">Push All Records</button>
        </div>
      </div>
      <hr class="modal-divider" />
      <div class="sheet-section">
        <div class="sheet-section-title">⬇️ Pull Edits from Sheet</div>
        <p style="font-size:0.875rem;color:var(--text-secondary)">Import changes made directly in the sheet back into Fluido. Requires Sync Key.</p>
        <div class="modal-actions-row mt-4">
          <button class="btn btn-secondary" id="modal-btn-pull-sync">Pull from Sheet (Key Required)</button>
        </div>
      </div>
      <hr class="modal-divider" />
      <div class="sheet-section">
        <div class="sheet-section-title">🔗 Manage Link</div>
        <div class="modal-actions-row mt-4">
          <a href="${sanitizeHTML(profile.linkedSheetUrl || `https://docs.google.com/spreadsheets/d/${linked}`)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost">Open Sheet ↗</a>
          <button class="btn btn-danger" id="modal-btn-unlink">Unlink Sheet</button>
        </div>
      </div>
    `;

    $('modal-btn-push-all')?.addEventListener('click', handlePushAllToSheet);
    $('modal-btn-pull-sync')?.addEventListener('click', () => { closeModal(DOM.sheetsModal); pullSyncFromSheet(); });
    $('modal-btn-unlink')?.addEventListener('click', handleUnlinkSheet);
  } else {
    DOM.sheetsModalBody.innerHTML = `
      <div class="alert-box alert-box--info">
        <span class="alert-icon">ℹ️</span>
        <span class="alert-text">No Google Sheet is linked. Generate a new one or link an existing sheet to enable cloud spreadsheet sync.</span>
      </div>
      <hr class="modal-divider" />
      <div class="sheet-section">
        <div class="sheet-section-title">✨ Generate New Sheet</div>
        <p style="font-size:0.875rem;color:var(--text-secondary)">Creates a new Google Sheet in your Drive with formatted headers and syncs all current data.</p>
        <div class="modal-actions-row mt-4">
          <button class="btn btn-primary" id="modal-btn-generate">Generate New Sheet</button>
        </div>
      </div>
      <hr class="modal-divider" />
      <div class="sheet-section">
        <div class="sheet-section-title">🔗 Link Existing Sheet</div>
        <p style="font-size:0.875rem;color:var(--text-secondary)">Enter the Spreadsheet ID or full URL of an existing Google Sheet.</p>
        <div class="form-group mt-4">
          <label for="modal-existing-sheet-input" class="form-label">Spreadsheet URL or ID</label>
          <input type="text" id="modal-existing-sheet-input" class="form-input" placeholder="https://docs.google.com/spreadsheets/d/…" />
          <span class="form-error" id="modal-existing-sheet-error" role="alert" aria-live="polite"></span>
        </div>
        <div class="modal-actions-row mt-4">
          <button class="btn btn-secondary" id="modal-btn-link-existing">Link Sheet</button>
        </div>
      </div>
    `;

    $('modal-btn-generate')?.addEventListener('click', handleGenerateSheet);
    $('modal-btn-link-existing')?.addEventListener('click', handleLinkExistingSheet);
  }
}

async function handleGenerateSheet() {
  const token = await ensureGoogleAccessToken();
  if (!token) return;

  // Prompt for sync key creation
  const syncKey = await promptSyncKey(
    'Create Sync Permission Key',
    'Set a Sync Key (passphrase or PIN) to protect future pull-sync operations. Keep it safe — it cannot be recovered.'
  );
  if (syncKey === null) return;
  if (syncKey.trim().length < 4) {
    showToast('warning', 'Key Too Short', 'Sync Key must be at least 4 characters.');
    return;
  }

  closeModal(DOM.sheetsModal);
  showToast('info', 'Creating Sheet…', 'Please wait while your Google Sheet is being set up.');

  try {
    const { spreadsheetId, spreadsheetUrl } = await createNewSheet(token);
    const syncKeyHash = await sha256Hex(syncKey);

    await updateDoc(doc(db, 'users', State.user.uid), {
      linkedSheetId: spreadsheetId,
      linkedSheetUrl: spreadsheetUrl,
      syncKeyHash,
      updatedAt: Timestamp.now(),
    });

    await refreshUserProfile();
    showToast('success', 'Sheet Created!', 'Your Google Sheet is ready and linked.', 6000);
  } catch (err) {
    console.error('Generate sheet error:', err);
    showToast('error', 'Sheet Creation Failed', err.message);
  }
}

async function handleLinkExistingSheet() {
  const inputEl = $('modal-existing-sheet-input');
  const errEl = $('modal-existing-sheet-error');
  const raw = (inputEl?.value || '').trim();

  let spreadsheetId = raw;
  // Extract ID from URL
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) spreadsheetId = match[1];

  if (!spreadsheetId) {
    if (errEl) errEl.textContent = 'Please enter a valid Spreadsheet URL or ID.';
    return;
  }
  if (errEl) errEl.textContent = '';

  const token = await ensureGoogleAccessToken();
  if (!token) return;

  // Verify access via Drive
  try {
    const driveRes = await fetch(`${DRIVE_API}/${spreadsheetId}?fields=id,name,trashed`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!driveRes.ok) throw new Error('Cannot access this sheet. Make sure it exists and is shared with your Google account.');
    const driveData = await driveRes.json();
    if (driveData.trashed) throw new Error('This Google Sheet is in the trash. Restore it first.');
  } catch (err) {
    if ($('modal-existing-sheet-error')) $('modal-existing-sheet-error').textContent = err.message;
    return;
  }

  // Prompt sync key
  const syncKey = await promptSyncKey(
    'Create Sync Permission Key',
    'Set a Sync Key to protect pull-sync operations for this linked sheet.'
  );
  if (syncKey === null) return;
  if (syncKey.trim().length < 4) {
    showToast('warning', 'Key Too Short', 'Sync Key must be at least 4 characters.'); return;
  }

  closeModal(DOM.sheetsModal);

  try {
    const syncKeyHash = await sha256Hex(syncKey);
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    await updateDoc(doc(db, 'users', State.user.uid), {
      linkedSheetId: spreadsheetId,
      linkedSheetUrl: sheetUrl,
      syncKeyHash,
      updatedAt: Timestamp.now(),
    });

    await refreshUserProfile();
    showToast('success', 'Sheet Linked!', 'Your existing Google Sheet has been linked.', 6000);
  } catch (err) {
    showToast('error', 'Link Failed', err.message);
  }
}

async function handlePushAllToSheet() {
  const token = State.googleToken || await ensureGoogleAccessToken();
  if (!token) return;

  const sheetId = State.userProfile?.linkedSheetId;
  if (!sheetId) return;

  closeModal(DOM.sheetsModal);
  showToast('info', 'Pushing to Sheet…', `Syncing ${State.bookings.length} booking(s) to Google Sheets.`);

  try {
    // Clear existing data rows
    await sheetsRequest('POST', `${SHEETS_API}/${sheetId}:batchUpdate`, {
      requests: [{
        updateCells: {
          range: { sheetId: 0, startRowIndex: 1 },
          fields: 'userEnteredValue',
        },
      }],
    }, token);

    if (State.bookings.length > 0) {
      const rows = bookingsToSheetRows(State.bookings);
      await sheetsRequest('POST',
        `${SHEETS_API}/${sheetId}/values/Bookings!A2:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { values: rows }, token);
    }
    showToast('success', 'Push Complete', `${State.bookings.length} booking(s) pushed to Google Sheet.`);
  } catch (err) {
    console.error('Push all error:', err);
    showToast('error', 'Push Failed', err.message);
  }
}

async function handleUnlinkSheet() {
  closeModal(DOM.sheetsModal);
  const confirmed = await showConfirmDialog(
    'Unlink Google Sheet',
    'Are you sure you want to unlink your Google Sheet? Your Firestore data and the spreadsheet itself will remain intact — only the link will be removed.'
  );
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, 'users', State.user.uid), {
      linkedSheetId: null,
      linkedSheetUrl: null,
      syncKeyHash: null,
      updatedAt: Timestamp.now(),
    });
    await refreshUserProfile();
    showToast('success', 'Sheet Unlinked', 'Your Google Sheet has been unlinked. Your data is safe.');
  } catch (err) {
    showToast('error', 'Unlink Failed', err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 27: SIGN-OUT WITH MEMORY SANITIZATION ────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function handleSignOut() {
  const confirmed = await showConfirmDialog(
    'Sign Out',
    'Are you sure you want to sign out of Fluido?'
  );
  if (!confirmed) return;

  // 1. Destroy all Chart.js instances
  Object.keys(State.charts).forEach(key => {
    if (State.charts[key]) {
      State.charts[key].destroy();
      State.charts[key] = null;
    }
  });

  // 2. Unsubscribe Firestore listener
  if (State.unsubscribeSnap) {
    State.unsubscribeSnap();
    State.unsubscribeSnap = null;
  }

  // 3. Clear all in-memory state
  State.user = null;
  State.userProfile = null;
  State.bookings = [];
  State.googleToken = null;

  // 4. Wipe data containers
  DOM.recentTbody.innerHTML = '';
  DOM.statusTbody.innerHTML = '';
  DOM.consumedSummaryTbody.innerHTML = '';
  DOM.sheetsModalBody.innerHTML = '';

  // 5. Clear sessionStorage (keep theme)
  const theme = localStorage.getItem('fluido_theme');
  sessionStorage.clear();
  localStorage.clear();
  if (theme) localStorage.setItem('fluido_theme', theme);

  // 6. Close all modals
  closeAllModals();

  // 7. Firebase sign-out then reload
  try {
    await signOut(auth);
  } finally {
    window.location.replace(window.location.pathname);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 28: BUTTON BUSY STATE ────────────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function setButtonBusy(btn, busy) {
  if (!btn) return;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  btn.disabled = busy;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 29: AUTH STATE MACHINE & APP BOOTSTRAP ───────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function bootApp(user) {
  State.user = user;

  await ensureUserProfile(user);
  populateUserUI(user);
  refreshKPIs();
  updateSheetBadge();

  // Start Firestore realtime listener
  startBookingsListener(user.uid);

  // Show app shell, hide auth
  DOM.authView.style.display = 'none';
  DOM.authView.setAttribute('aria-hidden', 'true');
  DOM.appShell.style.display = 'flex';
  DOM.appShell.setAttribute('aria-hidden', 'false');

  // Ensure sidebar starts CLOSED on every login — never assume prior state
  closeSidebar();

  navigateTo('view-welcome');

  // Background sheet health check
  const cachedToken = sessionStorage.getItem('fluido_g_token');
  if (cachedToken) {
    State.googleToken = cachedToken;
    verifyLinkedSheetStatus();
  }
}

function showAuthView() {
  DOM.loadingOverlay.classList.add('hidden');
  DOM.appShell.style.display = 'none';
  DOM.appShell.setAttribute('aria-hidden', 'true');
  DOM.authView.style.display = '';
  DOM.authView.setAttribute('aria-hidden', 'false');
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 30: EVENT LISTENERS ──────────────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
function bindEventListeners() {

  // ── Theme toggles
  [DOM.authThemeToggle, DOM.appThemeToggle].forEach(btn => {
    btn?.addEventListener('click', ThemeEngine.toggle);
  });

  // ── Google Sign-In
  DOM.btnGoogleSignin.addEventListener('click', async () => {
    setButtonBusy(DOM.btnGoogleSignin, true);
    try {
      const provider = new GoogleAuthProvider();
      GOOGLE_SCOPES.forEach(s => provider.addScope(s));
      const result = await signInWithPopup(auth, provider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      if (cred?.accessToken) {
        State.googleToken = cred.accessToken;
        sessionStorage.setItem('fluido_g_token', cred.accessToken);
        sessionStorage.setItem('fluido_g_token_exp', String(Date.now() + 55 * 60 * 1000));
      }
    } catch (err) {
      if (err.code === 'auth/popup-blocked') {
        showToast('warning', 'Pop-Up Blocked', 'Your browser blocked the sign-in pop-up. Please allow pop-ups for this site in your browser address bar and click Sign In again.', 8000);
      } else if (err.code !== 'auth/popup-closed-by-user') {
        showToast('error', 'Sign-In Failed', err.message || 'Google sign-in failed. Try again.');
      }
    } finally {
      setButtonBusy(DOM.btnGoogleSignin, false);
    }
  });

  // ── Sign-Out
  DOM.btnSignout.addEventListener('click', handleSignOut);

  // ── Sidebar drawer toggle (all screen sizes)
  DOM.btnMenuToggle.addEventListener('click', openSidebar);
  DOM.sidebarClose.addEventListener('click', closeSidebar);
  DOM.navBackdrop.addEventListener('click', closeSidebar);
  DOM.navBackdrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') closeSidebar(); });

  // ── Nav items
  $$('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // ── Quick-action cards on dashboard
  $$('.quick-action-card[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });
  $('qa-sheets-btn')?.addEventListener('click', openSheetsModal);

  // ── New Booking form
  DOM.formNewBooking.addEventListener('submit', handleNewBookingSubmit);
  DOM.formNewBooking.addEventListener('reset', () => {
    $$('#form-new-booking .form-error').forEach(el => { el.textContent = ''; });
    $$('#form-new-booking .form-input').forEach(el => el.classList.remove('error'));
  });

  // ── Mark Delivered form
  DOM.formGasDelivered.addEventListener('submit', handleMarkDelivered);

  // ── Booked status filter buttons
  $$('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      State.currentFilter = btn.dataset.filter;
      $$('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBookedStatusChart(State.bookings, State.currentFilter);
      renderBookedStatusTable(State.bookings, State.currentFilter);
    });
  });

  // ── Year select
  DOM.yearSelect.addEventListener('change', () => {
    State.selectedYear = DOM.yearSelect.value;
    renderConsumedChart(State.bookings, State.selectedYear);
  });

  // ── Sheets modal open
  [DOM.btnSheetSyncSidebar, DOM.btnSheetSyncTopbar].forEach(btn => {
    btn?.addEventListener('click', openSheetsModal);
  });

  // ── Close sheets modal
  DOM.btnCloseModal.addEventListener('click', () => closeModal(DOM.sheetsModal));
  DOM.sheetsModal.addEventListener('click', e => {
    if (e.target === DOM.sheetsModal) closeModal(DOM.sheetsModal);
  });

  // ── Sync key modal submit
  DOM.formSyncKey.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = DOM.inputSyncKey.value;
    if (!key.trim()) {
      DOM.errorSyncKey.textContent = 'Sync Key is required.';
      return;
    }
    DOM.errorSyncKey.textContent = '';
    closeModal(DOM.syncKeyModal);
    if (State.syncKeyPendingAction) {
      const resolve = State.syncKeyPendingAction;
      State.syncKeyPendingAction = null;
      resolve(key);
    }
  });
  DOM.btnSyncKeyCancel.addEventListener('click', () => {
    closeModal(DOM.syncKeyModal);
    if (State.syncKeyPendingAction) {
      const resolve = State.syncKeyPendingAction;
      State.syncKeyPendingAction = null;
      resolve(null);
    }
  });
  DOM.btnCloseSyncKeyModal?.addEventListener('click', () => {
    closeModal(DOM.syncKeyModal);
    if (State.syncKeyPendingAction) {
      const resolve = State.syncKeyPendingAction;
      State.syncKeyPendingAction = null;
      resolve(null);
    }
  });
  DOM.syncKeyModal.addEventListener('click', e => {
    if (e.target === DOM.syncKeyModal) {
      closeModal(DOM.syncKeyModal);
      if (State.syncKeyPendingAction) {
        const resolve = State.syncKeyPendingAction;
        State.syncKeyPendingAction = null;
        resolve(null);
      }
    }
  });

  // ── Sync key visibility toggle
  DOM.btnToggleSyncKeyVis.addEventListener('click', () => {
    const isPass = DOM.inputSyncKey.type === 'password';
    DOM.inputSyncKey.type = isPass ? 'text' : 'password';
    DOM.btnToggleSyncKeyVis.querySelector('.eye-open').hidden = isPass;
    DOM.btnToggleSyncKeyVis.querySelector('.eye-closed').hidden = !isPass;
    DOM.btnToggleSyncKeyVis.setAttribute('aria-label', isPass ? 'Hide sync key' : 'Show sync key');
  });

  // ── Confirm dialog
  DOM.btnConfirmOk.addEventListener('click', () => {
    closeModal(DOM.confirmModal);
    if (State.confirmPendingResolve) {
      const resolve = State.confirmPendingResolve;
      State.confirmPendingResolve = null;
      resolve(true);
    }
  });
  DOM.btnConfirmCancel.addEventListener('click', () => {
    closeModal(DOM.confirmModal);
    if (State.confirmPendingResolve) {
      const resolve = State.confirmPendingResolve;
      State.confirmPendingResolve = null;
      resolve(false);
    }
  });
  DOM.confirmModal.addEventListener('click', e => {
    if (e.target === DOM.confirmModal) {
      closeModal(DOM.confirmModal);
      if (State.confirmPendingResolve) {
        const resolve = State.confirmPendingResolve;
        State.confirmPendingResolve = null;
        resolve(false);
      }
    }
  });

  // ── Keyboard: Escape closes sidebar and modals
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Close sidebar first if it's open
    if (DOM.sidebar.classList.contains('open')) { closeSidebar(); return; }
    if (!DOM.sheetsModal.hidden) closeModal(DOM.sheetsModal);
    if (!DOM.syncKeyModal.hidden) {
      closeModal(DOM.syncKeyModal);
      if (State.syncKeyPendingAction) {
        const resolve = State.syncKeyPendingAction;
        State.syncKeyPendingAction = null;
        resolve(null);
      }
    }
    if (!DOM.confirmModal.hidden) {
      closeModal(DOM.confirmModal);
      if (State.confirmPendingResolve) {
        const resolve = State.confirmPendingResolve;
        State.confirmPendingResolve = null;
        resolve(false);
      }
    }
  });

  // ── Visibility change: re-run sheet health check on tab focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && State.user && State.userProfile?.linkedSheetId) {
      const token = sessionStorage.getItem('fluido_g_token');
      if (token) {
        State.googleToken = token;
        verifyLinkedSheetStatus();
      }
    }
  });

  // ── Legal link placeholders
  $('terms-link')?.addEventListener('click', e => { e.preventDefault(); showToast('info', 'Terms of Service', 'Terms document not yet published.'); });
  $('privacy-link')?.addEventListener('click', e => { e.preventDefault(); showToast('info', 'Privacy Policy', 'Privacy policy document not yet published.'); });
}

function openSheetsModal() {
  renderSheetsModalBody();
  openModal(DOM.sheetsModal);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 31: MISSING DOM ELEMENT GUARD ────────────────────────────────╗
═══════════════════════════════════════════════════════════════════════════ */
const DOM_BTN_CLOSE_SYNC = $('btn-close-sync-key-modal');
// The reference is on the DOM object but let's alias it back safely
Object.defineProperty(DOM, 'btnCloseSyncKeyModal', {
  get: () => $('btn-close-sync-key-modal'),
});

/* ═══════════════════════════════════════════════════════════════════════════
   ╔═ SECTION 32: FIREBASE AUTH STATE LISTENER (Entry Point) ───────────────╗
═══════════════════════════════════════════════════════════════════════════ */
async function main() {
  ThemeEngine.init();
  bindEventListeners();

  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await bootApp(user);
      } catch (err) {
        console.error('Boot error:', err);
        showToast('error', 'Startup Error', err.message);
      } finally {
        DOM.loadingOverlay.classList.add('hidden');
      }
    } else {
      showAuthView();
    }
  });
}

main();
