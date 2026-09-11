import { firebaseConfig, BOARD_ID } from './firebase-config.js';

/* ---------- Category colors ---------- */

const PALETTE = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
function colorFor(category) {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return `var(--${PALETTE[hash % PALETTE.length]})`;
}

const DEFAULT_CATEGORIES = [
  'Wedding shopping',
  'Daily clothing',
  'Accessories',
  'Bags',
  'Footwear',
  'Home decor'
];

/* ---------- State ---------- */

let sites = [];
let categories = DEFAULT_CATEGORIES.slice();
let activeFilter = 'All';
let openSiteId = null;
let syncMode = 'local'; // 'local' | 'cloud'

/* ---------- Backend: try Firebase, else local-only ---------- */

const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_');

let db = null;
let fsApi = null; // holds the firestore functions once loaded

const syncBadge = document.getElementById('syncBadge');

function setBadge(mode, label) {
  syncBadge.textContent = label;
  syncBadge.className = 'sync-badge ' + mode;
}

async function initBackend() {
  if (!isConfigured) {
    setBadge('off', '○ not synced — see README to turn on sync');
    loadLocal();
    renderAll();
    return;
  }

  try {
    const [{ initializeApp }, firestore] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js')
    ]);
    fsApi = firestore;
    const app = initializeApp(firebaseConfig);
    db = fsApi.getFirestore(app);
    syncMode = 'cloud';
    setBadge('on', '● synced');

    const sitesCol = fsApi.collection(db, 'boards', BOARD_ID, 'sites');
    fsApi.onSnapshot(sitesCol, snap => {
      sites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    }, err => {
      console.error(err);
      setBadge('off', '○ sync error — check Firestore rules');
    });

    const catDocRef = fsApi.doc(db, 'boards', BOARD_ID, 'meta', 'categories');
    fsApi.onSnapshot(catDocRef, async snap => {
      if (snap.exists() && Array.isArray(snap.data().list) && snap.data().list.length) {
        categories = snap.data().list;
      } else {
        await fsApi.setDoc(catDocRef, { list: DEFAULT_CATEGORIES });
        categories = DEFAULT_CATEGORIES.slice();
      }
      renderFilters();
      if (!addOverlay.hidden) populateCategorySelect();
    });
  } catch (err) {
    console.error('Firebase init failed, falling back to local storage:', err);
    setBadge('off', '○ sync unavailable — using this device only');
    loadLocal();
    renderAll();
  }
}

/* ---------- Local fallback storage ---------- */

const LOCAL_SITES_KEY = 'shelf.sites.v1';
const LOCAL_CAT_KEY = 'shelf.categories.v1';

function loadLocal() {
  try { sites = JSON.parse(localStorage.getItem(LOCAL_SITES_KEY)) || []; } catch { sites = []; }
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_CAT_KEY));
    categories = stored && stored.length ? stored : DEFAULT_CATEGORIES.slice();
  } catch { categories = DEFAULT_CATEGORIES.slice(); }
}

function saveLocalSites() { localStorage.setItem(LOCAL_SITES_KEY, JSON.stringify(sites)); }
function saveLocalCategories() { localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(categories)); }

/* ---------- Data operations (route to cloud or local) ---------- */

async function addCategoryIfNew(name) {
  if (categories.includes(name)) return;
  categories.push(name);
  if (syncMode === 'cloud') {
    const catDocRef = fsApi.doc(db, 'boards', BOARD_ID, 'meta', 'categories');
    await fsApi.setDoc(catDocRef, { list: categories });
  } else {
    saveLocalCategories();
    renderFilters();
  }
}

async function addSite(site) {
  if (syncMode === 'cloud') {
    const sitesCol = fsApi.collection(db, 'boards', BOARD_ID, 'sites');
    await fsApi.addDoc(sitesCol, site);
  } else {
    sites.push({ id: uid(), ...site });
    saveLocalSites();
    renderAll();
  }
}

