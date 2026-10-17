// =============================================================================
// OurNest — money, plans, places and little moments for two.
// Plain JavaScript + Firebase. Edit freely in VS Code.
//
// Sections (search for the ==== lines):
//   SETTINGS · FIREBASE · STATE · HELPERS · ICONS · DATA · PHOTOS · LOCATION
//   REMINDERS · RENDER · HOME · MONEY · PLAN · CHAT · MOMENTS · PLACES · SETTINGS VIEW
//   SHEETS · VIEWERS · ACTIONS · FORMS · WIRING
// =============================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, getDocFromServer, writeBatch,
  query, where, orderBy, limit, Timestamp, arrayUnion, arrayRemove, increment,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// ==== SETTINGS ===============================================================
// Things you may want to change.

const EXPENSE_CATS = [
  { name: 'Food', emoji: '🍔', color: '#F59E0B' },
  { name: 'Groceries', emoji: '🛒', color: '#10B981' },
  { name: 'Transport', emoji: '🚌', color: '#3B82F6' },
  { name: 'Bills', emoji: '🧾', color: '#6366F1' },
  { name: 'Shopping', emoji: '🛍️', color: '#EC4899' },
  { name: 'Health', emoji: '💊', color: '#EF4444' },
  { name: 'Date night', emoji: '💕', color: '#F2789F' },
  { name: 'Home', emoji: '🏠', color: '#14B8A6' },
  { name: 'Family', emoji: '👨‍👩‍👧', color: '#0EA5E9' },
  { name: 'Others', emoji: '📦', color: '#94A3B8' },
];
const INCOME_CATS = [
  { name: 'Salary', emoji: '💼', color: '#16A34A' },
  { name: 'Freelance', emoji: '💻', color: '#0EA5E9' },
  { name: 'Business', emoji: '🏪', color: '#8B5CF6' },
  { name: 'Gift', emoji: '🎁', color: '#F2789F' },
  { name: 'Others', emoji: '✨', color: '#94A3B8' },
];
const MOODS = ['😊', '😍', '🥰', '😴', '😔', '😤', '🤒', '🍔', '💼', '🏠', '🎉', '🙏'];
const GOAL_EMOJIS = ['🎯', '🏠', '✈️', '💍', '🚗', '📱', '🎓', '👶', '🐶', '💰', '🏖️', '🛡️'];
const CHECKINS = [['🏠', 'Home safe'], ['🏢', 'At work'], ['🚗', 'On my way'], ['✅', 'Arrived'], ['🍽️', 'Eating']];
const LISTS = [['Groceries', '🛒'], ['To-do', '✅']];
const CURRENCIES = ['₱', '$', '€', '¥', '£', '₩', 'S$', 'A$'];
const STORY_BGS = ['#3B82F6', '#F2789F', '#14B8A6', '#8B5CF6', '#F59E0B', '#1E293B'];
const REMIND_OPTIONS = [[-1, 'No reminder'], [0, 'At the time'], [15, '15 min before'], [60, '1 hour before'], [1440, '1 day before']];
const DEFAULT_MAP_CENTER = [14.5995, 120.9842]; // Manila
const STORY_HOURS = 24;
const COLORS = { me: '#3B82F6', partner: '#F2789F', shared: '#14B8A6', income: '#16A34A', expense: '#E11D48', warn: '#F59E0B', primary: '#3B82F6' };

// ==== FIREBASE ===============================================================

const configured = !!(firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE'));
let auth = null;
let db = null;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    // Keeps a full copy of your data on the phone so the app works offline.
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    console.warn('Offline cache unavailable, using memory cache', e);
    db = getFirestore(app);
  }
}

// ==== STATE ==================================================================

// Per-phone preferences (saved in this browser only)
const PREFS_KEY = 'ournest.prefs';
const prefs = Object.assign({ theme: 'auto', homeMoney: 'card', notify: false }, loadPrefs());
function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } }
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }

const S = {
  booting: true,
  user: null,
  me: null,
  partner: null,
  couple: null,
  coupleReady: false,
  tab: 'home',
  moneyTab: 'overview',
  who: 'all',
  month: firstOfMonth(new Date()),
  planTab: 'calendar',
  calMonth: firstOfMonth(new Date()),
  calDay: startOfDay(new Date()),
  listName: 'Groceries',
  mood: '',
  authMode: 'signin',
  postPhoto: null, // photo waiting to be posted (data URL)
  txns: [], homeTxns: [], trendTxns: [], budgets: [], goals: [], bills: [], posts: [], items: [], locs: {},
  sharedEvents: [], myEvents: [], events: [], messages: [], stories: [],
  loaded: {},
  ver: {},
};

let pendingName = null;
let createdCoupleId = null;
let listeningCid = null;
let partnerId = null;
let userUnsub = null, coupleUnsub = null, partnerUnsub = null, txnUnsub = null, trendUnsub = null;
let dataUnsubs = [];
let resubTimer = null;
let askResolve = null;
let deferredInstall = null;
let bootHandled = false;

// ==== HELPERS ================================================================

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v instanceof Date ? v : typeof v === 'number' ? new Date(v) : new Date());
const warn = (e) => console.warn(e);

function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function sameDay(a, b) { return sameMonth(a, b) && a.getDate() === b.getDate(); }
function dateInputValue(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function timeInputValue(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function parseDateInput(s) {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  const now = new Date();
  if (y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate()) return now;
  return new Date(y, m - 1, d, 12, 0, 0);
}
function parseDateTime(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}
function parseAmount(s) { const v = parseFloat(String(s ?? '').replace(/,/g, '').trim()); return isFinite(v) ? v : null; }
function fmtDate(d, opts) { return d.toLocaleDateString('en-PH', opts); }
function fmtTime(d) { return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }); }
function timeAgo(d) {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d, { month: 'short', day: 'numeric' });
}
function dayLabel(d) {
  const diff = daysBetween(d, new Date());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' });
}
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
function distM(a, b) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const nf = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cur = () => S.couple?.currency || '₱';
function money(v) { const n = num(v); return (n < 0 ? '−' : '') + cur() + nf.format(Math.abs(n)); }
function moneyShort(v) {
  const n = num(v), a = Math.abs(n);
  const s = a >= 1e6 ? (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    : a >= 1e3 ? (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
    : String(Math.round(a));
  return (n < 0 ? '−' : '') + cur() + s;
}

const catOf = (name, income = false) => {
  const list = income ? INCOME_CATS : EXPENSE_CATS;
  return list.find((c) => c.name === name) || list[list.length - 1];
};

// People
const uid = () => S.user?.uid;
const isMine = (owner) => owner === S.user?.uid;
const myName = () => S.me?.name || 'You';
const partnerName = () => S.partner?.name || 'Partner';
const hasPartner = () => !!S.partner;
const nameOf = (owner) => (isMine(owner) ? 'You' : partnerName());
const colorOf = (owner) => (isMine(owner) ? COLORS.me : COLORS.partner);

// Who filter: all / mine / partner / shared
function whoMatch(shared, owner) {
  switch (S.who) {
    case 'mine': return !shared && isMine(owner);
    case 'partner': return !shared && !isMine(owner);
    case 'shared': return !!shared;
    default: return true;
  }
}

// ==== ICONS ==================================================================

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  map: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  comment: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  nav: '<path d="M3 11 21 3l-8 18-2-8z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
};
function icon(name, size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
const LOGO = `<div class="logo"><svg width="40" height="40" viewBox="0 0 24 24" fill="#fff"><path d="M12 21s-8-5.1-8-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 15.9 12 21 12 21z"/></svg></div>`;

const tag = (text, color) => `<span class="tag" style="--c:${color}">${esc(text)}</span>`;
const avatar = (name, color, size = 40) => {
  const letter = (String(name || '?').trim().charAt(0) || '?').toUpperCase();
  return `<span class="avatar" style="--c:${color};--s:${size}px">${esc(letter)}</span>`;
};
const ownerTag = (shared, owner) => (shared ? tag('Shared', COLORS.shared) : tag(nameOf(owner), colorOf(owner)));
const empty = (emoji, text) => `<div class="empty"><div class="bubble">${emoji}</div>${esc(text).replace(/\n/g, '<br>')}</div>`;
const photoImg = (id, cls = 'photo', tap = true) => `<img class="${cls} loading" data-photo="${esc(id)}" alt=""${tap ? ` data-action="view-photo" data-id="${esc(id)}"` : ''}>`;

// ==== DATA ===================================================================
// Writes are fire-and-forget: saved on the phone first, synced when online.

const col = (name) => collection(db, 'couples', S.couple.id, name);
function save(name, data, id) {
  const ref = id ? doc(col(name), id) : doc(col(name));
  setDoc(ref, data, { merge: true }).catch(warn);
  return ref.id;
}
function patch(name, id, data) { updateDoc(doc(col(name), id), data).catch(warn); }
function remove(name, id) { deleteDoc(doc(col(name), id)).catch(warn); }

// ---- auth & profile

function startAuth() {
  onAuthStateChanged(auth, (user) => {
    S.user = user;
    if (userUnsub) { userUnsub(); userUnsub = null; }
    stopCouple();
    S.me = null;
    if (!user) { S.booting = false; render(); return; }

    S.booting = true;
    render();
    const ref = doc(db, 'users', user.uid);
    userUnsub = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
      if (!snap.exists()) {
        if (snap.metadata.fromCache) return; // wait for the server's answer
        setDoc(ref, {
          name: pendingName || user.displayName || (user.email || 'me').split('@')[0],
          email: user.email || '',
          createdAt: Timestamp.now(),
          shareLocation: false,
        }).catch(warn);
        pendingName = null;
        return;
      }
      S.me = { uid: snap.id, ...snap.data() };
      const cid = S.me.coupleId || null;
      if (cid !== listeningCid) {
        // When joining, wait until the server has confirmed we're a member.
        const ready = !cid || !snap.metadata.hasPendingWrites || cid === createdCoupleId;
        if (ready) listenCouple(cid);
      }
      S.booting = false;
      syncTracking();
      render();
    }, (err) => { warn(err); S.booting = false; render(); });
  });
}

function authError(e) {
  switch (e?.code) {
    case 'auth/invalid-email': return 'That email address looks wrong.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials': return 'Email or password is incorrect.';
    case 'auth/email-already-in-use': return 'This email already has an account. Try signing in.';
    case 'auth/weak-password': return 'Use at least 6 characters for the password.';
    case 'auth/network-request-failed': return 'No internet. Signing in needs to be online once.';
    case 'auth/too-many-requests': return 'Too many tries. Please wait a moment.';
    case 'auth/unauthorized-domain': return 'This website address is not allowed yet. Add it in Firebase → Authentication → Settings → Authorized domains.';
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/invalid-api-key': return 'The Firebase API key looks wrong. Copy it again into firebase-config.js.';
    default: return e?.message || 'Something went wrong.';
  }
}

// ---- couple space

function stopCouple() {
  coupleUnsub?.(); partnerUnsub?.(); txnUnsub?.(); trendUnsub?.();
  dataUnsubs.forEach((u) => u());
  coupleUnsub = partnerUnsub = txnUnsub = trendUnsub = null;
  dataUnsubs = [];
  listeningCid = null;
  partnerId = null;
  S.couple = null;
  S.partner = null;
  S.coupleReady = false;
  Object.assign(S, {
    txns: [], homeTxns: [], trendTxns: [], budgets: [], goals: [], bills: [], posts: [], items: [], locs: {},
    sharedEvents: [], myEvents: [], events: [], messages: [], stories: [], loaded: {},
  });
  stopTracking();
}

function listenCouple(cid) {
  stopCouple();
  listeningCid = cid;
  if (!cid) return;
  coupleUnsub = onSnapshot(doc(db, 'couples', cid), (snap) => {
    if (!snap.exists()) return;
    S.couple = { id: snap.id, ...snap.data() };
    const pid = (S.couple.members || []).find((m) => m !== uid()) || null;
    if (pid !== partnerId) listenPartner(pid);
    if (!S.coupleReady) {
      S.coupleReady = true;
      subscribeData();
      syncTracking();
    }
    render();
  }, (err) => {
    warn(err);
    stopCouple();
    render();
    // Not allowed (yet) — retry shortly, e.g. right after pairing.
    setTimeout(() => { if (S.me?.coupleId === cid && listeningCid === null) listenCouple(cid); }, 3000);
  });
}

function listenPartner(pid) {
  partnerUnsub?.();
  partnerUnsub = null;
  partnerId = pid;
  S.partner = null;
  if (!pid) return;
  partnerUnsub = onSnapshot(doc(db, 'users', pid), (snap) => {
    S.partner = snap.exists() ? { uid: snap.id, ...snap.data() } : null;
    render();
  }, warn);
}

function scheduleResub() {
  if (resubTimer) return;
  resubTimer = setTimeout(() => { resubTimer = null; if (S.coupleReady) subscribeData(); }, 3000);
}

const mapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const mapTxns = (snap) => snap.docs.map((d) => {
  const x = d.data();
  return { id: d.id, ...x, amount: num(x.amount), date: toDate(x.date), isIncome: x.type === 'income' };
});
const mapEvents = (snap) => snap.docs.map((d) => {
  const x = d.data();
  return {
    id: d.id, ...x,
    date: toDate(x.date),
    remind: x.remind == null ? -1 : num(x.remind),
    notifiedAt: x.notifiedAt ? toDate(x.notifiedAt) : null,
    snoozeUntil: x.snoozeUntil ? toDate(x.snoozeUntil) : null,
  };
});
function rangeQuery(from, to) {
  return query(col('transactions'),
    where('date', '>=', Timestamp.fromDate(from)),
    where('date', '<', Timestamp.fromDate(to)),
    orderBy('date', 'desc'));
}
const monthQuery = (m) => rangeQuery(m, new Date(m.getFullYear(), m.getMonth() + 1, 1));

function watch(q, key, map, after) {
  dataUnsubs.push(onSnapshot(q, (snap) => {
    S[key] = map(snap);
    S.loaded[key] = true;
    S.ver[key] = (S.ver[key] || 0) + 1;
    after?.();
    render();
  }, (e) => { warn(e); scheduleResub(); }));
}

function mergeEvents() {
  const byId = new Map();
  [...S.sharedEvents, ...S.myEvents].forEach((e) => byId.set(e.id, e));
  S.events = [...byId.values()].sort((a, b) => a.date - b.date);
  S.loaded.events = !!(S.loaded.sharedEvents && S.loaded.myEvents);
  S.ver.events = (S.ver.events || 0) + 1;
  if (S.loaded.events) setTimeout(checkReminders, 300);
}

