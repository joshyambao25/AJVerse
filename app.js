// =============================================================================
// OurNest — shared budget, location and updates for two.
// Plain JavaScript + Firebase. Edit freely in VS Code.
// =============================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDocFromServer, writeBatch,
  query, where, orderBy, limit, Timestamp, arrayUnion, arrayRemove, increment,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// -----------------------------------------------------------------------------
// Settings you may want to change
// -----------------------------------------------------------------------------

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
const DEFAULT_MAP_CENTER = [14.5995, 120.9842]; // Manila
const COLORS = { me: '#3B82F6', partner: '#F2789F', shared: '#14B8A6', income: '#16A34A', expense: '#E11D48', warn: '#F59E0B', primary: '#3B82F6' };

// -----------------------------------------------------------------------------
// Firebase
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// App state
// -----------------------------------------------------------------------------

const S = {
  booting: true,
  user: null,
  me: null,
  partner: null,
  couple: null,
  coupleReady: false,
  tab: 'home',
  moneyTab: 'activity',
  who: 'all',
  month: firstOfMonth(new Date()),
  listName: 'Groceries',
  mood: '',
  authMode: 'signin',
  txns: [],
  homeTxns: [],
  budgets: [],
  goals: [],
  bills: [],
  posts: [],
  items: [],
  locs: {},
  loaded: {},
};

let pendingName = null;
let createdCoupleId = null;
let listeningCid = null;
let partnerId = null;
let userUnsub = null, coupleUnsub = null, partnerUnsub = null, txnUnsub = null;
let dataUnsubs = [];
let resubTimer = null;
let askResolve = null;

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v instanceof Date ? v : new Date());
const warn = (e) => console.warn(e);

function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function dateInputValue(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDateInput(s) {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  const now = new Date();
  if (y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate()) return now;
  return new Date(y, m - 1, d, 12, 0, 0);
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

// Who filter: all / mine / partner / shared
function whoMatch(shared, owner) {
  switch (S.who) {
    case 'mine': return !shared && isMine(owner);
    case 'partner': return !shared && !isMine(owner);
    case 'shared': return !!shared;
    default: return true;
  }
}

// -----------------------------------------------------------------------------
// Icons (simple inline SVG)
// -----------------------------------------------------------------------------

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  map: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  nav: '<path d="M3 11 21 3l-8 18-2-8z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
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
const ownerTag = (shared, owner) => (shared ? tag('Shared', COLORS.shared) : tag(nameOf(owner), isMine(owner) ? COLORS.me : COLORS.partner));
const empty = (emoji, text) => `<div class="empty"><div class="bubble">${emoji}</div>${esc(text).replace(/\n/g, '<br>')}</div>`;

// -----------------------------------------------------------------------------
// Firestore writes (fire-and-forget: saved on the phone first, synced later)
// -----------------------------------------------------------------------------

const col = (name) => collection(db, 'couples', S.couple.id, name);
function save(name, data, id) {
  const ref = id ? doc(col(name), id) : doc(col(name));
  setDoc(ref, data, { merge: true }).catch(warn);
}
function patch(name, id, data) { updateDoc(doc(col(name), id), data).catch(warn); }
function remove(name, id) { deleteDoc(doc(col(name), id)).catch(warn); }

// -----------------------------------------------------------------------------
// Auth & profile
// -----------------------------------------------------------------------------

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
    default: return e?.message || 'Something went wrong.';
  }
}

// -----------------------------------------------------------------------------
// Couple space
// -----------------------------------------------------------------------------