async function updateSiteField(id, field, value) {
  const site = sites.find(s => s.id === id);
  if (site) site[field] = value;
  if (syncMode === 'cloud') {
    const ref = fsApi.doc(db, 'boards', BOARD_ID, 'sites', id);
    await fsApi.updateDoc(ref, { [field]: value });
  } else {
    saveLocalSites();
  }
}

async function removeSite(id) {
  if (syncMode === 'cloud') {
    const ref = fsApi.doc(db, 'boards', BOARD_ID, 'sites', id);
    await fsApi.deleteDoc(ref);
  } else {
    sites = sites.filter(s => s.id !== id);
    saveLocalSites();
    renderAll();
  }
}

/* ---------- Helpers ---------- */

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function guessNameFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch { return url; }
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed;
  return trimmed;
}

/* ---------- Rendering ---------- */

const filterBar = document.getElementById('filterBar');
const board = document.getElementById('board');
const emptyState = document.getElementById('emptyState');

function renderAll() { renderFilters(); renderBoard(); }

function renderFilters() {
  filterBar.innerHTML = '';
  const all = ['All', ...categories];
  if (!all.includes(activeFilter)) activeFilter = 'All';
  all.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (cat === activeFilter ? ' active' : '');
    btn.type = 'button';
    btn.textContent = cat;
    btn.addEventListener('click', () => { activeFilter = cat; renderFilters(); renderBoard(); });
    filterBar.appendChild(btn);
  });
}

function renderBoard() {
  board.innerHTML = '';
  const visible = activeFilter === 'All' ? sites : sites.filter(s => s.category === activeFilter);

  emptyState.hidden = sites.length !== 0;
  if (sites.length !== 0 && visible.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-state';
    msg.textContent = `Nothing tagged "${activeFilter}" yet.`;
    board.appendChild(msg);
    return;
  }

  visible.slice().reverse().forEach(site => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.style.setProperty('--cat-color', colorFor(site.category || 'Misc'));
    card.addEventListener('click', () => openDetail(site.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(site.id); }
    });

    const top = document.createElement('div');
    top.className = 'card-top';

    const name = document.createElement('p');
    name.className = 'card-name';
    name.textContent = site.name;
    top.appendChild(name);

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = site.category;
    top.appendChild(tag);

    card.appendChild(top);

    const url = document.createElement('a');
    url.className = 'card-url';
    url.textContent = '↗ ' + (site.url || '').replace(/^https?:\/\//i, '');
    url.href = site.url;
    url.target = '_blank';
    url.rel = 'noopener noreferrer';
    url.addEventListener('click', e => e.stopPropagation()); // opens the site, doesn't also open the notes dialog
    card.appendChild(url);

    const preview = document.createElement('p');
    const hasNotes = site.comments || site.location;
    preview.className = 'card-preview' + (hasNotes ? '' : ' empty');
    preview.textContent = site.comments
      ? site.comments
      : (site.location ? `📍 ${site.location}` : 'No comments yet — tap to add some');
    card.appendChild(preview);

    board.appendChild(card);
  });
}

/* ---------- Add dialog ---------- */

const addOverlay = document.getElementById('addOverlay');
const openAddBtn = document.getElementById('openAddBtn');
const cancelAddBtn = document.getElementById('cancelAddBtn');
const confirmAddBtn = document.getElementById('confirmAddBtn');
const inputUrl = document.getElementById('inputUrl');
const inputName = document.getElementById('inputName');
const inputCategory = document.getElementById('inputCategory');
const newCategoryField = document.getElementById('newCategoryField');
const inputNewCategory = document.getElementById('inputNewCategory');
const addError = document.getElementById('addError');

const NEW_CATEGORY_VALUE = '__new__';

function populateCategorySelect() {
  inputCategory.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    inputCategory.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = NEW_CATEGORY_VALUE;
  newOpt.textContent = '+ Create a new category…';
  inputCategory.appendChild(newOpt);
}