function subscribeData() {
  dataUnsubs.forEach((u) => u());
  dataUnsubs = [];
  watch(monthQuery(firstOfMonth(new Date())), 'homeTxns', mapTxns);
  watch(col('budgets'), 'budgets', (s) => mapDocs(s).map((b) => ({ ...b, limit: num(b.limit) })).sort((a, b) => String(a.category).localeCompare(b.category)));
  watch(col('goals'), 'goals', (s) => mapDocs(s).map((g) => ({ ...g, target: num(g.target), saved: num(g.saved) })));
  watch(col('bills'), 'bills', (s) => mapDocs(s).map((b) => ({ ...b, amount: num(b.amount), dueDay: num(b.dueDay) || 1, paidMonths: b.paidMonths || [] })).sort((a, b) => a.dueDay - b.dueDay));
  watch(query(col('updates'), orderBy('createdAt', 'desc'), limit(80)), 'posts',
    (s) => mapDocs(s).map((p) => ({ ...p, createdAt: toDate(p.createdAt), hearts: p.hearts || [], comments: p.comments || [] })));
  watch(query(col('items'), orderBy('createdAt')), 'items', mapDocs);
  watch(col('locations'), 'locs', (s) => {
    const o = {};
    s.docs.forEach((d) => { const x = d.data(); o[d.id] = { ...x, lat: num(x.lat), lng: num(x.lng), updatedAt: toDate(x.updatedAt) }; });
    return o;
  });
  // Calendar: "together" events + my own (private ones stay private).
  watch(query(col('events'), where('private', '==', false)), 'sharedEvents', mapEvents, mergeEvents);
  watch(query(col('events'), where('createdBy', '==', uid())), 'myEvents', mapEvents, mergeEvents);
  watch(query(col('messages'), orderBy('createdAt', 'desc'), limit(300)), 'messages',
    (s) => mapDocs(s).map((m) => ({ ...m, createdAt: toDate(m.createdAt), seenBy: m.seenBy || [] })).reverse(), onMessages);
  watch(query(col('stories'), orderBy('createdAt', 'desc'), limit(40)), 'stories',
    (s) => mapDocs(s).map((x) => ({ ...x, createdAt: toDate(x.createdAt), seenBy: x.seenBy || [] })));
  subscribeTxns();
}

function subscribeTxns() {
  txnUnsub?.();
  trendUnsub?.();
  S.loaded.txns = false;
  S.loaded.trendTxns = false;
  const onErr = (e) => { warn(e); scheduleResub(); };
  txnUnsub = onSnapshot(monthQuery(S.month), (snap) => {
    S.txns = mapTxns(snap); S.loaded.txns = true; render();
  }, onErr);
  const from = new Date(S.month.getFullYear(), S.month.getMonth() - 5, 1);
  const to = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1);
  trendUnsub = onSnapshot(rangeQuery(from, to), (snap) => {
    S.trendTxns = mapTxns(snap); S.loaded.trendTxns = true; render();
  }, onErr);
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode() {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return [...a].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
}

function createCouple() {
  const code = randomCode();
  const cRef = doc(collection(db, 'couples'));
  createdCoupleId = cRef.id;
  const b = writeBatch(db);
  b.set(cRef, { members: [uid()], inviteCode: code, currency: '₱', createdAt: Timestamp.now() });
  b.set(doc(db, 'inviteCodes', code), { coupleId: cRef.id, createdBy: uid() });
  b.update(doc(db, 'users', uid()), { coupleId: cRef.id });
  b.commit().catch(warn);
}

async function joinCouple(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (code.length !== 6) return 'Invite codes have 6 characters.';
  try {
    const snap = await withTimeout(getDocFromServer(doc(db, 'inviteCodes', code)), 15000);
    if (!snap.exists()) return 'Code not found. Double-check it with your partner.';
    const cid = snap.data().coupleId;
    const b = writeBatch(db);
    b.update(doc(db, 'couples', cid), { members: arrayUnion(uid()) });
    b.update(doc(db, 'users', uid()), { coupleId: cid });
    await withTimeout(b.commit(), 15000);
    return null;
  } catch (e) {
    if (e?.message === 'timeout' || e?.code === 'unavailable') return 'No internet connection. Pairing needs to be online.';
    if (e?.code === 'permission-denied') return 'This space already has two members.';
    return e?.message || 'Could not join.';
  }
}

// ==== PHOTOS =================================================================
// Photos are shrunk on the phone and stored in Firestore (works on the free plan).

const photoCache = new Map();
const photoLoading = new Set();

async function compressImage(file, maxSide = 1280, maxChars = 650000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that picture.'));
      i.src = url;
    });
    let scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    let quality = 0.8;
    let data = '';
    for (let attempt = 0; attempt < 7; attempt++) {
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      data = c.toDataURL('image/jpeg', quality);
      if (data.length <= maxChars) break;
      quality = Math.max(0.5, quality - 0.1);
      scale *= 0.85;
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function savePhoto(dataUrl) {
  const ref = doc(col('photos'));
  photoCache.set(ref.id, dataUrl);
  setDoc(ref, { data: dataUrl, by: uid(), createdAt: Timestamp.now() }).catch(warn);
  return ref.id;
}

function hydratePhotos() {
  $$('img[data-photo]').forEach((img) => {
    const id = img.dataset.photo;
    if (!id || img.dataset.loaded) return;
    const cached = photoCache.get(id);
    if (cached) {
      img.src = cached;
      img.dataset.loaded = '1';
      img.classList.remove('loading');
      return;
    }
    if (photoLoading.has(id) || !S.coupleReady) return;
    photoLoading.add(id);
    getDoc(doc(col('photos'), id)).then((snap) => {
      photoLoading.delete(id);
      if (snap.exists()) { photoCache.set(id, snap.data().data); hydratePhotos(); }
    }).catch((e) => { photoLoading.delete(id); warn(e); });
  });
}

async function pickPhoto(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) { toast('Please choose a picture.'); return null; }
  try { return await compressImage(file); } catch (e) { toast(e.message || 'Could not read that picture.'); return null; }
}

// ==== LOCATION ===============================================================

let watchId = null;
let lastSent = null;

function getPosition() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  });
}

async function pushPosition(pos) {
  if (!S.coupleReady || !uid()) return;
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  lastSent = { lat, lng, t: Date.now() };
  let battery = null;
  try {
    if (navigator.getBattery) battery = Math.round((await navigator.getBattery()).level * 100);
  } catch { /* not supported */ }
  setDoc(doc(col('locations'), uid()), {
    lat, lng, accuracy, battery,
    sharing: !!S.me?.shareLocation,
    updatedAt: Timestamp.now(),
  }, { merge: true }).catch(warn);
}

function onWatch(pos) {
  const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  // Send when moved 50 m or every 2 minutes.
  if (lastSent && distM(lastSent, p) < 50 && Date.now() - lastSent.t < 120000) return;
  pushPosition(pos);
}

function syncTracking() {
  const want = !!S.me?.shareLocation && S.coupleReady && 'geolocation' in navigator;
  if (want && watchId === null) {
    watchId = navigator.geolocation.watchPosition(onWatch, warn, { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 });
  } else if (!want) {
    stopTracking();
  }
}
function stopTracking() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
}

async function setSharing(on) {
  if (on) {
    const pos = await getPosition();
    if (!pos) { toast('Please turn on location and allow it for this site.'); render(); return; }
    updateDoc(doc(db, 'users', uid()), { shareLocation: true }).catch(warn);
    S.me = { ...S.me, shareLocation: true };
    await pushPosition(pos);
    toast(`Sharing your location with ${partnerName()} 💙`);
  } else {
    updateDoc(doc(db, 'users', uid()), { shareLocation: false }).catch(warn);
    setDoc(doc(col('locations'), uid()), { sharing: false, updatedAt: Timestamp.now() }, { merge: true }).catch(warn);
    S.me = { ...S.me, shareLocation: false };
  }
  syncTracking();
  render();
}

// ==== REMINDERS & NOTIFICATIONS ==============================================
// Reminders only go to the person who created the to-do / event.

async function notify(title, body, tagName) {
  if (!prefs.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag: tagName, icon: './icons/icon-192.png', badge: './icons/icon-192.png' };
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (e) { warn(e); }
}

async function enableNotifications(on) {
  if (!on) { prefs.notify = false; savePrefs(); render(); return; }
  if (!('Notification' in window)) {
    toast('This browser does not support notifications. On iPhone, add OurNest to the Home Screen first.');
    render();
    return;
  }
  const p = await Notification.requestPermission();
  prefs.notify = p === 'granted';
  savePrefs();
  toast(prefs.notify ? 'Notifications on 🔔' : 'Notifications were blocked. You can allow them in your browser settings.');
  if (prefs.notify) notify('OurNest', 'Notifications are working 💙', 'test');
  render();
}

function remindAt(e) {
  if (e.snoozeUntil) return e.snoozeUntil;
  if (e.remind == null || e.remind < 0) return null;
  const base = e.allDay ? new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate(), 8, 0) : e.date;
  return new Date(base.getTime() - e.remind * 60000);
}

function eventWhen(e) {
  const day = dayLabel(e.date);
  return e.allDay ? `${day} · all day` : `${day} · ${fmtTime(e.date)}`;
}

let reminderQueue = [];
function checkReminders() {
  if (!S.coupleReady || !S.loaded.events) return;
  const now = Date.now();
  const due = S.events.filter((e) => e.createdBy === uid() && !e.done && !e.notifiedAt && remindAt(e) && remindAt(e).getTime() <= now);
  if (!due.length) return;
  for (const e of due) {
    e.notifiedAt = new Date();
    patch('events', e.id, { notifiedAt: Timestamp.now() });
    notify(e.kind === 'todo' ? '✅ To-do reminder' : '📅 Coming up', `${e.title} · ${eventWhen(e)}`, `ev-${e.id}`);
  }
  reminderQueue.push(...due.map((e) => e.id));
  showReminderPopup();
}

function showReminderPopup() {
  if (!reminderQueue.length || !$('#modal').hidden || !$('#viewer').hidden) return;
  const ids = [...new Set(reminderQueue)];
  reminderQueue = [];
  const list = ids.map((id) => S.events.find((e) => e.id === id)).filter(Boolean);
  if (!list.length) return;
  const missed = list.some((e) => Date.now() - remindAt(e)?.getTime() > 10 * 60000);
  openSheet(`<div class="sheet-head"><h3>${missed ? '⏰ You may have missed these' : '⏰ Don\'t forget'}</h3></div>
    <div class="card flush" style="box-shadow:none;background:var(--card-2)">
      ${list.map((e) => `<div class="row" style="flex-wrap:wrap">
        <span class="kind-ic" style="--c:${e.private ? COLORS.me : COLORS.shared}">${e.kind === 'todo' ? '✅' : '📅'}</span>
        <span class="grow"><b>${esc(e.title)}</b><div class="tiny muted">${esc(eventWhen(e))}</div></span>
        <span class="hstack" style="gap:6px">
          <button class="btn sm" data-action="snooze" data-id="${e.id}">Snooze 1h</button>
          <button class="btn sm primary" data-action="event-done" data-id="${e.id}">Done</button>
        </span></div>`).join('')}
    </div>
    <button class="btn block" data-action="close-modal" style="margin-top:14px">OK</button>`);
}

// ---- new chat messages
let lastMsgTime = null;
function onMessages() {
  const theirs = S.messages.filter((m) => !isMine(m.from));
  const newest = theirs.length ? theirs[theirs.length - 1].createdAt.getTime() : 0;
  if (lastMsgTime === null) { lastMsgTime = newest; return; } // first load: no alerts
  const fresh = theirs.filter((m) => m.createdAt.getTime() > lastMsgTime);
  lastMsgTime = Math.max(lastMsgTime, newest);
  if (!fresh.length) return;
  const last = fresh[fresh.length - 1];
  const text = last.photoId ? '📷 Photo' : last.text;
  const watching = S.tab === 'chat' && !document.hidden;
  if (!watching) {
    notify(`💬 ${partnerName()}`, text, 'chat');
    if (!document.hidden) toast(`💬 ${partnerName()}: ${String(text).slice(0, 60)}`);
  }
}

function markChatSeen() {
  if (S.tab !== 'chat' || document.hidden || !S.coupleReady) return;
  const unseen = S.messages.filter((m) => !isMine(m.from) && !m.seenBy.includes(uid()));
  if (!unseen.length) return;
  const b = writeBatch(db);
  unseen.slice(-50).forEach((m) => { m.seenBy.push(uid()); b.update(doc(col('messages'), m.id), { seenBy: arrayUnion(uid()) }); });
  b.commit().catch(warn);
}
const unreadCount = () => S.messages.filter((m) => !isMine(m.from) && !m.seenBy.includes(uid())).length;

// ==== RENDER =================================================================

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderNow(); });
}

function screenName() {
  if (!configured) return 'setup';
  if (S.booting) return 'splash';
  if (!S.user) return 'auth';
  if (!S.me) return 'splash';
  if (!S.me.coupleId) return 'pair';
  if (!S.coupleReady) return 'splash';
  return 'app';
}

function renderNow(force = false) {
  const root = $('#root');
  const screen = screenName();
  const key = screen === 'auth' ? `auth:${S.authMode}` : screen;
  if (screen !== 'app') {
    if (force || root.dataset.screen !== key) {
      root.innerHTML = { setup: setupView, splash: splashView, auth: authView, pair: pairView }[screen]();
      root.dataset.screen = key;
    }
    return;
  }
  if (root.dataset.screen !== 'app') {
    resetMap();
    root.innerHTML = appShell();
    root.dataset.screen = 'app';
    handleBootLink();
  }
  renderTab();
}

function setupView() {
  return `<div class="center-screen">${LOGO}<div class="brand">OurNest</div>
    <div class="card" style="margin-top:20px"><b>Almost there!</b>
    <p class="muted" style="margin-top:6px">Open <b>firebase-config.js</b> and paste your Firebase web config
    (see README step 2), then reload this page.</p></div></div>`;
}
function splashView() {
  return `<div class="center-screen">${LOGO}<div class="brand">OurNest</div><div class="spinner"></div></div>`;
}

function authView() {
  const up = S.authMode === 'signup';
  return `<div class="center-screen">
    ${LOGO}
    <div class="brand">OurNest</div>
    <p class="tagline">Money, plans, places and little moments — together.</p>
    <form class="card" data-form="auth" style="padding:20px">
      <h3 style="margin-bottom:16px">${up ? 'Create your account' : 'Welcome back'}</h3>
      ${up ? `<label class="field"><span>Your name</span><input name="name" autocomplete="name" required></label>` : ''}
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input type="password" name="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required></label>
      ${up ? '' : `<div class="right"><button type="button" class="btn link" data-action="forgot">Forgot password?</button></div>`}
      <button class="btn primary block" type="submit" style="margin-top:8px">${up ? 'Sign up' : 'Sign in'}</button>
    </form>
    <div class="center"><button class="btn link" data-action="auth-mode">${up ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></div>
  </div>`;
}

function pairView() {
  return `<div class="page" style="padding-top:28px">
    <div class="page-head"><h1>Set up OurNest</h1><button class="btn link" data-action="signout">Sign out</button></div>
    <h2 style="font-size:21px">Hi ${esc(myName())}! 👋</h2>
    <p class="muted" style="margin:6px 0 18px">OurNest is a private space for the two of you. One of you creates it, then the other joins with the invite code.</p>
    <div class="card" style="padding:20px">
      <h3>🏠 Create our space</h3>
      <p class="muted small" style="margin:6px 0 14px">You'll get a 6-letter code to send to your partner (find it later in Settings).</p>
      <button class="btn primary block" data-action="create-couple">${icon('plus', 20)} Create</button>
    </div>
    <div class="or">or</div>
    <form class="card" data-form="join" style="padding:20px">
      <h3 style="margin-bottom:14px">💕 Join my partner's space</h3>
      <input name="code" class="code-input" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" required>
      <button class="btn block" type="submit" style="margin-top:12px">Join</button>
    </form>
  </div>`;
}