function stopCouple() {
  coupleUnsub?.(); partnerUnsub?.(); txnUnsub?.();
  dataUnsubs.forEach((u) => u());
  coupleUnsub = partnerUnsub = txnUnsub = null;
  dataUnsubs = [];
  listeningCid = null;
  partnerId = null;
  S.couple = null;
  S.partner = null;
  S.coupleReady = false;
  Object.assign(S, { txns: [], homeTxns: [], budgets: [], goals: [], bills: [], posts: [], items: [], locs: {}, loaded: {} });
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
function monthQuery(month) {
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return query(col('transactions'),
    where('date', '>=', Timestamp.fromDate(month)),
    where('date', '<', Timestamp.fromDate(end)),
    orderBy('date', 'desc'));
}

function subscribeData() {
  dataUnsubs.forEach((u) => u());
  dataUnsubs = [];
  const onErr = (e) => { warn(e); scheduleResub(); };
  const watch = (q, key, map) => dataUnsubs.push(onSnapshot(q, (snap) => {
    S[key] = map(snap);
    S.loaded[key] = true;
    render();
  }, onErr));

  watch(monthQuery(firstOfMonth(new Date())), 'homeTxns', mapTxns);
  watch(col('budgets'), 'budgets', (s) => mapDocs(s).map((b) => ({ ...b, limit: num(b.limit) })).sort((a, b) => String(a.category).localeCompare(b.category)));
  watch(col('goals'), 'goals', (s) => mapDocs(s).map((g) => ({ ...g, target: num(g.target), saved: num(g.saved) })));
  watch(col('bills'), 'bills', (s) => mapDocs(s).map((b) => ({ ...b, amount: num(b.amount), dueDay: num(b.dueDay) || 1, paidMonths: b.paidMonths || [] })).sort((a, b) => a.dueDay - b.dueDay));
  watch(query(col('updates'), orderBy('createdAt', 'desc'), limit(80)), 'posts', (s) => mapDocs(s).map((p) => ({ ...p, createdAt: toDate(p.createdAt), hearts: p.hearts || [] })));
  watch(query(col('items'), orderBy('createdAt')), 'items', mapDocs);
  watch(col('locations'), 'locs', (s) => {
    const o = {};
    s.docs.forEach((d) => { const x = d.data(); o[d.id] = { ...x, lat: num(x.lat), lng: num(x.lng), updatedAt: toDate(x.updatedAt) }; });
    return o;
  });
  subscribeTxns();
}

function subscribeTxns() {
  txnUnsub?.();
  S.loaded.txns = false;
  txnUnsub = onSnapshot(monthQuery(S.month), (snap) => {
    S.txns = mapTxns(snap);
    S.loaded.txns = true;
    render();
  }, (e) => { warn(e); scheduleResub(); });
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

// -----------------------------------------------------------------------------
// Location sharing
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------

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
    <p class="tagline">Money, places and little updates — together.</p>
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
      <p class="muted small" style="margin:6px 0 14px">You'll get a 6-letter code to send to your partner.</p>
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

const NAV = [['home', 'home', 'Home'], ['money', 'wallet', 'Money'], ['map', 'map', 'Places'], ['updates', 'chat', 'Updates'], ['lists', 'list', 'Lists']];
function appShell() {
  return `<main id="view"></main>
    <div id="mapWrap" hidden><div id="map"></div><div id="mapTop"></div><div id="mapPanel"></div></div>
    <div id="fabSlot"></div>
    <nav class="nav"><div class="nav-inner">
      ${NAV.map(([t, ic, label]) => `<button data-action="tab" data-tab="${t}"><span class="ic">${icon(ic)}</span>${label}</button>`).join('')}
    </div></nav>`;
}

function renderTab() {
  $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab || (S.tab === 'settings' && b.dataset.tab === 'home')));
  const view = $('#view');
  const mapWrap = $('#mapWrap');
  const isMap = S.tab === 'map';
  view.hidden = isMap;
  mapWrap.hidden = !isMap;
  $('#fabSlot').innerHTML = S.tab === 'money' ? `<button class="fab" data-action="money-add" aria-label="Add">${icon('plus', 28)}</button>` : '';

  if (isMap) { renderMap(); return; }

  switch (S.tab) {
    case 'home': view.innerHTML = homeView(); break;
    case 'money': view.innerHTML = moneyView(); break;
    case 'settings': view.innerHTML = settingsView(); break;
    case 'updates':
      if (view.dataset.key !== 'updates') view.innerHTML = updatesShell();
      $('#feed').innerHTML = feedHtml();
      break;
    case 'lists':
      if (view.dataset.key !== `lists:${S.listName}`) view.innerHTML = listsShell();
      $('#listItems').innerHTML = listItemsHtml();
      break;
  }
  view.dataset.key = S.tab === 'lists' ? `lists:${S.listName}` : S.tab;
}