inputCategory.addEventListener('change', () => {
  newCategoryField.hidden = inputCategory.value !== NEW_CATEGORY_VALUE;
  if (!newCategoryField.hidden) inputNewCategory.focus();
});

function openAddDialog() {
  inputUrl.value = '';
  inputName.value = '';
  inputNewCategory.value = '';
  newCategoryField.hidden = true;
  addError.hidden = true;
  populateCategorySelect();
  addOverlay.hidden = false;
  inputUrl.focus();
}

function closeAddDialog() { addOverlay.hidden = true; }

openAddBtn.addEventListener('click', openAddDialog);
cancelAddBtn.addEventListener('click', closeAddDialog);
addOverlay.addEventListener('click', e => { if (e.target === addOverlay) closeAddDialog(); });

confirmAddBtn.addEventListener('click', async () => {
  const url = normalizeUrl(inputUrl.value);
  if (!url) {
    addError.textContent = 'Add a website link first.';
    addError.hidden = false;
    inputUrl.focus();
    return;
  }

  let category = inputCategory.value;
  if (category === NEW_CATEGORY_VALUE) {
    const newCat = inputNewCategory.value.trim();
    if (!newCat) {
      addError.textContent = 'Name the new category, or pick an existing one.';
      addError.hidden = false;
      inputNewCategory.focus();
      return;
    }
    await addCategoryIfNew(newCat);
    category = newCat;
  }

  const name = inputName.value.trim() || guessNameFromUrl(url);

  confirmAddBtn.disabled = true;
  await addSite({ url, name, category, comments: '', location: '', addedAt: Date.now() });
  confirmAddBtn.disabled = false;

  closeAddDialog();
});

/* ---------- Detail dialog ---------- */

const detailOverlay = document.getElementById('detailOverlay');
const detailTitle = document.getElementById('detailTitle');
const detailUrl = document.getElementById('detailUrl');
const detailCategory = document.getElementById('detailCategory');
const detailComments = document.getElementById('detailComments');
const detailLocation = document.getElementById('detailLocation');
const saveIndicator = document.getElementById('saveIndicator');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const removeBtn = document.getElementById('removeBtn');

let saveIndicatorTimer = null;

function openDetail(id) {
  const site = sites.find(s => s.id === id);
  if (!site) return;
  openSiteId = id;

  detailTitle.textContent = site.name;
  detailUrl.textContent = site.url;
  detailUrl.href = site.url;
  detailCategory.textContent = site.category;
  detailCategory.style.background = colorFor(site.category || 'Misc');
  detailComments.value = site.comments || '';
  detailLocation.value = site.location || '';
  saveIndicator.classList.remove('visible');

  detailOverlay.hidden = false;
}

function closeDetail() {
  detailOverlay.hidden = true;
  openSiteId = null;
  renderBoard();
}

let debounceTimer = null;
function debouncedUpdate(field, value) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    await updateSiteField(openSiteId, field, value);
    saveIndicator.classList.add('visible');
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(() => saveIndicator.classList.remove('visible'), 1200);
  }, 400);
}

detailComments.addEventListener('input', () => debouncedUpdate('comments', detailComments.value));
detailLocation.addEventListener('input', () => debouncedUpdate('location', detailLocation.value));

closeDetailBtn.addEventListener('click', closeDetail);
detailOverlay.addEventListener('click', e => { if (e.target === detailOverlay) closeDetail(); });

removeBtn.addEventListener('click', async () => {
  if (!openSiteId) return;
  if (!confirm("Remove this site from your shelf? This can't be undone.")) return;
  await removeSite(openSiteId);
  detailOverlay.hidden = true;
  openSiteId = null;
});

/* ---------- Keyboard ---------- */

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!detailOverlay.hidden) closeDetail();
  if (!addOverlay.hidden) closeAddDialog();
});

/* ---------- Init ---------- */

initBackend();