const NAV = [
  ['home', 'home', 'Home'],
  ['money', 'wallet', 'Money'],
  ['plan', 'calendar', 'Plan'],
  ['chat', 'chat', 'Chat'],
  ['moments', 'sparkle', 'Moments'],
  ['map', 'map', 'Places'],
];
function appShell() {
  return `<main id="view"></main>
    <div id="mapWrap" hidden><div id="map"></div><div id="mapTop"></div><div id="mapPanel"></div></div>
    <div id="fabSlot"></div>
    <nav class="nav"><div class="nav-inner">
      ${NAV.map(([t, ic, label]) => `<button data-action="tab" data-tab="${t}"><span class="ic">${icon(ic)}</span>${label}<span class="badge" data-badge="${t}" hidden></span></button>`).join('')}
    </div></nav>`;
}

function goTab(tab) {
  S.tab = tab;
  window.scrollTo(0, 0);
  renderTab();
}

function renderTab() {
  $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab || (S.tab === 'settings' && b.dataset.tab === 'home')));
  const unread = unreadCount();
  const badge = $('[data-badge=chat]');
  if (badge) { badge.hidden = unread === 0; badge.textContent = unread > 9 ? '9+' : String(unread); }

  const view = $('#view');
  const isMap = S.tab === 'map';
  view.hidden = isMap;
  $('#mapWrap').hidden = !isMap;

  const fab = (S.tab === 'money') || (S.tab === 'plan' && S.planTab === 'calendar');
  $('#fabSlot').innerHTML = fab ? `<button class="fab" data-action="fab" aria-label="Add">${icon('plus', 28)}</button>` : '';

  if (isMap) { renderMap(); return; }

  const key = S.tab === 'plan' ? `plan:${S.planTab}:${S.listName}` : S.tab;
  const keyChanged = view.dataset.key !== key;

  switch (S.tab) {
    case 'home': view.innerHTML = homeView(); break;
    case 'money': view.innerHTML = moneyView(); break;
    case 'settings': view.innerHTML = settingsView(); break;
    case 'plan':
      if (S.planTab === 'lists') {
        if (keyChanged) view.innerHTML = planHeader() + listsShell();
        $('#listItems').innerHTML = listItemsHtml();
      } else {
        view.innerHTML = planHeader() + calendarHtml();
      }
      break;
    case 'chat': {
      if (keyChanged) view.innerHTML = chatShell();
      $('#chatHead').innerHTML = chatHeadHtml();
      const sig = `${S.ver.messages}|${S.partner?.name}|${S.me?.name}|${S.loaded.messages}`;
      const box = $('#msgs');
      if (keyChanged || box.dataset.sig !== sig) {
        const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
        box.innerHTML = messagesHtml();
        box.dataset.sig = sig;
        if (keyChanged || nearBottom) requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
      }
      markChatSeen();
      break;
    }
    case 'moments': {
      if (keyChanged) view.innerHTML = momentsShell();
      const sig = `${S.ver.posts}|${S.ver.stories}|${S.partner?.name}|${S.me?.name}`;
      const feed = $('#feed');
      if (keyChanged || feed.dataset.sig !== sig) {
        $('#stories').innerHTML = storiesBarHtml();
        feed.innerHTML = feedHtml();
        feed.dataset.sig = sig;
      }
      break;
    }
  }
  view.dataset.key = key;
  hydratePhotos();
}

// ==== HOME ===================================================================

function sumTxns(list) {
  const t = { income: 0, expense: 0, mine: 0, theirs: 0, shared: 0, byCat: {} };
  for (const x of list) {
    if (x.isIncome) { t.income += x.amount; continue; }
    t.expense += x.amount;
    t.byCat[x.category] = (t.byCat[x.category] || 0) + x.amount;
    if (x.shared) t.shared += x.amount;
    else if (isMine(x.ownerUid)) t.mine += x.amount;
    else t.theirs += x.amount;
  }
  return t;
}

function dueIn(bill, month) {
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return new Date(month.getFullYear(), month.getMonth(), Math.min(Math.max(bill.dueDay, 1), last));
}
const isPaid = (bill, month) => (bill.paidMonths || []).includes(monthKey(month));

function moneyHero(t) {
  const pct = (v) => (t.expense > 0 ? (v / t.expense) * 100 : 0);
  return `<div class="hero">
      <div class="lite">This month together</div>
      <div class="big">${money(t.income - t.expense)}</div>
      <div class="lite">left after expenses</div>
      <div class="hero-pills">
        <div class="hero-pill"><span class="lite">↙ Income</span><b>${money(t.income)}</b></div>
        <div class="hero-pill"><span class="lite">↗ Spent</span><b>${money(t.expense)}</b></div>
      </div>
      ${t.expense > 0 ? `<div class="split">
          <i style="width:${pct(t.mine)}%;background:#BFDBFE"></i>
          <i style="width:${pct(t.theirs)}%;background:${COLORS.partner}"></i>
          <i style="width:${pct(t.shared)}%;background:#5EEAD4"></i>
        </div>
        <div class="legend">
          <span><i class="dot" style="--c:#BFDBFE"></i>You ${moneyShort(t.mine)}</span>
          ${hasPartner() ? `<span><i class="dot" style="--c:${COLORS.partner}"></i>${esc(partnerName())} ${moneyShort(t.theirs)}</span>` : ''}
          <span><i class="dot" style="--c:#5EEAD4"></i>Shared ${moneyShort(t.shared)}</span>
        </div>` : ''}
    </div>`;
}

function locketHtml() {
  // Partner's latest photo moment (like Locket). Falls back to your own.
  const withPhoto = S.stories.filter((s) => s.photoId);
  const pick = withPhoto.find((s) => !isMine(s.authorUid)) || withPhoto[0];
  if (!pick) {
    return `<div class="locket empty-state">
      <div><div style="font-size:42px">📸</div>
      <b style="display:block;margin:6px 0 4px">Share a moment</b>
      <div class="muted small" style="margin-bottom:14px">Snap a photo and it shows up right here on ${hasPartner() ? esc(partnerName()) + "'s" : 'your partner\'s'} home screen.</div>
      <button class="btn primary" data-action="snap">${icon('camera', 18)} Snap a moment</button></div>
    </div>`;
  }
  const who = isMine(pick.authorUid) ? 'You' : partnerName();
  return `<div class="locket">
      ${photoImg(pick.photoId, 'locket-img')}
      <div class="top">
        <span class="pill">${esc(who)} · ${timeAgo(pick.createdAt)}</span>
        <span class="grow"></span>
        <button class="icon-btn" style="background:rgba(0,0,0,.42);color:#fff;width:36px;height:36px" data-action="save-photo" data-id="${esc(pick.photoId)}" aria-label="Save photo">${icon('download', 18)}</button>
      </div>
      <div class="over">
        <div class="grow" style="font-weight:600;text-shadow:0 1px 6px rgba(0,0,0,.5)">${esc(pick.text || '')}</div>
        <button class="snap" data-action="snap" aria-label="Snap a moment">${icon('camera', 22)}</button>
      </div>
    </div>`;
}

function homeView() {
  const now = new Date();
  const t = sumTxns(S.homeTxns);

  const header = `<div class="page-head" style="padding-bottom:16px">
      <div class="grow"><div class="muted">${greeting()},</div><h1 class="ellipsis">${esc(myName())}</h1></div>
      <div class="avatars">${avatar(myName(), COLORS.me, 44)}${hasPartner() ? avatar(partnerName(), COLORS.partner, 44) : ''}</div>
      <button class="icon-btn" data-action="tab" data-tab="settings" aria-label="Settings">${icon('settings')}</button>
    </div>`;

  let moneyPart = '';
  if (prefs.homeMoney === 'card') moneyPart = moneyHero(t);
  if (prefs.homeMoney === 'dashboard') {
    const entries = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
    moneyPart = moneyHero(t) + (entries.length ? `<div class="card tap hstack" style="gap:16px" data-action="goto-overview">
      ${donut(entries, t.expense, 96)}
      <div class="grow"><b>Top spending</b>
        ${entries.slice(0, 4).map(([n, v]) => `<div class="hstack small" style="gap:6px;margin-top:4px">
          <i class="dot" style="--c:${catOf(n).color}"></i><span class="grow ellipsis">${esc(n)}</span><span class="muted">${moneyShort(v)}</span></div>`).join('')}
        <div class="tiny" style="color:var(--primary);margin-top:6px;font-weight:600">Open money overview →</div>
      </div></div>` : '');
  }

  const quick = `<div class="quick">
      <button data-action="new-txn" data-type="expense"><span class="bubble" style="--c:${COLORS.expense}">−</span>Expense</button>
      <button data-action="new-txn" data-type="income"><span class="bubble" style="--c:${COLORS.income}">+</span>Income</button>
      <button data-action="new-event"><span class="bubble" style="--c:${COLORS.primary}">📅</span>Plan</button>
      <button data-action="tab" data-tab="map"><span class="bubble" style="--c:${COLORS.partner}">📍</span>Check in</button>
    </div>`;

  // Coming up (next 7 days)
  const today = startOfDay(now);
  const soon = S.events.filter((e) => !e.done && e.date >= today && daysBetween(today, e.date) <= 7).slice(0, 4);
  const overdue = S.events.filter((e) => e.kind === 'todo' && !e.done && e.date < today).length;
  const upcoming = (soon.length || overdue) ? `<div class="card">
      <div class="hstack" style="margin-bottom:6px"><span>📅</span><b class="grow">Coming up</b>
        <button class="btn link small" data-action="tab" data-tab="plan">See plan</button></div>
      ${overdue ? `<div class="tiny" style="color:${COLORS.expense};margin:2px 0 6px;font-weight:600">${overdue} overdue to-do${overdue > 1 ? 's' : ''}</div>` : ''}
      ${soon.map((e) => `<div class="row tap" style="padding:8px 0;cursor:pointer" data-action="open-day" data-date="${dateInputValue(e.date)}">
          <span class="kind-ic" style="--c:${e.private ? COLORS.me : COLORS.shared}">${e.kind === 'todo' ? '✅' : '📅'}</span>
          <span class="grow"><span class="ellipsis" style="display:block;font-weight:600">${esc(e.title)}</span><span class="tiny muted">${esc(eventWhen(e))}</span></span>
          ${e.private ? tag('Just me', COLORS.me) : tag('Together', COLORS.shared)}</div>`).join('')}
    </div>` : '';

  let partnerCard = '';
  if (hasPartner()) {
    const loc = S.locs[S.partner.uid];
    let status = 'Location not shared yet';
    if (loc && (loc.lat || loc.lng)) {
      status = loc.sharing ? `Location updated ${timeAgo(loc.updatedAt)}` : `Last seen ${timeAgo(loc.updatedAt)} · sharing paused`;
    }
    const batt = loc?.battery != null ? `<div class="tiny" style="color:${loc.battery <= 20 ? COLORS.expense : 'var(--muted)'}">🔋 ${loc.battery}%</div>` : '';
    const last = S.posts.find((p) => p.authorUid === S.partner.uid);
    partnerCard = `<div class="card tap" data-action="tab" data-tab="map">
        <div class="hstack">
          ${avatar(partnerName(), COLORS.partner)}
          <div class="grow"><b>${esc(partnerName())}</b><div class="muted small">${esc(status)}</div>${batt}</div>
          <span class="muted">${icon('right', 20)}</span>
        </div>
        ${last ? `<div class="inset ellipsis" style="margin-top:12px">
          ${esc(last.mood || '💬')} ${esc(last.text || (last.photoId ? 'Shared a photo' : 'Checked in'))} <span class="muted small">· ${timeAgo(last.createdAt)}</span></div>` : ''}
      </div>`;
  }

  const due = S.bills.filter((b) => !isPaid(b, now) && daysBetween(today, dueIn(b, now)) <= 7);
  const billsCard = due.length === 0 ? '' : `<div class="card tap" data-action="goto-bills">
      <div class="hstack" style="margin-bottom:6px"><span>🔔</span><b>Bills due soon</b></div>
      ${due.map((b) => {
        const d = daysBetween(today, dueIn(b, now));
        const label = d < 0 ? 'overdue' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
        return `<div class="hstack" style="padding:4px 0"><span class="grow ellipsis">${esc(b.title)}</span>
          <span class="tiny" style="color:${d < 0 ? COLORS.expense : 'var(--muted)'}">${label}</span>
          <b>${money(b.amount)}</b></div>`;
      }).join('')}
    </div>`;

  let together = '';
  if (S.couple?.anniversary) {
    const start = toDate(S.couple.anniversary);
    const days = daysBetween(start, today);
    let next = new Date(today.getFullYear(), start.getMonth(), start.getDate());
    if (next < today) next = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate());
    const until = daysBetween(today, next);
    together = `<div class="card hstack"><div style="font-size:30px">💙</div>
      <div class="grow"><b style="font-size:16px">${days.toLocaleString()} days together</b>
      <div class="muted small">${until === 0 ? 'Happy anniversary today! 🎉' : `${until} days until your anniversary`}</div></div></div>`;
  }

  return `<div class="page">${header}${locketHtml()}${moneyPart}${quick}${upcoming}${partnerCard}${billsCard}${together}</div>`;
}

// ==== MONEY ==================================================================

function moneyView() {
  const whoChips = [
    ['all', 'All', COLORS.primary],
    ['mine', 'You', COLORS.me],
    ...(hasPartner() ? [['partner', partnerName(), COLORS.partner]] : []),
    ['shared', 'Shared', COLORS.shared],
  ].map(([k, label, c]) => `<button class="chip ${S.who === k ? 'on' : ''}" style="--c:${c}" data-action="who" data-who="${k}">${esc(label)}</button>`).join('');

  const tabs = [['overview', 'Overview'], ['activity', 'Activity'], ['budgets', 'Budgets'], ['goals', 'Goals'], ['bills', 'Bills']]
    .map(([k, l]) => `<button class="${S.moneyTab === k ? 'on' : ''}" data-action="money-tab" data-mtab="${k}">${l}</button>`).join('');

  const body = { overview: overviewHtml, activity: activityHtml, budgets: budgetsHtml, goals: goalsHtml, bills: billsHtml }[S.moneyTab]();

  return `<div class="page">
    <div class="page-head"><h1>Money</h1></div>
    <div class="seg">${tabs}</div>
    <div class="month-bar">
      <button class="icon-btn" data-action="month" data-delta="-1" aria-label="Previous month">${icon('left')}</button>
      <h2>${fmtDate(S.month, { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" data-action="month" data-delta="1" aria-label="Next month">${icon('right')}</button>
    </div>
    <div class="chips scroll" style="margin-bottom:14px">${whoChips}</div>
    ${body}
  </div>`;
}