// ---------------------------------------------------------------- Home

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

function homeView() {
  const now = new Date();
  const t = sumTxns(S.homeTxns);
  const code = S.couple?.inviteCode || '';

  const header = `<div class="page-head" style="padding-bottom:16px">
      <div class="grow"><div class="muted">${greeting()},</div><h1 class="ellipsis">${esc(myName())}</h1></div>
      <div class="avatars">${avatar(myName(), COLORS.me, 44)}${hasPartner() ? avatar(partnerName(), COLORS.partner, 44) : ''}</div>
      <button class="icon-btn" data-action="tab" data-tab="settings" aria-label="Settings">${icon('settings')}</button>
    </div>`;

  const invite = hasPartner() ? '' : `<div class="card soft hstack">
      <div style="font-size:26px">💌</div>
      <div class="grow"><b>Invite your partner</b><div class="muted small">They sign up, tap "Join", and enter <b style="letter-spacing:2px">${esc(code)}</b></div></div>
      <button class="icon-btn" data-action="share-code" aria-label="Share code">${icon('share')}</button>
    </div>`;

  const pct = (v) => (t.expense > 0 ? (v / t.expense) * 100 : 0);
  const hero = `<div class="hero">
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

  const quick = `<div class="quick">
      <button data-action="new-txn" data-type="expense"><span class="bubble" style="--c:${COLORS.expense}">−</span>Expense</button>
      <button data-action="new-txn" data-type="income"><span class="bubble" style="--c:${COLORS.income}">+</span>Income</button>
      <button data-action="tab" data-tab="updates"><span class="bubble" style="--c:${COLORS.primary}">✏️</span>Update</button>
      <button data-action="tab" data-tab="map"><span class="bubble" style="--c:${COLORS.partner}">📍</span>Check in</button>
    </div>`;

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
        ${last ? `<div style="background:var(--bg);border-radius:14px;padding:10px 12px;margin-top:12px" class="ellipsis">
          ${esc(last.mood || '💬')} ${esc(last.text || 'Checked in')} <span class="muted small">· ${timeAgo(last.createdAt)}</span></div>` : ''}
      </div>`;
  }

  const today = startOfDay(now);
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

  return `<div class="page">${header}${invite}${hero}${quick}${partnerCard}${billsCard}${together}</div>`;
}

// ---------------------------------------------------------------- Money