function donut(entries, total, size = 120) {
  const r = 42, C = 2 * Math.PI * r;
  let off = 0;
  const segs = entries.map(([name, v]) => {
    const len = (v / total) * C;
    const s = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${catOf(name).color}" stroke-width="18"
      stroke-dasharray="${Math.max(len - (entries.length > 1 ? 2 : 0), 0.5)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  }).join('');
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" style="transform:rotate(-90deg);flex:none">${segs}</svg>`;
}

function categoryCard(t) {
  const entries = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';
  return `<div class="card hstack" style="gap:16px">
      ${donut(entries, t.expense)}
      <div class="grow"><b>Where it went</b>
        ${entries.slice(0, 5).map(([n, v]) => `<div class="hstack small" style="gap:6px;margin-top:4px">
          <i class="dot" style="--c:${catOf(n).color}"></i><span class="grow ellipsis">${esc(n)}</span>
          <span class="muted">${Math.round((v / t.expense) * 100)}%</span></div>`).join('')}
      </div></div>`;
}

function monthsSeries() {
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(S.month.getFullYear(), S.month.getMonth() - i, 1);
    const xs = S.trendTxns.filter((x) => sameMonth(x.date, m) && whoMatch(x.shared, x.ownerUid));
    const s = sumTxns(xs);
    out.push({ m, income: s.income, expense: s.expense });
  }
  return out;
}

function barChart(series) {
  const W = 330, H = 180, left = 44, bottom = 22, top = 10;
  const plotH = H - bottom - top;
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  const gw = (W - left) / series.length;
  const bw = Math.min(14, gw / 3);
  const grid = [0, 0.5, 1].map((f) => {
    const y = top + plotH * (1 - f);
    return `<line class="grid" x1="${left}" x2="${W}" y1="${y}" y2="${y}"/><text x="${left - 6}" y="${y + 4}" text-anchor="end">${esc(moneyShort(max * f))}</text>`;
  }).join('');
  const bars = series.map((s, i) => {
    const cx = left + gw * i + gw / 2;
    const hi = (s.income / max) * plotH, he = (s.expense / max) * plotH;
    return `<rect x="${cx - bw - 1}" y="${top + plotH - hi}" width="${bw}" height="${Math.max(hi, 0.5)}" rx="3" fill="${COLORS.income}"/>
      <rect x="${cx + 1}" y="${top + plotH - he}" width="${bw}" height="${Math.max(he, 0.5)}" rx="3" fill="${COLORS.expense}"/>
      <text x="${cx}" y="${H - 6}" text-anchor="middle" style="${sameMonth(s.m, S.month) ? 'font-weight:700;fill:var(--text)' : ''}">${fmtDate(s.m, { month: 'short' })}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Income and spending, last 6 months">${grid}${bars}</svg>`;
}

function overviewHtml() {
  if (!S.loaded.txns || !S.loaded.trendTxns) return `<div class="spinner"></div>`;
  const txns = S.txns.filter((x) => whoMatch(x.shared, x.ownerUid));
  const t = sumTxns(txns);
  const now = new Date();
  const daysIn = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 0).getDate();
  const elapsed = sameMonth(S.month, now) ? now.getDate() : (S.month > now ? 0 : daysIn);
  const avg = elapsed ? t.expense / elapsed : 0;
  const saved = t.income - t.expense;
  const rate = t.income > 0 ? Math.round((saved / t.income) * 100) : null;

  const kpis = `<div class="stats four">
      <div class="card"><span class="tiny muted">Income</span><b style="color:${COLORS.income}">${money(t.income)}</b></div>
      <div class="card"><span class="tiny muted">Spent</span><b style="color:${COLORS.expense}">${money(t.expense)}</b></div>
      <div class="card"><span class="tiny muted">Saved${rate !== null ? ` · ${rate}%` : ''}</span><b style="color:${saved >= 0 ? COLORS.primary : COLORS.expense}">${money(saved)}</b></div>
      <div class="card"><span class="tiny muted">Average per day</span><b>${money(avg)}</b></div>
    </div>`;

  const trend = `<div class="card"><div class="hstack" style="margin-bottom:8px"><b class="grow">Last 6 months</b>
      <span class="tiny"><i class="dot" style="--c:${COLORS.income}"></i>In</span><span class="tiny"><i class="dot" style="--c:${COLORS.expense}"></i>Out</span></div>
      ${barChart(monthsSeries())}</div>`;

  let whoCard = '';
  if (S.who === 'all' && t.expense > 0) {
    const rows = [['You', t.mine, COLORS.me], ...(hasPartner() ? [[partnerName(), t.theirs, COLORS.partner]] : []), ['Shared', t.shared, COLORS.shared]];
    whoCard = `<div class="card"><b>Who spent</b>
      ${rows.map(([n, v, c]) => `<div style="margin-top:10px"><div class="hstack small"><span class="grow">${esc(n)}</span><b>${money(v)}</b></div>
        <div class="bar" style="margin:6px 0 0"><i style="--c:${c};width:${(v / t.expense) * 100}%"></i></div></div>`).join('')}</div>`;
  }

  const top = txns.filter((x) => !x.isIncome).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const topCard = top.length ? `<div class="section-title"><span>Biggest expenses</span></div><div class="card flush">${top.map(txnRow).join('')}</div>` : '';

  const budgets = S.budgets.filter((b) => whoMatch(b.shared, b.ownerUid));
  let health = '';
  if (budgets.length) {
    let over = 0, near = 0;
    budgets.forEach((b) => { const r = b.limit > 0 ? spentFor(b, S.txns) / b.limit : 0; if (r >= 1) over++; else if (r >= 0.8) near++; });
    health = `<div class="card tap hstack" data-action="money-tab" data-mtab="budgets"><span style="font-size:22px">${over ? '🚨' : near ? '⚠️' : '✅'}</span>
      <div class="grow"><b>Budgets</b><div class="small muted">${over ? `${over} over limit` : near ? `${near} close to limit` : 'All within limits'} · ${budgets.length} total</div></div>${icon('right', 20)}</div>`;
  }
  const goals = S.goals.filter((g) => whoMatch(g.shared, g.ownerUid));
  let goalsCard = '';
  if (goals.length) {
    const sv = goals.reduce((a, g) => a + g.saved, 0), tg = goals.reduce((a, g) => a + g.target, 0);
    goalsCard = `<div class="card tap" data-action="money-tab" data-mtab="goals"><div class="hstack"><span style="font-size:22px">🎯</span><b class="grow">Savings goals</b><span class="small muted">${money(sv)} / ${money(tg)}</span></div>
      <div class="bar"><i style="--c:${COLORS.primary};width:${tg ? Math.min(sv / tg, 1) * 100 : 0}%"></i></div></div>`;
  }

  if (!txns.length && !budgets.length && !goals.length) {
    return kpis + trend + empty('📊', 'Add some income and expenses and your\noverview will fill up here.');
  }
  return kpis + trend + categoryCard(t) + whoCard + health + goalsCard + topCard;
}

function txnRow(x) {
  const c = catOf(x.category, x.isIncome);
  return `<button class="row" data-action="edit-txn" data-id="${x.id}">
      <span class="cat-bubble" style="--c:${c.color}">${c.emoji}</span>
      <span class="grow"><span class="ellipsis" style="display:block;font-weight:600">${esc(x.note || x.category)}</span>
        <span class="hstack" style="gap:6px;margin-top:3px">${ownerTag(x.shared, x.ownerUid)}${x.note ? `<span class="tiny muted ellipsis">${esc(x.category)}</span>` : ''}</span></span>
      <span class="amount ${x.isIncome ? 'in' : ''}">${x.isIncome ? '+' : '−'}${money(x.amount)}</span>
    </button>`;
}

function activityHtml() {
  if (!S.loaded.txns) return `<div class="spinner"></div>`;
  const txns = S.txns.filter((x) => whoMatch(x.shared, x.ownerUid));
  const t = sumTxns(txns);
  const stats = `<div class="stats">
      <div class="card"><span class="tiny muted">Income</span><b style="color:${COLORS.income}">${money(t.income)}</b></div>
      <div class="card"><span class="tiny muted">Spent</span><b style="color:${COLORS.expense}">${money(t.expense)}</b></div>
      <div class="card"><span class="tiny muted">Left</span><b style="color:${COLORS.primary}">${money(t.income - t.expense)}</b></div>
    </div>`;
  if (txns.length === 0) return stats + empty('🧾', 'No entries yet for this month.\nTap + to add an income or expense.');

  const groups = new Map();
  for (const x of txns) {
    const k = startOfDay(x.date).getTime();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const list = [...groups.entries()].map(([k, xs]) =>
    `<div class="section-title"><span>${dayLabel(new Date(k))}</span></div><div class="card flush">${xs.map(txnRow).join('')}</div>`).join('');
  return stats + categoryCard(t) + list;
}

function spentFor(b, txns) {
  let total = 0;
  for (const t of txns) {
    if (t.isIncome || t.category !== b.category) continue;
    const counts = b.shared ? !!t.shared : (!t.shared && t.ownerUid === b.ownerUid);
    if (counts) total += t.amount;
  }
  return total;
}

function budgetsHtml() {
  const budgets = S.budgets.filter((b) => whoMatch(b.shared, b.ownerUid));
  if (budgets.length === 0) return empty('🐷', `Set a monthly limit for a category, like ${cur()}8,000 for Food.\nOurNest warns you as you get close. Tap + to start.`);
  let limitSum = 0, spentSum = 0;
  const rows = budgets.map((b) => {
    const spent = spentFor(b, S.txns);
    limitSum += b.limit; spentSum += spent;
    const ratio = b.limit > 0 ? spent / b.limit : 0;
    const color = ratio >= 1 ? COLORS.expense : ratio >= 0.8 ? COLORS.warn : COLORS.income;
    const c = catOf(b.category);
    return `<div class="card tap" data-action="edit-budget" data-id="${b.id}">
      <div class="hstack"><span style="font-size:20px">${c.emoji}</span><b class="grow">${esc(b.category)}</b>${ownerTag(b.shared, b.ownerUid)}</div>
      <div class="bar"><i style="--c:${color};width:${Math.min(ratio, 1) * 100}%"></i></div>
      <div class="hstack small"><span class="grow">${money(spent)} spent</span>
        <b style="color:${color}">${ratio >= 1 ? `Over by ${money(spent - b.limit)}` : `${money(b.limit - spent)} left`}</b></div>
    </div>`;
  }).join('');
  const left = limitSum - spentSum;
  return `<div class="card soft hstack"><span style="font-size:22px">📊</span>
      <b class="grow">${money(spentSum)} of ${money(limitSum)} used</b>
      <b style="color:${left >= 0 ? COLORS.income : COLORS.expense}">${moneyShort(Math.abs(left))} ${left >= 0 ? 'left' : 'over'}</b></div>${rows}`;
}

function ring(progress, emoji, done) {
  const r = 25, C = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 58 58" width="58" height="58">
      <circle cx="29" cy="29" r="${r}" fill="none" stroke="var(--card-2)" stroke-width="6"/>
      <circle cx="29" cy="29" r="${r}" fill="none" stroke="${done ? COLORS.income : COLORS.primary}" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${progress * C} ${C}"/></svg>${emoji}</div>`;
}

function goalsHtml() {
  const goals = S.goals.filter((g) => whoMatch(g.shared, g.ownerUid));
  if (goals.length === 0) return empty('🎯', 'Save up together for something special —\na trip, a wedding, an emergency fund. Tap + to add one.');
  return goals.map((g) => {
    const p = g.target > 0 ? Math.min(Math.max(g.saved / g.target, 0), 1) : 0;
    return `<div class="card tap hstack" style="gap:14px" data-action="goal" data-id="${g.id}">
      ${ring(p, esc(g.emoji || '🎯'), p >= 1)}
      <div class="grow">
        <div class="hstack"><b class="grow ellipsis" style="font-size:16px">${esc(g.title)}</b>${ownerTag(g.shared, g.ownerUid)}</div>
        <div class="muted small">${money(g.saved)} of ${money(g.target)}</div>
        <div class="tiny bold" style="color:${COLORS.primary}">${p >= 1 ? 'Goal reached! 🎉' : `${Math.round(p * 100)}% there`}</div>
      </div></div>`;
  }).join('');
}

const ordinal = (n) => (n >= 11 && n <= 13 ? `${n}th` : `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`);

function billsHtml() {
  const bills = S.bills.filter((b) => whoMatch(b.shared, b.ownerUid));
  if (bills.length === 0) return empty('🧾', 'Add recurring bills like rent, Meralco, water, internet\nand tick them off each month. Tap + to add one.');
  const unpaid = bills.filter((b) => !isPaid(b, S.month)).reduce((a, b) => a + b.amount, 0);
  return `<div class="card soft hstack"><span style="font-size:22px">🗓️</span>
      <b class="grow">${unpaid === 0 ? 'All bills paid this month 🎉' : `${money(unpaid)} still to pay`}</b></div>
    <div class="card flush">${bills.map((b) => {
      const paid = isPaid(b, S.month);
      return `<div class="row">
        <input type="checkbox" class="check" data-action="toggle-bill" data-id="${b.id}" ${paid ? 'checked' : ''} aria-label="Paid">
        <div class="grow tap" data-action="edit-bill" data-id="${b.id}" style="cursor:pointer">
          <div class="${paid ? 'done-text' : ''}" style="font-weight:600">${esc(b.title)}</div>
          <div class="hstack" style="gap:6px;margin-top:3px">${ownerTag(b.shared, b.ownerUid)}<span class="tiny muted">Due on the ${ordinal(b.dueDay)}</span></div>
        </div>
        <span class="amount">${money(b.amount)}</span>
      </div>`;
    }).join('')}</div>`;
}

// ==== PLAN (calendar + lists) ================================================

function planHeader() {
  return `<div class="page"><div class="page-head"><h1>Plan</h1></div>
    <div class="seg">
      <button class="${S.planTab === 'calendar' ? 'on' : ''}" data-action="plan-tab" data-ptab="calendar">📅 Calendar</button>
      <button class="${S.planTab === 'lists' ? 'on' : ''}" data-action="plan-tab" data-ptab="lists">🛒 Lists</button>
    </div>`;
}

const eventColor = (e) => (e.private ? COLORS.me : COLORS.shared);

function eventRow(e, withDate = false) {
  const todo = e.kind === 'todo';
  return `<div class="row">
    ${withDate ? `<span class="when">${esc(fmtDate(e.date, { month: 'short', day: 'numeric' }))}</span>` : ''}
    ${todo ? `<input type="checkbox" class="check round" data-action="toggle-event" data-id="${e.id}" ${e.done ? 'checked' : ''} aria-label="Done">`
      : `<span class="kind-ic" style="--c:${eventColor(e)}">📅</span>`}
    <div class="grow tap" data-action="edit-event" data-id="${e.id}" style="cursor:pointer">
      <div class="${e.done ? 'done-text' : ''}" style="font-weight:600">${esc(e.title)}</div>
      <div class="hstack" style="gap:6px;margin-top:3px;flex-wrap:wrap">
        ${e.private ? tag('Just me', COLORS.me) : tag('Together', COLORS.shared)}
        <span class="tiny muted">${e.allDay ? 'All day' : fmtTime(e.date)}${e.remind >= 0 ? ' · 🔔' : ''}${!e.private && !isMine(e.createdBy) ? ` · by ${esc(partnerName())}` : ''}</span>
      </div>
    </div>
  </div>`;
}

function calendarHtml() {
  const m = S.calMonth;
  const today = startOfDay(new Date());
  const firstDow = m.getDay();
  const gridStart = new Date(m.getFullYear(), m.getMonth(), 1 - firstDow);
  const byDay = new Map();
  for (const e of S.events) {
    const k = startOfDay(e.date).getTime();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    if (i >= 35 && d.getMonth() !== m.getMonth()) break;
    const evs = byDay.get(d.getTime()) || [];
    const cls = ['cal-day', d.getMonth() !== m.getMonth() ? 'other' : '', sameDay(d, today) ? 'today' : '', sameDay(d, S.calDay) ? 'sel' : ''].join(' ');
    const dots = evs.slice(0, 3).map((e) => `<i style="--c:${e.done ? 'var(--muted)' : eventColor(e)}"></i>`).join('');
    cells.push(`<button class="${cls}" data-action="pick-day" data-date="${dateInputValue(d)}">${d.getDate()}<span class="dots">${dots}</span></button>`);
  }
  const wd = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div class="wd">${x}</div>`).join('');

  const dayEvents = byDay.get(S.calDay.getTime()) || [];
  const upcoming = S.events.filter((e) => !e.done && e.date >= today && daysBetween(today, e.date) <= 14 && !sameDay(e.date, S.calDay)).slice(0, 8);
  const overdue = S.events.filter((e) => e.kind === 'todo' && !e.done && e.date < today);

  return `
    <div class="card" style="padding:12px">
      <div class="month-bar" style="margin-bottom:4px">
        <button class="icon-btn" data-action="cal-month" data-delta="-1" aria-label="Previous month">${icon('left')}</button>
        <h2>${fmtDate(m, { month: 'long', year: 'numeric' })}</h2>
        <button class="icon-btn" data-action="cal-month" data-delta="1" aria-label="Next month">${icon('right')}</button>
      </div>
      <div class="cal">${wd}${cells.join('')}</div>
      <div class="legend" style="color:var(--muted);justify-content:center;margin-top:10px">
        <span><i class="dot" style="--c:${COLORS.shared}"></i>Together</span><span><i class="dot" style="--c:${COLORS.me}"></i>Just me</span>
        ${sameMonth(m, today) ? '' : '<button class="btn link small" data-action="cal-today" style="padding:0 4px">Back to today</button>'}
      </div>
    </div>
    <div class="section-title"><span>${esc(dayLabel(S.calDay))}</span><button class="btn link small" data-action="new-event">${icon('plus', 16)} Add</button></div>
    ${dayEvents.length ? `<div class="card flush">${dayEvents.map((e) => eventRow(e)).join('')}</div>` : `<div class="card muted small center">Nothing planned. Tap + to add a to-do or event.</div>`}
    ${overdue.length ? `<div class="section-title"><span style="color:${COLORS.expense}">Overdue to-dos</span></div><div class="card flush">${overdue.map((e) => eventRow(e, true)).join('')}</div>` : ''}
    ${upcoming.length ? `<div class="section-title"><span>Coming up</span></div><div class="card flush">${upcoming.map((e) => eventRow(e, true)).join('')}</div>` : ''}
  </div>`;
}

function listsShell() {
  return `
    <div class="seg">${LISTS.map(([n, e]) => `<button class="${S.listName === n ? 'on' : ''}" data-action="list-tab" data-list="${n}">${e} ${n}</button>`).join('')}</div>
    <form class="hstack" data-form="item" style="margin-bottom:12px">
      <input name="text" class="grow" placeholder="${S.listName === 'Groceries' ? 'Add item, e.g. Eggs (1 tray)' : 'Add a task'}" autocomplete="off">
      <button class="icon-btn primary" type="submit" aria-label="Add">${icon('plus', 22)}</button>
    </form>
    <div id="listItems"></div>
  </div>`;
}

function itemRow(i) {
  return `<div class="row">
    <input type="checkbox" class="check" data-action="toggle-item" data-id="${i.id}" ${i.done ? 'checked' : ''} aria-label="Done">
    <span class="grow ${i.done ? 'done-text' : ''}" style="word-break:break-word">${esc(i.text)}</span>
    <i class="dot" style="--c:${colorOf(i.addedBy)};margin:0" title="Added by ${esc(nameOf(i.addedBy))}"></i>
    <button class="icon-btn" data-action="del-item" data-id="${i.id}" aria-label="Delete">${icon('trash', 18)}</button>
  </div>`;
}

function listItemsHtml() {
  if (!S.loaded.items) return `<div class="spinner"></div>`;
  const items = S.items.filter((i) => (i.list || 'To-do') === S.listName);
  if (items.length === 0) return empty(S.listName === 'Groceries' ? '🛒' : '✅', 'Nothing here yet.');
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  return (open.length ? `<div class="card flush">${open.map(itemRow).join('')}</div>` : '')
    + (done.length ? `<div class="section-title"><span>Done (${done.length})</span><button class="btn link" data-action="clear-done">Clear</button></div>
      <div class="card flush">${done.map(itemRow).join('')}</div>` : '');
}

// ==== CHAT ===================================================================

function chatShell() {
  return `<div class="chat-head" id="chatHead"></div>
    <div class="msgs" id="msgs"></div>
    <div class="chat-bar">
      <form data-form="chat">
        <label class="icon-btn soft" aria-label="Send a photo" style="cursor:pointer">${icon('image', 20)}
          <input type="file" accept="image/*" data-change="chat-photo" hidden></label>
        <textarea name="text" rows="1" placeholder="Message…" autocomplete="off"></textarea>
        <button class="icon-btn primary" type="submit" aria-label="Send">${icon('send', 20)}</button>
      </form>
    </div>`;
}

function chatHeadHtml() {
  if (!hasPartner()) return `<b class="grow">Chat</b>`;
  const loc = S.locs[S.partner.uid];
  const lastTheirs = [...S.messages].reverse().find((m) => !isMine(m.from));
  const times = [loc?.updatedAt, lastTheirs?.createdAt].filter(Boolean).map((d) => d.getTime());
  const active = times.length ? `Active ${timeAgo(new Date(Math.max(...times)))}` : '';
  return `${avatar(partnerName(), COLORS.partner, 40)}<div class="grow"><b>${esc(partnerName())}</b><div class="tiny muted">${esc(active)}</div></div>`;
}

function messagesHtml() {
  if (!hasPartner()) return empty('💌', 'Invite your partner first.\nYou can find your invite code in Settings.');
  if (!S.loaded.messages) return `<div class="spinner"></div>`;
  if (!S.messages.length) return empty('💬', `Say hi to ${partnerName()}! 👋`);
  let lastDay = null;
  const out = [];
  const lastMine = [...S.messages].reverse().find((m) => isMine(m.from));
  S.messages.forEach((m, i) => {
    const day = startOfDay(m.createdAt).getTime();
    if (day !== lastDay) { out.push(`<div class="day-sep">${esc(dayLabel(m.createdAt))}</div>`); lastDay = day; }
    const mine = isMine(m.from);
    const next = S.messages[i + 1];
    const showMeta = !next || next.from !== m.from || next.createdAt - m.createdAt > 5 * 60000;
    const seen = mine && m === lastMine && hasPartner() && m.seenBy.includes(S.partner.uid);
    out.push(`<div class="msg ${mine ? 'me' : 'them'}">
      ${m.photoId ? photoImg(m.photoId) : ''}
      ${m.text ? `<div class="b"${m.photoId ? ' style="margin-top:4px"' : ''}>${esc(m.text)}</div>` : ''}
      ${showMeta || seen ? `<div class="meta">${fmtTime(m.createdAt)}${seen ? ' · Seen ✓✓' : ''}</div>` : ''}
    </div>`);
  });
  return out.join('');
}

// ==== MOMENTS (posts + stories) ==============================================

function momentsShell() {
  return `<div class="page">
    <div class="page-head"><h1>Moments</h1></div>
    <div class="stories" id="stories"></div>
    <div class="card">
      <div class="moods">${MOODS.map((m) => `<button class="mood ${S.mood === m ? 'on' : ''}" data-action="mood" data-mood="${m}">${m}</button>`).join('')}</div>
      <form data-form="post">
        <div class="composer-row">
          <textarea name="text" rows="2" placeholder="What's on your mind? e.g. Pauwi na ako 🚌"></textarea>
        </div>
        <div id="postPreview">${postPreviewHtml()}</div>
        <div class="hstack" style="margin-top:10px">
          <label class="btn sm" style="cursor:pointer">${icon('image', 18)} Photo<input type="file" accept="image/*" data-change="post-photo" hidden></label>
          <span class="grow"></span>
          <button class="btn sm primary" type="submit">${icon('send', 16)} Post</button>
        </div>
      </form>
    </div>
    <div id="feed"></div>
  </div>`;
}

function postPreviewHtml() {
  return S.postPhoto ? `<div class="thumb"><img src="${S.postPhoto}" alt=""><button type="button" data-action="clear-post-photo" aria-label="Remove">×</button></div>` : '';
}

const activeStories = (owner) => S.stories
  .filter((s) => s.authorUid === owner && Date.now() - s.createdAt.getTime() < STORY_HOURS * 3600000)
  .sort((a, b) => a.createdAt - b.createdAt);

function storyBubble(owner, label, color) {
  const list = activeStories(owner);
  if (!list.length) return '';
  const unseen = !isMine(owner) && list.some((s) => !s.seenBy.includes(uid()));
  const latest = list[list.length - 1];
  const inner = latest.photoId ? photoImg(latest.photoId, '', false) : `<span style="background:${esc(latest.bg || color)};width:100%;height:100%;display:grid;place-items:center;color:#fff;font-size:20px">Aa</span>`;
  return `<button class="story" data-action="open-stories" data-owner="${owner}">
      <span class="ring-o ${unseen ? 'new' : ''}"><div>${inner}</div></span>${esc(label)}</button>`;
}

function storiesBarHtml() {
  const add = `<button class="story" data-action="new-story"><span class="ring-o"><div style="color:var(--primary)">${icon('camera', 24)}</div><span class="plus">+</span></span>Add story</button>`;
  return add + storyBubble(uid(), 'You', COLORS.me) + (hasPartner() ? storyBubble(S.partner.uid, partnerName(), COLORS.partner) : '');
}

function feedHtml() {
  if (!S.loaded.posts) return `<div class="spinner"></div>`;
  if (S.posts.length === 0) return empty('💬', `Share how your day is going.\n${hasPartner() ? partnerName() : 'Your partner'} will see it here.`);
  return S.posts.map((p) => {
    const mine = isMine(p.authorUid);
    const name = mine ? myName() : partnerName();
    const hearted = p.hearts.includes(uid());
    const place = p.lat != null && p.lng != null
      ? `<a class="btn link small" style="padding:4px 0" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">${icon('pin', 16)} View place</a>` : '';
    const lastComments = p.comments.slice(-2);
    return `<div class="card">
      <div class="hstack">
        ${avatar(name, mine ? COLORS.me : COLORS.partner, 38)}
        <div class="grow"><b>${esc(name)}</b><div class="tiny muted">${timeAgo(p.createdAt)} · ${fmtTime(p.createdAt)}</div></div>
        ${p.kind === 'checkin' ? tag('Check-in', COLORS.shared) : ''}
        ${mine ? `<button class="icon-btn" data-action="del-post" data-id="${p.id}" aria-label="Delete">${icon('trash', 18)}</button>` : ''}
      </div>
      ${(p.mood || p.text) ? `<div class="post-body">${p.mood ? `<span class="m">${esc(p.mood)}</span>` : ''}<p>${esc(p.text)}</p></div>` : '<div style="height:10px"></div>'}
      ${p.photoId ? photoImg(p.photoId) : ''}
      ${place}
      ${(p.hearts.length || p.comments.length) ? `<div class="tiny muted" style="margin-top:8px">${p.hearts.length ? `❤️ ${p.hearts.length}` : ''}${p.hearts.length && p.comments.length ? ' · ' : ''}${p.comments.length ? `${p.comments.length} comment${p.comments.length > 1 ? 's' : ''}` : ''}</div>` : ''}
      <div class="post-actions">
        <button class="heart ${hearted ? 'on' : ''}" data-action="heart" data-id="${p.id}">${icon('heart', 18)} Love</button>
        <button data-action="comments" data-id="${p.id}">${icon('comment', 18)} Comment</button>
      </div>
      ${lastComments.map((c) => `<div class="comment">${avatar(nameOf(c.by), colorOf(c.by), 28)}
        <div class="inset small"><b>${esc(isMine(c.by) ? myName() : partnerName())}</b> ${esc(c.text)}</div></div>`).join('')}
    </div>`;
  }).join('');
}

// ==== PLACES (map) ===========================================================

let leafletMap = null;
const mapMarkers = {};
let mapCentered = false;

function resetMap() {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  Object.keys(mapMarkers).forEach((k) => delete mapMarkers[k]);
  mapCentered = false;
}

function pinIcon(name, color) {
  return window.L.divIcon({ className: '', html: `<div class="pin" style="--c:${color}">${avatar(name, color, 46)}</div>`, iconSize: [52, 52], iconAnchor: [26, 26] });
}

function renderMap() {
  if (!leafletMap) {
    if (!window.L) {
      $('#map').innerHTML = `<div class="empty" style="padding-top:120px">🗺️<br>The map needs internet the first time you open it.</div>`;
    } else {
      leafletMap = window.L.map('map', { zoomControl: false, attributionControl: true }).setView(DEFAULT_MAP_CENTER, 12);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).addTo(leafletMap);
    }
  }
  setTimeout(() => leafletMap?.invalidateSize(), 60);

  const mine = S.locs[uid()];
  const theirs = S.partner ? S.locs[S.partner.uid] : null;
  const people = [['me', mine, myName(), COLORS.me], ['partner', theirs, partnerName(), COLORS.partner]];
  if (leafletMap) {
    for (const [k, loc, name, color] of people) {
      const has = loc && (loc.lat || loc.lng);
      if (has) {
        const ll = [loc.lat, loc.lng];
        if (!mapMarkers[k]) mapMarkers[k] = window.L.marker(ll, { icon: pinIcon(name, color) }).addTo(leafletMap);
        else mapMarkers[k].setLatLng(ll);
      } else if (mapMarkers[k]) {
        mapMarkers[k].remove();
        delete mapMarkers[k];
      }
    }
    if (!mapCentered) {
      const target = (theirs && (theirs.lat || theirs.lng)) ? theirs : (mine && (mine.lat || mine.lng)) ? mine : null;
      if (target) { mapCentered = true; leafletMap.setView([target.lat, target.lng], 14); }
    }
  }

  const sharing = !!S.me?.shareLocation;
  $('#mapTop').innerHTML = `<div class="card"><label class="switch-row" style="padding:6px 0">
      <span style="color:${sharing ? COLORS.primary : 'var(--muted)'}">${icon('pin')}</span>
      <b class="grow">${sharing ? 'Sharing my location' : 'Location sharing is off'}</b>
      <input type="checkbox" class="switch" data-change="sharing" ${sharing ? 'checked' : ''}></label></div>`;

  const personRow = (key, name, color, loc, canNav) => {
    const has = loc && (loc.lat || loc.lng);
    let status = 'No location yet';
    if (has) status = `Updated ${timeAgo(loc.updatedAt)}${loc.sharing ? '' : ' · paused'}${loc.battery != null ? ` · 🔋${loc.battery}%` : ''}`;
    const nav = canNav && has
      ? `<a class="icon-btn" style="color:${COLORS.primary}" href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}" target="_blank" rel="noopener" aria-label="Directions">${icon('nav')}</a>`
      : '';
    return `<div class="row tap" data-action="focus" data-who="${key}" style="cursor:pointer">${avatar(name, color, 38)}
      <span class="grow"><b>${esc(name)}</b><div class="tiny muted">${esc(status)}</div></span>${nav}</div>`;
  };

  $('#mapPanel').innerHTML = `
    ${hasPartner() ? personRow('partner', partnerName(), COLORS.partner, theirs, true) : ''}
    ${personRow('me', 'You', COLORS.me, mine, false)}
    <div class="bold" style="margin:8px 0">Quick check-in</div>
    <div class="chips scroll">${CHECKINS.map(([e, l]) => `<button class="chip" data-action="checkin" data-emoji="${e}" data-label="${esc(l)}">${e} ${esc(l)}</button>`).join('')}</div>`;
}

// ==== SETTINGS VIEW ==========================================================

function segChoice(action, value, options) {
  return `<div class="seg" style="margin:0">${options.map(([v, l]) => `<button class="${value === v ? 'on' : ''}" data-action="${action}" data-value="${v}">${l}</button>`).join('')}</div>`;
}

function settingsView() {
  const code = S.couple?.inviteCode || '';
  const anniv = S.couple?.anniversary ? toDate(S.couple.anniversary) : null;
  const notifSupported = 'Notification' in window;
  const notifOn = prefs.notify && notifSupported && Notification.permission === 'granted';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;

  return `<div class="page">
    <div class="page-head"><button class="icon-btn" data-action="tab" data-tab="home" aria-label="Back">${icon('back')}</button><h1>Settings</h1></div>

    ${hasPartner() ? '' : `<div class="card soft">
      <div class="hstack"><div style="font-size:26px">💌</div>
        <div class="grow"><b>Invite your partner</b><div class="muted small">They sign up, tap "Join", and enter this code:</div></div></div>
      <div class="hstack" style="margin-top:12px">
        <div class="grow" style="font-size:26px;font-weight:800;letter-spacing:6px">${esc(code)}</div>
        <button class="btn primary sm" data-action="share-code">${icon('share', 16)} Share</button>
      </div></div>`}

    <div class="section-title"><span>Profile</span></div>
    <div class="card flush">
      <button class="row" data-action="edit-name">${avatar(myName(), COLORS.me, 36)}
        <span class="grow"><b>${esc(myName())}</b><div class="tiny muted">${esc(S.me?.email || '')}</div></span>${icon('edit', 18)}</button>
      ${hasPartner() ? `<div class="row">${avatar(partnerName(), COLORS.partner, 36)}<span class="grow"><b>${esc(partnerName())}</b><div class="tiny muted">Your partner</div></span></div>` : ''}
    </div>

    <div class="section-title"><span>Appearance</span></div>
    <div class="card">
      <div class="label">Theme</div>
      ${segChoice('set-theme', prefs.theme, [['light', '☀️ Light'], ['dark', '🌙 Dark'], ['auto', '⚙️ Auto']])}
      <div class="label" style="margin-top:14px">Money on Home</div>
      ${segChoice('set-home-money', prefs.homeMoney, [['card', 'Summary'], ['dashboard', 'Dashboard'], ['hidden', 'Hide']])}
    </div>

    <div class="section-title"><span>Notifications</span></div>
    <div class="card">
      <label class="switch-row" style="padding:0">
        <span class="grow"><b>🔔 Reminders & messages</b><small>Pop-up alerts for your to-dos, events and new chats on this phone.</small></span>
        <input type="checkbox" class="switch" data-change="notify" ${notifOn ? 'checked' : ''} ${notifSupported ? '' : 'disabled'}>
      </label>
      ${notifSupported ? '' : '<div class="tiny muted" style="margin-top:8px">On iPhone, add OurNest to your Home Screen first, then turn this on.</div>'}
    </div>

    <div class="section-title"><span>Our space</span></div>
    <div class="card flush">
      ${hasPartner() ? `<button class="row" data-action="share-code">
        <span class="cat-bubble" style="--c:${COLORS.primary}">🔑</span>
        <span class="grow"><b>Invite code</b><div class="tiny muted">${esc(code)} · already paired 💙</div></span></button>` : ''}
      <label class="row"><span class="cat-bubble" style="--c:${COLORS.partner}">💙</span>
        <span class="grow"><b>Anniversary</b><div class="tiny muted">For your days-together counter</div></span>
        <input type="date" data-change="anniv" value="${anniv ? dateInputValue(anniv) : ''}" max="${dateInputValue(new Date())}" style="width:auto;padding:8px 10px"></label>
      <label class="row"><span class="cat-bubble" style="--c:${COLORS.income}">💰</span>
        <span class="grow"><b>Currency</b></span>
        <select data-change="currency" style="width:auto;padding:8px 12px">
          ${CURRENCIES.map((c) => `<option ${c === cur() ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select></label>
    </div>

    <div class="section-title"><span>Privacy</span></div>
    <div class="card">
      <label class="switch-row" style="padding:0">
        <span class="grow"><b>Share my location</b><small>Only your partner can see it. Updates while OurNest is open.</small></span>
        <input type="checkbox" class="switch" data-change="sharing" ${S.me?.shareLocation ? 'checked' : ''}>
      </label>
    </div>

    <div class="section-title"><span>Phone home screen</span></div>
    <div class="card">
      ${standalone ? '<b>✅ OurNest is installed on this phone.</b>'
        : deferredInstall ? `<button class="btn primary block" data-action="install">${icon('download', 18)} Install OurNest app</button>`
        : '<b>Add OurNest to your home screen</b><div class="small muted" style="margin-top:4px">Android: Chrome menu ⋮ → <b>Add to Home screen</b>. iPhone: Safari → Share → <b>Add to Home Screen</b>.</div>'}
      <div class="small muted" style="margin-top:10px;line-height:1.5">
        <b style="color:var(--text)">Shortcuts:</b> on Android, press and hold the OurNest icon for quick shortcuts —
        📸 Snap a moment, ➕ Add expense, 📅 Plan and 💬 Chat. You can drag a shortcut onto your home screen.<br>
        <b style="color:var(--text)">Photo on your lock/home screen:</b> tap ⤓ on the moment photo on Home to save it, then set it as your wallpaper.
      </div>
    </div>

    <div class="section-title"><span>About</span></div>
    <div class="card muted small">OurNest saves everything on your phone first, so it works without internet.
      When you're back online, your changes sync to your partner automatically.</div>
    <button class="btn block danger" data-action="signout" style="margin-top:6px">${icon('logout', 18)} Sign out</button>
  </div>`;
}

// ==== SHEETS (pop-up editors) ================================================

function openSheet(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="backdrop" data-action="close-modal"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  document.body.classList.add('noscroll');
  hydratePhotos();
}
function closeSheet() {
  const m = $('#modal');
  m.hidden = true;
  m.innerHTML = '';
  document.body.classList.remove('noscroll');
  if (askResolve) { const r = askResolve; askResolve = null; r(false); }
  if (reminderQueue.length) setTimeout(showReminderPopup, 300);
}
function ask(title, body, yes = 'Yes') {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><p class="muted" style="margin-top:8px">${esc(body)}</p>
      <div class="row-btns"><button class="btn" data-action="ask-no">Cancel</button><button class="btn primary" data-action="ask-yes">${esc(yes)}</button></div>`);
    askResolve = resolve;
  });
}