function moneyView() {
  const whoChips = [
    ['all', 'All', COLORS.primary],
    ['mine', 'You', COLORS.me],
    ...(hasPartner() ? [['partner', partnerName(), COLORS.partner]] : []),
    ['shared', 'Shared', COLORS.shared],
  ].map(([k, label, c]) => `<button class="chip ${S.who === k ? 'on' : ''}" style="--c:${c}" data-action="who" data-who="${k}">${esc(label)}</button>`).join('');

  const tabs = [['activity', 'Activity'], ['budgets', 'Budgets'], ['goals', 'Goals'], ['bills', 'Bills']]
    .map(([k, l]) => `<button class="${S.moneyTab === k ? 'on' : ''}" data-action="money-tab" data-mtab="${k}">${l}</button>`).join('');

  const body = { activity: activityHtml, budgets: budgetsHtml, goals: goalsHtml, bills: billsHtml }[S.moneyTab]();

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

function donut(entries, total) {
  const r = 42, C = 2 * Math.PI * r;
  let off = 0;
  const segs = entries.map(([name, v]) => {
    const len = (v / total) * C;
    const s = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${catOf(name).color}" stroke-width="18"
      stroke-dasharray="${Math.max(len - (entries.length > 1 ? 2 : 0), 0.5)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  }).join('');
  return `<svg viewBox="0 0 120 120" width="120" height="120" style="transform:rotate(-90deg);flex:none">${segs}</svg>`;
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

function dayLabel(d) {
  const diff = daysBetween(d, new Date());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' });
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

  const entries = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  const breakdown = entries.length === 0 ? '' : `<div class="card hstack" style="gap:16px">
      ${donut(entries, t.expense)}
      <div class="grow"><b>Where it went</b>
        ${entries.slice(0, 5).map(([n, v]) => `<div class="hstack small" style="gap:6px;margin-top:4px">
          <i class="dot" style="--c:${catOf(n).color}"></i><span class="grow ellipsis">${esc(n)}</span>
          <span class="muted">${Math.round((v / t.expense) * 100)}%</span></div>`).join('')}
      </div></div>`;

  if (txns.length === 0) return stats + empty('🧾', 'No entries yet for this month.\nTap + to add an income or expense.');

  const groups = new Map();
  for (const x of txns) {
    const k = startOfDay(x.date).getTime();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const list = [...groups.entries()].map(([k, xs]) =>
    `<div class="section-title"><span>${dayLabel(new Date(k))}</span></div><div class="card flush">${xs.map(txnRow).join('')}</div>`).join('');
  return stats + breakdown + list;
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
      <circle cx="29" cy="29" r="${r}" fill="none" stroke="#F4F7FB" stroke-width="6"/>
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

// ---------------------------------------------------------------- Updates

function updatesShell() {
  return `<div class="page">
    <div class="page-head"><h1>Updates</h1></div>
    <div class="card">
      <div class="moods">${MOODS.map((m) => `<button class="mood ${S.mood === m ? 'on' : ''}" data-action="mood" data-mood="${m}">${m}</button>`).join('')}</div>
      <form class="composer-row" data-form="post">
        <textarea name="text" rows="2" placeholder="What's up? e.g. Pauwi na ako 🚌"></textarea>
        <button class="icon-btn primary" type="submit" aria-label="Send">${icon('send', 20)}</button>
      </form>
    </div>
    <div id="feed"></div>
  </div>`;
}

function feedHtml() {
  if (!S.loaded.posts) return `<div class="spinner"></div>`;
  if (S.posts.length === 0) return empty('💬', `Share how your day is going.\n${hasPartner() ? partnerName() : 'Your partner'} will see it here.`);
  return S.posts.map((p) => {
    const mine = isMine(p.authorUid);
    const name = mine ? myName() : partnerName();
    const hearted = p.hearts.includes(uid());
    const place = p.lat != null && p.lng != null
      ? `<a class="btn link small" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">${icon('pin', 16)} View place</a>` : '';
    return `<div class="card">
      <div class="hstack">
        ${avatar(name, mine ? COLORS.me : COLORS.partner, 34)}
        <div class="grow"><b>${esc(name)}</b><div class="tiny muted">${timeAgo(p.createdAt)} · ${fmtTime(p.createdAt)}</div></div>
        ${p.kind === 'checkin' ? tag('Check-in', COLORS.shared) : ''}
        ${mine ? `<button class="icon-btn" data-action="del-post" data-id="${p.id}" aria-label="Delete">${icon('trash', 18)}</button>` : ''}
      </div>
      <div class="post-body">${p.mood ? `<span class="m">${esc(p.mood)}</span>` : ''}<p>${esc(p.text)}</p></div>
      <div class="hstack" style="gap:0">${place}<span class="grow"></span>
        <button class="icon-btn heart ${hearted ? 'on' : ''}" data-action="heart" data-id="${p.id}" aria-label="Love">${icon('heart', 20)}</button>
        ${p.hearts.length ? `<span class="muted small">${p.hearts.length}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------- Lists

function listsShell() {
  return `<div class="page">
    <div class="page-head"><h1>Lists</h1></div>
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
    <i class="dot" style="--c:${isMine(i.addedBy) ? COLORS.me : COLORS.partner};margin:0" title="Added by ${esc(nameOf(i.addedBy))}"></i>
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

// ---------------------------------------------------------------- Settings

function settingsView() {
  const code = S.couple?.inviteCode || '';
  const anniv = S.couple?.anniversary ? toDate(S.couple.anniversary) : null;
  return `<div class="page">
    <div class="page-head"><button class="icon-btn" data-action="tab" data-tab="home" aria-label="Back">${icon('back')}</button><h1>Settings</h1></div>

    <div class="section-title"><span>Profile</span></div>
    <div class="card flush">
      <button class="row" data-action="edit-name">${avatar(myName(), COLORS.me, 36)}
        <span class="grow"><b>${esc(myName())}</b><div class="tiny muted">${esc(S.me?.email || '')}</div></span>${icon('edit', 18)}</button>
      ${hasPartner() ? `<div class="row">${avatar(partnerName(), COLORS.partner, 36)}<span class="grow"><b>${esc(partnerName())}</b><div class="tiny muted">Your partner</div></span></div>` : ''}
    </div>

    <div class="section-title"><span>Our space</span></div>
    <div class="card flush">
      ${hasPartner() ? '' : `<button class="row" data-action="share-code">
        <span class="cat-bubble" style="--c:${COLORS.primary}">🔑</span>
        <span class="grow"><b>Invite code</b><div style="letter-spacing:3px;font-weight:800">${esc(code)}</div></span>${icon('share', 18)}</button>`}
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

    <div class="section-title"><span>About</span></div>
    <div class="card muted small">OurNest saves everything on your phone first, so it works without internet.
      When you're back online, your changes sync to your partner automatically.</div>
    <button class="btn block danger" data-action="signout" style="margin-top:6px">${icon('logout', 18)} Sign out</button>
  </div>`;
}

// ---------------------------------------------------------------- Map

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

// -----------------------------------------------------------------------------
// Sheets (pop-up editors)
// -----------------------------------------------------------------------------

function openSheet(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="backdrop" data-action="close-modal"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() {
  const m = $('#modal');
  m.hidden = true;
  m.innerHTML = '';
  document.body.classList.remove('noscroll');
  if (askResolve) { const r = askResolve; askResolve = null; r(false); }
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

function openNameSheet() {
  openSheet(`<h3 style="margin-bottom:14px">Your name</h3>
    <form data-form="name"><input name="name" value="${esc(myName())}" autocomplete="name">
    <button class="btn primary block" type="submit" style="margin-top:14px">Save</button></form>`);
  setTimeout(() => $('#modal input[name=name]')?.focus(), 80);
}

// -----------------------------------------------------------------------------
// Toast
// -----------------------------------------------------------------------------

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// -----------------------------------------------------------------------------
// Actions (buttons with data-action)
// -----------------------------------------------------------------------------

const byId = (list, id) => list.find((x) => x.id === id);

async function shareCode() {
  const code = S.couple?.inviteCode || '';
  const text = `Join me on OurNest 💙\n1) Open ${location.origin}${location.pathname}\n2) Sign up, tap "Join", and enter: ${code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'OurNest invite', text }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(code); toast('Invite code copied'); } catch { toast(`Your code: ${code}`); }
}

const actions = {
  'tab': (el) => { S.tab = el.dataset.tab; window.scrollTo(0, 0); renderTab(); },
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
    await signOut(auth);
  },
  'create-couple': () => createCouple(),
  'share-code': () => shareCode(),
  'goto-bills': () => { S.tab = 'money'; S.moneyTab = 'bills'; S.who = 'all'; window.scrollTo(0, 0); renderTab(); },

  // money
  'money-tab': (el) => { S.moneyTab = el.dataset.mtab; renderTab(); },
  'who': (el) => { S.who = el.dataset.who; renderTab(); },
  'month': (el) => {
    S.month = new Date(S.month.getFullYear(), S.month.getMonth() + Number(el.dataset.delta), 1);
    subscribeTxns();
    renderTab();
  },
  'money-add': () => ({
    activity: () => openTxnEditor(null),
    budgets: () => openBudgetSheet(null),
    goals: () => openGoalSheet(null),
    bills: () => openBillSheet(null),
  })[S.moneyTab](),
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

  // updates
  'mood': (el) => {
    S.mood = S.mood === el.dataset.mood ? '' : el.dataset.mood;
    $$('.mood').forEach((b) => b.classList.toggle('on', b.dataset.mood === S.mood));
  },
  'heart': (el) => {
    const p = byId(S.posts, el.dataset.id);
    if (!p) return;
    patch('updates', p.id, { hearts: p.hearts.includes(uid()) ? arrayRemove(uid()) : arrayUnion(uid()) });
  },
  'del-post': async (el) => { if (await ask('Delete this update?', 'It will be removed for both of you.', 'Delete')) remove('updates', el.dataset.id); },

  // lists
  'list-tab': (el) => { S.listName = el.dataset.list; renderTab(); },
  'toggle-item': (el) => patch('items', el.dataset.id, { done: el.checked }),
  'del-item': (el) => remove('items', el.dataset.id),
  'clear-done': () => S.items.filter((i) => i.done && (i.list || 'To-do') === S.listName).forEach((i) => remove('items', i.id)),

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
      createdAt: Timestamp.now(), hearts: [],
      ...(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}),
    });
    toast(pos ? `Check-in sent to ${partnerName()} 💙` : 'Check-in sent (without location — GPS is off).');
  },

  // settings
  'edit-name': () => openNameSheet(),

  // sheets
  'close-modal': () => closeSheet(),
  'ask-yes': () => { const r = askResolve; askResolve = null; closeSheet(); r?.(true); },
  'ask-no': () => closeSheet(),
};

// -----------------------------------------------------------------------------
// Forms (data-form)
// -----------------------------------------------------------------------------

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
  'post': (form) => {
    const text = form.elements.text.value.trim();
    if (!text && !S.mood) return;
    save('updates', { authorUid: uid(), text, mood: S.mood, kind: 'post', createdAt: Timestamp.now(), hearts: [] });
    form.reset();
    S.mood = '';
    $$('.mood').forEach((b) => b.classList.remove('on'));
    form.elements.text.blur();
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

// -----------------------------------------------------------------------------
// Change events (data-change)
// -----------------------------------------------------------------------------

const changes = {
  'sharing': (el) => setSharing(el.checked),
  'anniv': (el) => {
    const v = el.value;
    updateDoc(doc(db, 'couples', S.couple.id), { anniversary: v ? Timestamp.fromDate(parseDateInput(v)) : null }).catch(warn);
  },
  'currency': (el) => updateDoc(doc(db, 'couples', S.couple.id), { currency: el.value }).catch(warn),
};

// -----------------------------------------------------------------------------
// Wiring
// -----------------------------------------------------------------------------

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

// Send post with Enter (Shift+Enter for new line)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('[data-form=post] textarea')) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
  if (e.key === 'Escape' && !$('#modal').hidden) closeSheet();
});

function updateOnline() { $('#offline').hidden = navigator.onLine; }
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

// Refresh "x min ago" labels every minute
setInterval(() => { if (screenName() === 'app' && ['home', 'map', 'updates'].includes(S.tab)) render(); }, 60000);

// Install as an app + offline support
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(warn);
}

if (configured) startAuth();
renderNow(true);