const sheetHead = (title, deleteAction, id) => `<div class="sheet-head"><h3>${esc(title)}</h3>
  ${deleteAction ? `<button type="button" class="icon-btn danger" data-action="${deleteAction}" data-id="${id}" aria-label="Delete">${icon('trash')}</button>` : ''}</div>`;
const sharedSwitch = (on, text = 'Both of you contribute') => `<label class="switch-row">
  <span class="grow"><b>Shared between us</b><small>${esc(text)}</small></span>
  <input type="checkbox" class="switch" name="shared" ${on ? 'checked' : ''}></label>`;
const moneyField = (label, name, value) => `<label class="field"><span>${esc(label)}</span>
  <div class="money-input"><b>${esc(cur())}</b><input name="${name}" inputmode="decimal" placeholder="0.00" value="${value ?? ''}" autocomplete="off"></div></label>`;
const amountStr = (v) => (v == null ? '' : num(v) % 1 === 0 ? String(num(v)) : num(v).toFixed(2));
const pickChips = (name, options, selected) => options.map((o) =>
  `<button type="button" class="chip ${o.value === selected ? 'on' : ''} ${o.emojiOnly ? 'emoji' : ''}" style="--c:${o.color || COLORS.primary}"
    data-action="pick" data-name="${name}" data-value="${esc(o.value)}">${o.label}</button>`).join('');
const catChips = (type, selected) => pickChips('category',
  (type === 'income' ? INCOME_CATS : EXPENSE_CATS).map((c) => ({ value: c.name, label: `${c.emoji} ${esc(c.name)}`, color: c.color })), selected);

function openTxnEditor(existing, type = 'expense') {
  const e = existing;
  const t = e?.type || type;
  const cat = e?.category || (t === 'income' ? 'Salary' : 'Food');
  openSheet(`${sheetHead(e ? 'Edit entry' : 'New entry', e ? 'delete-txn' : '', e?.id)}
    <form data-form="txn" data-id="${e?.id || ''}" data-owner="${e?.ownerUid || ''}">
      <div class="seg">
        <button type="button" class="${t === 'expense' ? 'on' : ''}" data-action="txn-type" data-type="expense">− Expense</button>
        <button type="button" class="${t === 'income' ? 'on' : ''}" data-action="txn-type" data-type="income">+ Income</button>
      </div>
      <input type="hidden" name="type" value="${t}">
      ${moneyField('Amount', 'amount', amountStr(e?.amount))}
      <div class="label">Category</div>
      <div class="chips" id="catChips" style="margin-bottom:14px">${catChips(t, cat)}</div>
      <input type="hidden" name="category" value="${esc(cat)}">
      <label class="field"><span>Note (optional)</span><input name="note" value="${esc(e?.note || '')}" placeholder="e.g. Jollibee lunch" autocomplete="off"></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${dateInputValue(e?.date || new Date())}"></label>
      ${sharedSwitch(!!e?.shared, 'Counts toward your joint budget')}
      <button class="btn primary block" type="submit" style="margin-top:8px">Save</button>
    </form>`);
  if (!e) setTimeout(() => $('#modal input[name=amount]')?.focus(), 80);
}

function openBudgetSheet(b) {
  const cat = b?.category || 'Food';
  openSheet(`${sheetHead(b ? 'Edit budget' : 'New monthly budget', b ? 'delete-budget' : '', b?.id)}
    <form data-form="budget" data-id="${b?.id || ''}" data-owner="${b?.ownerUid || ''}">
      <div class="label">Category</div>
      <div class="chips" style="margin-bottom:14px">${catChips('expense', cat)}</div>
      <input type="hidden" name="category" value="${esc(cat)}">
      ${moneyField('Monthly limit', 'limit', amountStr(b?.limit))}
      ${sharedSwitch(b ? !!b.shared : true)}
      <button class="btn primary block" type="submit" style="margin-top:8px">Save</button>
    </form>`);
}

function openGoalSheet(g) {
  const emoji = g?.emoji || '🎯';
  openSheet(`${sheetHead(g ? 'Edit goal' : 'New savings goal', g ? 'delete-goal' : '', g?.id)}
    <form data-form="goal" data-id="${g?.id || ''}" data-owner="${g?.ownerUid || ''}">
      <div class="chips" style="margin-bottom:14px">${pickChips('emoji', GOAL_EMOJIS.map((x) => ({ value: x, label: x, emojiOnly: true })), emoji)}</div>
      <input type="hidden" name="emoji" value="${emoji}">
      <label class="field"><span>Goal name</span><input name="title" value="${esc(g?.title || '')}" placeholder="e.g. Baguio trip" autocomplete="off"></label>
      ${moneyField('Target amount', 'target', amountStr(g?.target))}
      ${sharedSwitch(g ? !!g.shared : true)}
      <button class="btn primary block" type="submit" style="margin-top:8px">Save</button>
    </form>`);
}

function openGoalMoney(g) {
  openSheet(`<div class="sheet-head"><h3>${esc(g.emoji || '🎯')} ${esc(g.title)}</h3></div>
    <p class="muted small" style="margin-bottom:12px">${money(g.saved)} saved of ${money(g.target)}</p>
    <form data-form="goal-money" data-id="${g.id}">
      ${moneyField('Amount', 'amount', '')}
      <div class="row-btns" style="margin-top:4px">
        <button class="btn" type="submit" name="dir" value="out">Withdraw</button>
        <button class="btn primary" type="submit" name="dir" value="in">Add savings</button>
      </div>
    </form>
    <div class="center" style="margin-top:10px"><button class="btn link" data-action="edit-goal" data-id="${g.id}">${icon('edit', 16)} Edit goal</button></div>`);
  setTimeout(() => $('#modal input[name=amount]')?.focus(), 80);
}

function openBillSheet(b) {
  openSheet(`${sheetHead(b ? 'Edit bill' : 'New monthly bill', b ? 'delete-bill' : '', b?.id)}
    <form data-form="bill" data-id="${b?.id || ''}" data-owner="${b?.ownerUid || ''}">
      <label class="field"><span>Bill name</span><input name="title" value="${esc(b?.title || '')}" placeholder="e.g. Meralco, Rent, PLDT" autocomplete="off"></label>
      ${moneyField('Usual amount', 'amount', amountStr(b?.amount))}
      <label class="field"><span>Due day of the month (1–31)</span><input name="dueDay" inputmode="numeric" value="${b?.dueDay || ''}" placeholder="e.g. 15"></label>
      ${sharedSwitch(b ? !!b.shared : true)}
      <button class="btn primary block" type="submit" style="margin-top:8px">Save</button>
    </form>`);
}

function openEventSheet(e, day) {
  const d = e?.date || (() => { const x = new Date(day || S.calDay); const n = new Date(); x.setHours(n.getHours() + 1, 0, 0, 0); return x; })();
  const kind = e?.kind || 'event';
  const isPrivate = e ? !!e.private : false;
  const allDay = e ? !!e.allDay : false;
  const remind = e ? e.remind : 60;
  const canDelete = e && (isMine(e.createdBy) || !e.private);
  openSheet(`${sheetHead(e ? 'Edit plan' : 'New plan', canDelete ? 'delete-event' : '', e?.id)}
    <form data-form="event" data-id="${e?.id || ''}">
      <div class="seg">
        <button type="button" class="${kind === 'event' ? 'on' : ''}" data-action="pick" data-name="kind" data-value="event">📅 Event</button>
        <button type="button" class="${kind === 'todo' ? 'on' : ''}" data-action="pick" data-name="kind" data-value="todo">✅ To-do</button>
      </div>
      <input type="hidden" name="kind" value="${kind}">
      <label class="field"><span>What</span><input name="title" value="${esc(e?.title || '')}" placeholder="e.g. Dinner with family, Pay Meralco" autocomplete="off"></label>
      <div class="label">Who is it for?</div>
      <div class="chips" style="margin-bottom:14px">
        ${pickChips('scope', [
          { value: 'together', label: '💑 Together', color: COLORS.shared },
          { value: 'me', label: '🙋 Just me', color: COLORS.me },
        ], isPrivate ? 'me' : 'together')}
      </div>
      <input type="hidden" name="scope" value="${isPrivate ? 'me' : 'together'}">
      <div class="two">
        <label class="field"><span>Date</span><input type="date" name="date" value="${dateInputValue(d)}"></label>
        <label class="field" id="timeField" ${allDay ? 'hidden' : ''}><span>Time</span><input type="time" name="time" value="${timeInputValue(d)}"></label>
      </div>
      <label class="switch-row" style="padding-top:0"><span class="grow"><b>All day</b></span>
        <input type="checkbox" class="switch" name="allDay" data-change="allday" ${allDay ? 'checked' : ''}></label>
      <label class="field"><span>Remind me</span>
        <select name="remind">${REMIND_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === remind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="tiny muted" style="margin:-6px 2px 12px">🔔 Only you get the reminder for plans you add.</div>
      <label class="field"><span>Notes (optional)</span><textarea name="notes" rows="2">${esc(e?.notes || '')}</textarea></label>
      <button class="btn primary block" type="submit">Save</button>
    </form>`);
  if (!e) setTimeout(() => $('#modal input[name=title]')?.focus(), 80);
}

function openNameSheet() {
  openSheet(`<h3 style="margin-bottom:14px">Your name</h3>
    <form data-form="name"><input name="name" value="${esc(myName())}" autocomplete="name">
    <button class="btn primary block" type="submit" style="margin-top:14px">Save</button></form>`);
  setTimeout(() => $('#modal input[name=name]')?.focus(), 80);
}

function openComments(postId) {
  const p = S.posts.find((x) => x.id === postId);
  if (!p) return;
  openSheet(`<div class="sheet-head"><h3>Comments</h3></div>
    ${p.comments.length ? p.comments.map((c) => `<div class="comment">${avatar(nameOf(c.by), colorOf(c.by), 30)}
      <div class="inset small grow"><b>${esc(isMine(c.by) ? myName() : partnerName())}</b> ${esc(c.text)}
      <div class="tiny muted" style="margin-top:2px">${timeAgo(toDate(c.at))}</div></div></div>`).join('')
      : '<div class="muted small center" style="padding:10px">No comments yet.</div>'}
    <form data-form="comment" data-id="${p.id}" class="hstack" style="margin-top:14px">
      <input name="text" class="grow" placeholder="Write a comment…" autocomplete="off">
      <button class="icon-btn primary" type="submit" aria-label="Send">${icon('send', 18)}</button>
    </form>`);
  setTimeout(() => $('#modal input[name=text]')?.focus(), 80);
}

// Story composer (photo or text). Also used by the Home "Snap" button.
let storyDraft = { photo: null, bg: STORY_BGS[0] };
function openStorySheet(photo = null) {
  storyDraft = { photo, bg: storyDraft.bg || STORY_BGS[0] };
  openSheet(`<div class="sheet-head"><h3>${photo ? 'Share this moment' : 'New story'}</h3></div>
    <form data-form="story">
      <div id="storyPreview">${storyPreviewHtml()}</div>
      <label class="field" style="margin-top:12px"><span>${photo ? 'Caption (optional)' : 'Your message'}</span>
        <input name="text" maxlength="140" placeholder="${photo ? 'e.g. Miss you 💙' : 'Type something sweet…'}" autocomplete="off" data-input="story-text"></label>
      <div class="hstack" style="margin-bottom:12px">
        <label class="btn sm" style="cursor:pointer">${icon('camera', 18)} ${photo ? 'Retake' : 'Add photo'}<input type="file" accept="image/*" capture="environment" data-change="story-photo" hidden></label>
        <label class="btn sm" style="cursor:pointer">${icon('image', 18)} Gallery<input type="file" accept="image/*" data-change="story-photo" hidden></label>
      </div>
      <div class="tiny muted" style="margin-bottom:12px">Stories show for ${STORY_HOURS} hours. Photos also appear on Home.</div>
      <button class="btn primary block" type="submit">${icon('send', 18)} Share</button>
    </form>`);
}
function storyPreviewHtml() {
  if (storyDraft.photo) return `<img src="${storyDraft.photo}" alt="" style="width:100%;max-height:320px;object-fit:cover;border-radius:18px">`;
  return `<div id="textStory" style="background:${storyDraft.bg};color:#fff;border-radius:18px;min-height:180px;display:grid;place-items:center;padding:20px;font-size:22px;font-weight:800;text-align:center">Aa</div>
    <div class="hstack" style="margin-top:10px;gap:8px">${STORY_BGS.map((c) => `<button type="button" class="swatch ${c === storyDraft.bg ? 'on' : ''}" style="background:${c}" data-action="story-bg" data-color="${c}" aria-label="Colour"></button>`).join('')}</div>`;
}

// ==== VIEWERS (full-screen photo + stories) ==================================

function closeViewer() {
  const v = $('#viewer');
  clearTimeout(storyTimer);
  v.hidden = true;
  v.innerHTML = '';
  if ($('#modal').hidden) document.body.classList.remove('noscroll');
  if (reminderQueue.length) setTimeout(showReminderPopup, 300);
}

function openPhotoViewer(photoId) {
  const v = $('#viewer');
  v.innerHTML = `<div class="viewer">
    <div class="head"><span class="grow"></span>
      <button class="icon-btn" data-action="save-photo" data-id="${esc(photoId)}" aria-label="Save">${icon('download')}</button>
      <button class="icon-btn" data-action="close-viewer" aria-label="Close">${icon('close')}</button></div>
    <div class="stage" data-action="close-viewer">${photoImg(photoId, '', false)}</div></div>`;
  v.hidden = false;
  document.body.classList.add('noscroll');
  hydratePhotos();
}

let storyState = { list: [], i: 0 };
let storyTimer = null;
function openStories(owner) {
  const list = activeStories(owner);
  if (!list.length) return;
  const firstUnseen = list.findIndex((s) => !s.seenBy.includes(uid()));
  storyState = { list, i: isMine(owner) || firstUnseen < 0 ? 0 : firstUnseen };
  $('#viewer').hidden = false;
  document.body.classList.add('noscroll');
  showStory();
}
function showStory() {
  clearTimeout(storyTimer);
  const { list, i } = storyState;
  const s = list[i];
  if (!s) { closeViewer(); return; }
  const mine = isMine(s.authorUid);
  if (!mine && !s.seenBy.includes(uid())) { s.seenBy.push(uid()); patch('stories', s.id, { seenBy: arrayUnion(uid()) }); }
  const name = mine ? myName() : partnerName();
  const seenByPartner = mine && hasPartner() && s.seenBy.includes(S.partner.uid);
  const dur = s.photoId ? 6 : 5;
  $('#viewer').innerHTML = `<div class="viewer" style="--dur:${dur}s">
    <div class="bars">${list.map((_, j) => `<i class="${j < i ? 'done' : j === i ? 'now' : ''}"><b></b></i>`).join('')}</div>
    <div class="head">${avatar(name, colorOf(s.authorUid), 34)}<div class="grow"><b>${esc(name)}</b><div class="tiny" style="opacity:.75">${timeAgo(s.createdAt)}</div></div>
      ${mine ? `<button class="icon-btn" data-action="del-story" data-id="${s.id}" aria-label="Delete">${icon('trash')}</button>` : ''}
      <button class="icon-btn" data-action="close-viewer" aria-label="Close">${icon('close')}</button></div>
    <div class="stage">
      ${s.photoId ? photoImg(s.photoId, '', false) : `<div class="text-story" style="background:${esc(s.bg || COLORS.primary)}">${esc(s.text)}</div>`}
      ${s.photoId && s.text ? `<div class="caption">${esc(s.text)}</div>` : ''}
      <div class="tap-l" data-action="story-prev"></div><div class="tap-r" data-action="story-next"></div>
    </div>
    <div class="foot">${mine ? `<span class="small" style="opacity:.8">${seenByPartner ? `Seen by ${esc(partnerName())} ✓` : 'Not seen yet'}</span>`
      : `${s.photoId ? `<button class="btn sm" data-action="save-photo" data-id="${esc(s.photoId)}">${icon('download', 16)} Save</button>` : ''}
         <button class="btn sm" data-action="story-love" data-id="${s.id}">❤️ Love</button>`}</div>
  </div>`;
  hydratePhotos();
  storyTimer = setTimeout(() => { storyState.i++; showStory(); }, dur * 1000);
}

function savePhotoToDevice(photoId) {
  const data = photoCache.get(photoId);
  if (!data) { toast('Photo is still loading…'); return; }
  const a = document.createElement('a');
  a.href = data;
  a.download = `ournest-${photoId.slice(0, 6)}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Saved — set it as your wallpaper from your Gallery 💙');
}

// ==== TOAST ==================================================================

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ==== ACTIONS (buttons with data-action) =====================================

const byId = (list, id) => list.find((x) => x.id === id);

async function shareCode() {
  const code = S.couple?.inviteCode || '';
  const text = `Join me on OurNest 💙\n1) Open ${location.origin}${location.pathname}\n2) Sign up, tap "Join", and enter: ${code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'OurNest invite', text }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(code); toast('Invite code copied'); } catch { toast(`Your code: ${code}`); }
}

function applyTheme() {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#0E1626' : '#3B82F6');
}

function handleBootLink() {
  if (bootHandled) return;
  bootHandled = true;
  const p = new URLSearchParams(location.search);
  const tab = p.get('tab');
  const action = p.get('action');
  if (tab && (NAV.some(([t]) => t === tab) || tab === 'settings')) S.tab = tab;
  if (action || tab) history.replaceState(null, '', location.pathname);
  setTimeout(() => {
    if (action === 'expense') openTxnEditor(null, 'expense');
    if (action === 'snap') openStorySheet(null);
  }, 400);
}

const actions = {
  'tab': (el) => goTab(el.dataset.tab),
  'auth-mode': () => { S.authMode = S.authMode === 'signin' ? 'signup' : 'signin'; renderNow(); },
  'forgot': async () => {
    const email = $('[data-form=auth] input[name=email]')?.value.trim();
    if (!email) return toast('Type your email first, then tap "Forgot password".');
    try { await sendPasswordResetEmail(auth, email); toast('Password reset email sent. Check your inbox.'); } catch (e) { toast(authError(e)); }
  },
  'signout': async () => {
    if (!(await ask('Sign out?', 'Your data stays safe in your shared space.', 'Sign out'))) return;
    stopTracking();
    S.tab = 'home';
    lastMsgTime = null;
    await signOut(auth);
  },
  'create-couple': () => createCouple(),
  'share-code': () => shareCode(),
  'goto-bills': () => { S.moneyTab = 'bills'; S.who = 'all'; goTab('money'); },
  'goto-overview': () => { S.moneyTab = 'overview'; S.month = firstOfMonth(new Date()); subscribeTxns(); goTab('money'); },
  'fab': () => {
    if (S.tab === 'plan') return openEventSheet(null, S.calDay);
    ({
      overview: () => openTxnEditor(null),
      activity: () => openTxnEditor(null),
      budgets: () => openBudgetSheet(null),
      goals: () => openGoalSheet(null),
      bills: () => openBillSheet(null),
    })[S.moneyTab]();
  },

  // money
  'money-tab': (el) => { S.moneyTab = el.dataset.mtab; if (S.tab !== 'money') goTab('money'); else renderTab(); },
  'who': (el) => { S.who = el.dataset.who; renderTab(); },
  'month': (el) => {
    S.month = new Date(S.month.getFullYear(), S.month.getMonth() + Number(el.dataset.delta), 1);
    subscribeTxns();
    renderTab();
  },
  'new-txn': (el) => openTxnEditor(null, el.dataset.type),
  'edit-txn': (el) => { const x = byId(S.txns, el.dataset.id); if (x) openTxnEditor(x); },
  'txn-type': (el) => {
    const form = el.closest('form');
    const type = el.dataset.type;
    form.elements.type.value = type;
    $$('[data-action=txn-type]', form).forEach((b) => b.classList.toggle('on', b === el));
    const cat = type === 'income' ? 'Salary' : 'Food';
    form.elements.category.value = cat;
    $('#catChips', form).innerHTML = catChips(type, cat);
  },
  'pick': (el) => {
    const form = el.closest('form');
    form.elements[el.dataset.name].value = el.dataset.value;
    $$(`[data-action=pick][data-name="${el.dataset.name}"]`, form).forEach((b) => b.classList.toggle('on', b === el));
  },
  'delete-txn': async (el) => { if (await ask('Delete this entry?', 'This removes it for both of you.', 'Delete')) remove('transactions', el.dataset.id); },
  'edit-budget': (el) => openBudgetSheet(byId(S.budgets, el.dataset.id)),
  'delete-budget': async (el) => { if (await ask('Delete this budget?', 'Your entries stay; only the limit is removed.', 'Delete')) remove('budgets', el.dataset.id); },
  'goal': (el) => { const g = byId(S.goals, el.dataset.id); if (g) openGoalMoney(g); },
  'edit-goal': (el) => openGoalSheet(byId(S.goals, el.dataset.id)),
  'delete-goal': async (el) => { if (await ask('Delete this goal?', 'This removes it for both of you.', 'Delete')) remove('goals', el.dataset.id); },
  'edit-bill': (el) => openBillSheet(byId(S.bills, el.dataset.id)),
  'delete-bill': async (el) => { if (await ask('Delete this bill?', 'This removes it for both of you.', 'Delete')) remove('bills', el.dataset.id); },
  'toggle-bill': async (el) => {
    const b = byId(S.bills, el.dataset.id);
    if (!b) return;
    const key = monthKey(S.month);
    const paid = el.checked;
    patch('bills', b.id, { paidMonths: paid ? arrayUnion(key) : arrayRemove(key) });
    if (!paid) return;
    if (!(await ask('Add to expenses?', `Record ${money(b.amount)} for "${b.title}" as a Bills expense?`, 'Add'))) return;
    const now = new Date();
    save('transactions', {
      type: 'expense', amount: b.amount, category: 'Bills', note: b.title,
      date: Timestamp.fromDate(sameMonth(S.month, now) ? now : dueIn(b, S.month)),
      ownerUid: uid(), shared: !!b.shared, updatedAt: Timestamp.now(),
    });
    toast('Added to expenses');
  },

  // plan
  'plan-tab': (el) => { S.planTab = el.dataset.ptab; renderTab(); },
  'cal-month': (el) => { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + Number(el.dataset.delta), 1); renderTab(); },
  'cal-today': () => { S.calMonth = firstOfMonth(new Date()); S.calDay = startOfDay(new Date()); renderTab(); },
  'pick-day': (el) => {
    const d = parseDateTime(el.dataset.date, '00:00');
    S.calDay = d;
    if (!sameMonth(d, S.calMonth)) S.calMonth = firstOfMonth(d);
    renderTab();
  },
  'open-day': (el) => {
    const d = parseDateTime(el.dataset.date, '00:00');
    S.calDay = d; S.calMonth = firstOfMonth(d); S.planTab = 'calendar';
    goTab('plan');
  },
  'new-event': () => openEventSheet(null, S.tab === 'plan' ? S.calDay : startOfDay(new Date())),
  'edit-event': (el) => { const e = byId(S.events, el.dataset.id); if (e) openEventSheet(e); },
  'toggle-event': (el) => patch('events', el.dataset.id, { done: el.checked }),
  'event-done': (el) => {
    patch('events', el.dataset.id, { done: true });
    el.closest('.row')?.remove();
    if (!$$('#modal [data-action=event-done]').length) closeSheet();
  },
  'snooze': (el) => {
    patch('events', el.dataset.id, { snoozeUntil: Timestamp.fromDate(new Date(Date.now() + 3600000)), notifiedAt: null });
    el.closest('.row')?.remove();
    toast('Snoozed for 1 hour');
    if (!$$('#modal [data-action=snooze]').length) closeSheet();
  },
  'delete-event': async (el) => { if (await ask('Delete this plan?', 'This removes it from the calendar.', 'Delete')) remove('events', el.dataset.id); },

  // lists
  'list-tab': (el) => { S.listName = el.dataset.list; renderTab(); },
  'toggle-item': (el) => patch('items', el.dataset.id, { done: el.checked }),
  'del-item': (el) => remove('items', el.dataset.id),
  'clear-done': () => S.items.filter((i) => i.done && (i.list || 'To-do') === S.listName).forEach((i) => remove('items', i.id)),

  // moments
  'mood': (el) => {
    S.mood = S.mood === el.dataset.mood ? '' : el.dataset.mood;
    $$('.mood').forEach((b) => b.classList.toggle('on', b.dataset.mood === S.mood));
  },
  'clear-post-photo': () => { S.postPhoto = null; $('#postPreview').innerHTML = ''; },
  'heart': (el) => {
    const p = byId(S.posts, el.dataset.id);
    if (!p) return;
    patch('updates', p.id, { hearts: p.hearts.includes(uid()) ? arrayRemove(uid()) : arrayUnion(uid()) });
  },
  'comments': (el) => openComments(el.dataset.id),
  'del-post': async (el) => { if (await ask('Delete this post?', 'It will be removed for both of you.', 'Delete')) remove('updates', el.dataset.id); },
  'new-story': () => openStorySheet(null),
  'snap': () => $('#snapInput').click(),
  'story-bg': (el) => {
    storyDraft.bg = el.dataset.color;
    const box = $('#textStory');
    if (box) box.style.background = storyDraft.bg;
    $$('[data-action=story-bg]').forEach((b) => b.classList.toggle('on', b === el));
  },
  'open-stories': (el) => openStories(el.dataset.owner),
  'story-next': () => { storyState.i++; showStory(); },
  'story-prev': () => { storyState.i = Math.max(0, storyState.i - 1); showStory(); },
  'story-love': (el) => {
    const s = byId(S.stories, el.dataset.id);
    if (!s) return;
    save('messages', { from: uid(), text: `❤️ Loved your story${s.text ? `: "${s.text.slice(0, 40)}"` : ''}`, createdAt: Timestamp.now(), seenBy: [] });
    toast('Sent ❤️');
  },
  'del-story': async (el) => {
    clearTimeout(storyTimer);
    const id = el.dataset.id;
    closeViewer();
    if (await ask('Delete this story?', 'It will disappear for both of you.', 'Delete')) remove('stories', id);
  },
  'view-photo': (el) => openPhotoViewer(el.dataset.id),
  'save-photo': (el) => savePhotoToDevice(el.dataset.id),
  'close-viewer': () => closeViewer(),

  // map
  'focus': (el) => {
    const loc = el.dataset.who === 'me' ? S.locs[uid()] : S.partner ? S.locs[S.partner.uid] : null;
    if (leafletMap && loc && (loc.lat || loc.lng)) leafletMap.setView([loc.lat, loc.lng], 16);
  },
  'checkin': async (el) => {
    el.disabled = true;
    const pos = await getPosition();
    el.disabled = false;
    if (pos) await pushPosition(pos);
    save('updates', {
      authorUid: uid(), text: el.dataset.label, mood: el.dataset.emoji, kind: 'checkin',
      createdAt: Timestamp.now(), hearts: [], comments: [],
      ...(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}),
    });
    toast(pos ? `Check-in sent to ${partnerName()} 💙` : 'Check-in sent (without location — GPS is off).');
  },

  // settings
  'edit-name': () => openNameSheet(),
  'set-theme': (el) => { prefs.theme = el.dataset.value; savePrefs(); applyTheme(); renderTab(); },
  'set-home-money': (el) => { prefs.homeMoney = el.dataset.value; savePrefs(); renderTab(); },
  'install': async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    renderTab();
  },

  // sheets
  'close-modal': () => closeSheet(),
  'ask-yes': () => { const r = askResolve; askResolve = null; closeSheet(); r?.(true); },
  'ask-no': () => closeSheet(),
};

// ==== FORMS (data-form) ======================================================

const forms = {
  'auth': async (form) => {
    const f = new FormData(form);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (S.authMode === 'signup') {
        const name = String(f.get('name') || '').trim();
        pendingName = name;
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        updateProfile(cred.user, { displayName: name }).catch(warn);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      toast(authError(e));
      btn.disabled = false;
    }
  },
  'join': async (form) => {
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Joining…';
    const err = await joinCouple(form.elements.code.value);
    if (err) { toast(err); btn.disabled = false; btn.textContent = 'Join'; }
  },
  'txn': (form) => {
    const f = new FormData(form);
    const amount = parseAmount(f.get('amount'));
    if (!(amount > 0)) return toast('Enter an amount greater than zero.');
    save('transactions', {
      type: f.get('type'),
      amount,
      category: f.get('category'),
      note: String(f.get('note') || '').trim(),
      date: Timestamp.fromDate(parseDateInput(f.get('date'))),
      ownerUid: form.dataset.owner || uid(),
      shared: f.get('shared') === 'on',
      updatedAt: Timestamp.now(),
    }, form.dataset.id || null);
    closeSheet();
    toast('Saved');
  },
  'budget': (form) => {
    const f = new FormData(form);
    const limitV = parseAmount(f.get('limit'));
    if (!(limitV > 0)) return toast('Enter a monthly limit.');
    save('budgets', { category: f.get('category'), limit: limitV, shared: f.get('shared') === 'on', ownerUid: form.dataset.owner || uid() }, form.dataset.id || null);
    closeSheet();
  },
  'goal': (form) => {
    const f = new FormData(form);
    const target = parseAmount(f.get('target'));
    const title = String(f.get('title') || '').trim();
    if (!title || !(target > 0)) return toast('Add a goal name and a target amount.');
    const data = { title, emoji: f.get('emoji'), target, shared: f.get('shared') === 'on', ownerUid: form.dataset.owner || uid() };
    if (!form.dataset.id) data.saved = 0;
    save('goals', data, form.dataset.id || null);
    closeSheet();
  },
  'goal-money': (form, e) => {
    const amount = parseAmount(form.elements.amount.value);
    if (!(amount > 0)) return toast('Enter an amount.');
    const dir = e.submitter?.value === 'out' ? -1 : 1;
    patch('goals', form.dataset.id, { saved: increment(dir * amount) });
    closeSheet();
    toast(dir > 0 ? 'Savings added 🎉' : 'Withdrawn');
  },
  'bill': (form) => {
    const f = new FormData(form);
    const title = String(f.get('title') || '').trim();
    const amount = parseAmount(f.get('amount'));
    const dueDay = parseInt(f.get('dueDay'), 10);
    if (!title || !(amount > 0) || !(dueDay >= 1 && dueDay <= 31)) return toast('Fill in a name, amount, and a due day from 1 to 31.');
    const data = { title, amount, dueDay, shared: f.get('shared') === 'on', ownerUid: form.dataset.owner || uid() };
    if (!form.dataset.id) data.paidMonths = [];
    save('bills', data, form.dataset.id || null);
    closeSheet();
  },
  'event': (form) => {
    const f = new FormData(form);
    const title = String(f.get('title') || '').trim();
    if (!title) return toast('Give your plan a name.');
    const allDay = f.get('allDay') === 'on';
    const date = parseDateTime(f.get('date'), allDay ? '00:00' : f.get('time'));
    const existing = form.dataset.id ? byId(S.events, form.dataset.id) : null;
    const remind = Number(f.get('remind'));
    const data = {
      title,
      kind: f.get('kind'),
      private: f.get('scope') === 'me',
      date: Timestamp.fromDate(date),
      allDay,
      remind,
      notes: String(f.get('notes') || '').trim(),
      updatedAt: Timestamp.now(),
      // Changing the time resets the reminder so it can fire again.
      notifiedAt: null,
      snoozeUntil: null,
    };
    if (!existing) Object.assign(data, { createdBy: uid(), done: false, createdAt: Timestamp.now() });
    // Only the creator can make a plan "just me".
    if (existing && !isMine(existing.createdBy)) data.private = false;
    save('events', data, existing?.id || null);
    closeSheet();
    S.calDay = startOfDay(date);
    S.calMonth = firstOfMonth(date);
    toast(remind >= 0 ? 'Saved — we\'ll remind you 🔔' : 'Saved');
    if (remind >= 0 && !prefs.notify && 'Notification' in window && Notification.permission === 'default') {
      setTimeout(() => toast('Tip: turn on notifications in Settings to get alerts.'), 3400);
    }
  },
  'post': (form) => {
    const text = form.elements.text.value.trim();
    if (!text && !S.mood && !S.postPhoto) return;
    const photoId = S.postPhoto ? savePhoto(S.postPhoto) : null;
    save('updates', {
      authorUid: uid(), text, mood: S.mood, kind: 'post', createdAt: Timestamp.now(), hearts: [], comments: [],
      ...(photoId ? { photoId } : {}),
    });
    form.reset();
    S.mood = '';
    S.postPhoto = null;
    $('#postPreview').innerHTML = '';
    $$('.mood').forEach((b) => b.classList.remove('on'));
    form.elements.text.blur();
  },
  'comment': (form) => {
    const text = form.elements.text.value.trim();
    if (!text) return;
    const id = form.dataset.id;
    const c = { by: uid(), text, at: Date.now() };
    const p = byId(S.posts, id);
    if (p) p.comments = [...p.comments, c];
    patch('updates', id, { comments: arrayUnion(c) });
    openComments(id);
  },
  'story': (form) => {
    const text = form.elements.text.value.trim();
    if (!storyDraft.photo && !text) return toast('Add a photo or type a message.');
    const photoId = storyDraft.photo ? savePhoto(storyDraft.photo) : null;
    save('stories', {
      authorUid: uid(), text, bg: storyDraft.bg, createdAt: Timestamp.now(), seenBy: [],
      ...(photoId ? { photoId } : {}),
    });
    storyDraft.photo = null;
    closeSheet();
    toast(hasPartner() ? `Shared with ${partnerName()} 💙` : 'Shared 💙');
  },
  'chat': (form) => {
    const text = form.elements.text.value.trim();
    if (!text) return;
    save('messages', { from: uid(), text, createdAt: Timestamp.now(), seenBy: [] });
    form.reset();
    form.elements.text.style.height = '';
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  },
  'item': (form) => {
    const text = form.elements.text.value.trim();
    if (!text) return;
    save('items', { list: S.listName, text, done: false, addedBy: uid(), createdAt: Timestamp.now() });
    form.reset();
  },
  'name': (form) => {
    const name = form.elements.name.value.trim();
    if (!name) return;
    updateDoc(doc(db, 'users', uid()), { name }).catch(warn);
    S.me = { ...S.me, name };
    closeSheet();
    render();
  },
};

// ==== CHANGE EVENTS (data-change) ============================================

const changes = {
  'sharing': (el) => setSharing(el.checked),
  'notify': (el) => enableNotifications(el.checked),
  'anniv': (el) => {
    const v = el.value;
    updateDoc(doc(db, 'couples', S.couple.id), { anniversary: v ? Timestamp.fromDate(parseDateInput(v)) : null }).catch(warn);
  },
  'currency': (el) => updateDoc(doc(db, 'couples', S.couple.id), { currency: el.value }).catch(warn),
  'allday': (el) => { const tf = $('#timeField'); if (tf) tf.hidden = el.checked; },
  'post-photo': async (el) => {
    const data = await pickPhoto(el.files[0]);
    el.value = '';
    if (!data) return;
    S.postPhoto = data;
    $('#postPreview').innerHTML = postPreviewHtml();
  },
  'chat-photo': async (el) => {
    const data = await pickPhoto(el.files[0]);
    el.value = '';
    if (!data) return;
    const photoId = savePhoto(data);
    save('messages', { from: uid(), text: '', photoId, createdAt: Timestamp.now(), seenBy: [] });
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  },
  'story-photo': async (el) => {
    const data = await pickPhoto(el.files[0]);
    el.value = '';
    if (!data) return;
    const text = $('#modal input[name=text]')?.value || '';
    openStorySheet(data);
    const input = $('#modal input[name=text]');
    if (input) input.value = text;
  },
};

// ==== WIRING =================================================================

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (e.target.closest('a[href]')) return; // real links (directions, maps) open normally
  if (el.type !== 'checkbox') e.preventDefault();
  fn(el, e);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form]?.(form, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) changes[el.dataset.change]?.(el, e);
});

document.addEventListener('input', (e) => {
  // Live preview text for text stories; grow the chat box as you type.
  if (e.target.matches('[data-input=story-text]') && !storyDraft.photo) {
    const box = $('#textStory');
    if (box) box.textContent = e.target.value || 'Aa';
  }
  if (e.target.matches('.chat-bar textarea')) {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }
});

// Enter sends (Shift+Enter = new line) in post and chat boxes.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('[data-form=post] textarea, [data-form=chat] textarea')) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
  if (e.key === 'Escape') {
    if (!$('#viewer').hidden) closeViewer();
    else if (!$('#modal').hidden) closeSheet();
  }
});

// Home "Snap" button → camera → share as a moment.
$('#snapInput').addEventListener('change', async (e) => {
  const data = await pickPhoto(e.target.files[0]);
  e.target.value = '';
  if (data) openStorySheet(data);
});

function updateOnline() { $('#offline').hidden = navigator.onLine; }
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (prefs.theme === 'auto') applyTheme(); });
applyTheme();

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { checkReminders(); if (S.tab === 'chat') markChatSeen(); render(); }
});

// Check reminders every 30 seconds; refresh "x min ago" labels every minute.
setInterval(checkReminders, 30000);
setInterval(() => { if (screenName() === 'app' && ['home', 'map', 'chat'].includes(S.tab)) render(); }, 60000);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (S.tab === 'settings') render();
});

// Install as an app + offline support + notifications
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(warn);
}

if (configured) startAuth();
renderNow(true);
