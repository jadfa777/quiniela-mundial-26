// ==========================================================================
// Quiniela Mundial 2026 - Main Application Logic
// ==========================================================================

// --- State Management ---
let state = {
  config: {
    exactScore: 3,
    outcome: 1,
    qualifier: 2,
    champion: 12,
    runnerUp: 8,
    semis: 5
  },
  participants: [],
  predictions: {}, // format: { participantId: { matchId: { scoreA: num|null, scoreB: num|null, winner: str } } }
  bonus: {},       // format: { participantId: { champion: str, runnerUp: str, semis: [str, str, str, str] } }
  matches: [],
  results: {
    champion: "",
    runnerUp: "",
    semis: ["", "", "", ""]
  }
};

const STORAGE_KEY = "quiniela_mundial_2026_state";

// --- Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyB0hz3OFecDVk9h9lbjZmZeKJ9nplvhMSA",
  authDomain: "quiniela-mundial-26-564b6.firebaseapp.com",
  projectId: "quiniela-mundial-26-564b6",
  storageBucket: "quiniela-mundial-26-564b6.firebasestorage.app",
  messagingSenderId: "24580420159",
  appId: "1:24580420159:web:b1e3a7f6b3ce1fedb37e8a"
};

let db = null;
let currentUser = null; // { name, id }
let currentActiveTab = "dashboard";
let appInitialized = false;
let officialMatches = [];

// Flag Emoji Mapper
const COUNTRY_FLAGS = {
  "Estados Unidos": "🇺🇸",
  "Colombia": "🇨🇴",
  "Camerún": "🇨🇲",
  "Escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "México": "🇲🇽",
  "Alemania": "🇩🇪",
  "Marruecos": "🇲🇦",
  "Corea del Sur": "🇰🇷",
  "Canadá": "🇨🇦",
  "Suecia": "🇸🇪",
  "España": "🇪🇸",
  "Nigeria": "🇳🇬",
  "Argentina": "🇦🇷",
  "Egipto": "🇪🇬",
  "Arabia Saudita": "🇸🇦",
  "Brasil": "🇧🇷",
  "Ghana": "🇬🇭",
  "Suiza": "🇨🇭",
  "Irán": "🇮🇷",
  "Francia": "🇫🇷",
  "Japón": "🇯🇵",
  "Uruguay": "🇺🇾",
  "Ucrania": "🇺🇦",
  "Inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Túnez": "🇹🇳",
  "Australia": "🇦🇺",
  "Portugal": "🇵🇹",
  "Senegal": "🇸🇳",
  "Bélgica": "🇧🇪",
  "Jamaica": "🇯🇲",
  "Italia": "🇮🇹",
  "Argelia": "🇩🇿",
  "Países Bajos": "🇳🇱",
  "Chile": "🇨🇱",
  "Croacia": "🇭🇷",
  "Costa de Marfil": "🇨🇮",
  "Austria": "🇦🇹",
  "Panamá": "🇵🇦",
  "Polonia": "🇵🇱",
  "Perú": "🇵🇪",
  "Turquía": "🇹🇷",
  "Nueva Zelanda": "🇳🇿",
  "República Checa": "🇨🇿",
  "Sudáfrica": "🇿🇦",
  "Gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "Honduras": "🇭🇳",
  "Qatar": "🇶🇦",
  "Bosnia y Herzegovina": "🇧🇦",
  "Haití": "🇭🇹",
  "Paraguay": "🇵🇾",
  "Ecuador": "🇪🇨",
  "Curazao": "🇨🇼",
  "Cabo Verde": "🇨🇻",
  "Noruega": "🇳🇴",
  "Irak": "🇮🇶",
  "Jordania": "🇯🇴",
  "Uzbekistán": "🇺🇿",
  "RD Congo": "🇨🇩"
};

function getFlag(teamName) {
  // If it's a placeholder like "1º Grupo A" or "Ganador 73"
  if (teamName && (teamName.includes("Grupo") || teamName.includes("Ganador") || teamName.includes("Perdedor"))) {
    return "🏆";
  }
  return COUNTRY_FLAGS[teamName] || "🏳️";
}

// Show toast notifications
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = document.createElement("span");
  icon.textContent = type === 'success' ? '✓' : '✗';
  const msg = document.createElement("div");
  msg.textContent = message;
  toast.appendChild(icon);
  toast.appendChild(msg);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- Firestore helpers ---
function mainRef() { return db.collection("quiniela").doc("main"); }
function col(name) { return mainRef().collection(name); }

function sortMatches(matches) {
  return [...matches].sort((a, b) => (a.order || a.id) - (b.order || b.id));
}

function isPlaceholderTeam(team) {
  return /^(Ganador|Perdedor|\dº Grupo)/.test(team || "");
}

function mergeOfficialMatches(savedMatches = []) {
  if (!officialMatches.length) return sortMatches(savedMatches);

  const savedById = new Map(savedMatches.map(match => [match.id, match]));
  return sortMatches(officialMatches.map(match => {
    const saved = savedById.get(match.id);
    if (!saved) return { ...match };

    const merged = {
      ...match,
      scoreA: saved.scoreA ?? null,
      scoreB: saved.scoreB ?? null,
      sign: saved.sign || "",
      winner: saved.winner || ""
    };

    if (match.phase !== "Grupos") {
      if (!isPlaceholderTeam(saved.teamA)) merged.teamA = saved.teamA;
      if (!isPlaceholderTeam(saved.teamB)) merged.teamB = saved.teamB;
    }
    return merged;
  }));
}

async function loadOfficialMatches() {
  const response = await fetch("matches.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar matches.json (${response.status})`);
  officialMatches = sortMatches(await response.json());
}

async function initApp() {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();

  document.body.style.opacity = "0.5";
  try {
    await loadOfficialMatches();
    const mainDoc = await mainRef().get();

    if (mainDoc.exists && Array.isArray(mainDoc.data().participants)) {
      // Old flat format detected — migrate automatically to subcollections
      await migrateToSubcollections(mainDoc.data());
    } else if (!mainDoc.exists) {
      // First run: seed from matches.json
      state.matches = officialMatches;
      await seedInitialState();
    } else {
      // New subcollection format — load all in parallel
      const [partsSnap, predsSnap, bonusSnap, matchesSnap] = await Promise.all([
        col("participants").get(),
        col("predictions").get(),
        col("bonus").get(),
        col("matches").get()
      ]);
      assembleState(mainDoc.data(), partsSnap, predsSnap, bonusSnap, matchesSnap);
    }
  } catch (e) {
    console.error("Error connecting to Firebase:", e);
    showToast("Error de conexión. Verifica tu internet.", "error");
  }
  document.body.style.opacity = "1";

  setupFirestoreListeners();
  setupEventListeners();
  updateNavigation();
  appInitialized = true;
  identifyUser();
}

function assembleState(mainData, partsSnap, predsSnap, bonusSnap, matchesSnap) {
  state.config = (mainData && mainData.config) || state.config;
  state.results = (mainData && mainData.results) || state.results;
  state.participants = partsSnap.docs.map(d => d.data());
  state.matches = mergeOfficialMatches(matchesSnap.docs.map(d => d.data()));
  state.predictions = {};
  predsSnap.docs.forEach(d => { state.predictions[parseInt(d.id)] = d.data(); });
  state.bonus = {};
  bonusSnap.docs.forEach(d => { state.bonus[parseInt(d.id)] = d.data(); });
}

function setupFirestoreListeners() {
  // Main doc: config + results only (no participants/matches in new format)
  mainRef().onSnapshot(doc => {
    if (!appInitialized || !doc.exists) return;
    const data = doc.data();
    if (!Array.isArray(data.participants)) {
      state.config = data.config || state.config;
      state.results = data.results || state.results;
      if (!["predictions", "matches"].includes(currentActiveTab)) renderCurrentTab();
    }
  });

  col("participants").onSnapshot(snap => {
    if (!appInitialized) return;
    state.participants = snap.docs.map(d => d.data());
    if (!["predictions", "matches"].includes(currentActiveTab)) renderCurrentTab();
  });

  col("predictions").onSnapshot(snap => {
    if (!appInitialized) return;
    snap.docChanges().forEach(change => {
      const id = parseInt(change.doc.id);
      if (change.type === "removed") delete state.predictions[id];
      else state.predictions[id] = change.doc.data();
    });
    if (!["predictions", "matches"].includes(currentActiveTab)) renderCurrentTab();
  });

  col("bonus").onSnapshot(snap => {
    if (!appInitialized) return;
    snap.docChanges().forEach(change => {
      const id = parseInt(change.doc.id);
      if (change.type === "removed") delete state.bonus[id];
      else state.bonus[id] = change.doc.data();
    });
    if (!["predictions", "matches"].includes(currentActiveTab)) renderCurrentTab();
  });

  col("matches").onSnapshot(snap => {
    if (!appInitialized) return;
    state.matches = mergeOfficialMatches(snap.docs.map(d => d.data()));
    if (!["predictions", "matches"].includes(currentActiveTab)) renderCurrentTab();
  });
}

async function seedInitialState() {
  const batch = db.batch();
  batch.set(mainRef(), { config: state.config, results: state.results });
  state.matches.forEach(m => batch.set(col("matches").doc(String(m.id)), m));
  await batch.commit();
}

async function migrateToSubcollections(oldData) {
  showToast("Actualizando estructura de datos... Por favor espera.", "success");
  state.config = oldData.config || state.config;
  state.results = oldData.results || state.results;
  state.participants = oldData.participants || [];
  state.matches = mergeOfficialMatches(oldData.matches || []);
  state.predictions = oldData.predictions || {};
  state.bonus = oldData.bonus || {};

  const ops = [];
  // Main doc gets only config + results (removes old flat fields)
  ops.push({ ref: mainRef(), data: { config: state.config, results: state.results } });
  state.participants.forEach(p => ops.push({ ref: col("participants").doc(String(p.id)), data: p }));
  state.matches.forEach(m => ops.push({ ref: col("matches").doc(String(m.id)), data: m }));
  Object.entries(state.predictions).forEach(([id, preds]) =>
    ops.push({ ref: col("predictions").doc(String(id)), data: preds })
  );
  Object.entries(state.bonus).forEach(([id, b]) =>
    ops.push({ ref: col("bonus").doc(String(id)), data: b })
  );

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(op => batch.set(op.ref, op.data));
    await batch.commit();
  }
  showToast("¡Estructura actualizada correctamente!", "success");
}

// Saves only config + results to the main doc
async function saveMainDoc() {
  if (!db) return;
  try {
    await mainRef().set({ config: state.config, results: state.results }, { merge: true });
  } catch (e) {
    console.error("Error saving:", e);
    showToast("Error al guardar. Verifica tu conexión.", "error");
  }
}

// Upserts a single participant document
async function saveParticipant(p) {
  if (!db) return;
  try {
    await col("participants").doc(String(p.id)).set(p);
  } catch (e) {
    console.error("Error saving participant:", e);
    showToast("Error al guardar participante.", "error");
    throw e;
  }
}

// Creates empty prediction + bonus docs for a new participant
async function initParticipantDocs(id) {
  const writes = [];
  if (!state.predictions[id]) {
    state.predictions[id] = {};
    writes.push(col("predictions").doc(String(id)).set({}));
  }
  if (!state.bonus[id]) {
    state.bonus[id] = { champion: "", runnerUp: "", semis: ["", "", "", ""] };
    writes.push(col("bonus").doc(String(id)).set(state.bonus[id]));
  }
  if (writes.length) await Promise.all(writes);
}

// Deletes participant + their predictions + bonus atomically
async function deleteParticipantDocs(id) {
  const batch = db.batch();
  batch.delete(col("participants").doc(String(id)));
  batch.delete(col("predictions").doc(String(id)));
  batch.delete(col("bonus").doc(String(id)));
  await batch.commit();
}

// Batch-writes an array of match objects to the matches subcollection
async function saveMatchBatch(matches) {
  if (!db || !matches.length) return;
  try {
    const batch = db.batch();
    matches.forEach(m => batch.set(col("matches").doc(String(m.id)), m));
    await batch.commit();
  } catch (e) {
    console.error("Error saving matches:", e);
    showToast("Error al guardar partidos.", "error");
    throw e;
  }
}

// Clears all subcollections and rewrites from a parsed state object (used by importData)
async function importAllState(parsedState) {
  const [partsSnap, predsSnap, bonusSnap, matchesSnap] = await Promise.all([
    col("participants").get(),
    col("predictions").get(),
    col("bonus").get(),
    col("matches").get()
  ]);

  const deleteRefs = [
    ...partsSnap.docs.map(d => d.ref),
    ...predsSnap.docs.map(d => d.ref),
    ...bonusSnap.docs.map(d => d.ref),
    ...matchesSnap.docs.map(d => d.ref)
  ];
  for (let i = 0; i < deleteRefs.length; i += 400) {
    const batch = db.batch();
    deleteRefs.slice(i, i + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  const ops = [];
  ops.push({ ref: mainRef(), data: {
    config: parsedState.config,
    results: parsedState.results || { champion: "", runnerUp: "", semis: ["", "", "", ""] }
  }});
  (parsedState.participants || []).forEach(p =>
    ops.push({ ref: col("participants").doc(String(p.id)), data: p })
  );
  (parsedState.matches || []).forEach(m =>
    ops.push({ ref: col("matches").doc(String(m.id)), data: m })
  );
  Object.entries(parsedState.predictions || {}).forEach(([id, preds]) =>
    ops.push({ ref: col("predictions").doc(String(id)), data: preds })
  );
  Object.entries(parsedState.bonus || {}).forEach(([id, b]) =>
    ops.push({ ref: col("bonus").doc(String(id)), data: b })
  );

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(op => batch.set(op.ref, op.data));
    await batch.commit();
  }
}

// --- User Identification ---
function identifyUser() {
  const saved = localStorage.getItem("quinielaUser");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const match = state.participants.find(
        p => p.id === parsed.id && p.name.toLowerCase() === parsed.name.toLowerCase()
      );
      if (match) {
        currentUser = { name: match.name, id: match.id };
        activePredictionParticipantId = currentUser.id;
        updateAdminUI();
        switchTab("dashboard");
        return;
      }
    } catch (e) {}
    // Session invalid or tampered — clear and force re-login
    localStorage.removeItem("quinielaUser");
  }
  showAuthScreen();
}

let pendingLoginName = null;
let currentAuthStep = "auth-step-name";

function showAuthScreen() {
  document.getElementById("auth-screen").classList.add("active");
  setTimeout(() => document.getElementById("user-name-input").focus(), 250);
}

function hideAuthScreen() {
  document.getElementById("auth-screen").classList.remove("active");
}

function authTransitionTo(stepId) {
  document.getElementById(currentAuthStep).classList.add("auth-card-offscreen");
  document.getElementById(stepId).classList.remove("auth-card-offscreen");
  currentAuthStep = stepId;
}

function authGoBack() {
  authTransitionTo("auth-step-name");
  setTimeout(() => document.getElementById("user-name-input").focus(), 80);
}

function updatePinDots() {
  const val = document.getElementById("pin-input").value;
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pin-dot-${i}`);
    if (dot) dot.classList.toggle("filled", i < val.length);
  }
  if (val.length === 4) setTimeout(handlePinSubmit, 220);
}

async function handleUserNameSubmit() {
  const input = document.getElementById("user-name-input");
  const name = input.value.trim();
  if (!name) { input.focus(); return; }

  pendingLoginName = name;

  const existing = state.participants.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing && existing.pin) {
    showPinVerifyModal(`Hola, ${existing.name}. Introduce tu PIN para acceder.`);
  } else {
    showPinCreateModal();
  }
}

function showPinVerifyModal(desc) {
  document.getElementById("pin-modal-desc").textContent = desc;
  document.getElementById("pin-error").style.display = "none";
  document.getElementById("pin-input").value = "";
  updatePinDots();
  const initial = pendingLoginName.charAt(0).toUpperCase();
  document.getElementById("auth-user-initial").textContent = initial;
  document.getElementById("auth-user-greeting").textContent = pendingLoginName.split(" ")[0];
  authTransitionTo("auth-step-pin");
  setTimeout(() => document.getElementById("pin-input").focus(), 150);
}

function showPinCreateModal() {
  document.getElementById("pin-create-error").style.display = "none";
  document.getElementById("pin-create-input").value = "";
  document.getElementById("pin-create-confirm").value = "";
  authTransitionTo("auth-step-create");
  setTimeout(() => document.getElementById("pin-create-input").focus(), 150);
}

async function handlePinSubmit() {
  const pin = document.getElementById("pin-input").value.trim();
  if (!pin) {
    document.getElementById("pin-error").style.display = "block";
    document.getElementById("pin-input").focus();
    return;
  }

  let verified = false;
  const pinHash = await hashPin(pin);
  const existing = state.participants.find(p => p.name.toLowerCase() === pendingLoginName.toLowerCase());
  if (existing) {
    if (pinHash === existing.pin) {
      verified = true;
    } else if (pin === existing.pin) {
      // plaintext PIN from before hashing was added — upgrade transparently
      existing.pin = pinHash;
      await saveParticipant(existing);
      verified = true;
    }
  }

  if (!verified) {
    document.getElementById("pin-error").style.display = "block";
    document.getElementById("pin-input").value = "";
    updatePinDots();
    document.getElementById("pin-input").focus();
    return;
  }

  hideAuthScreen();
  await finalizeLogin(pendingLoginName);
  pendingLoginName = null;
}

async function handlePinCreateSubmit() {
  const pin = document.getElementById("pin-create-input").value.trim();
  const confirm = document.getElementById("pin-create-confirm").value.trim();
  const errorEl = document.getElementById("pin-create-error");

  if (!/^\d{4}$/.test(pin)) {
    errorEl.textContent = "El PIN debe ser exactamente 4 dígitos numéricos.";
    errorEl.style.display = "block";
    return;
  }
  if (pin !== confirm) {
    errorEl.textContent = "Los PINes no coinciden. Inténtalo de nuevo.";
    errorEl.style.display = "block";
    document.getElementById("pin-create-confirm").value = "";
    document.getElementById("pin-create-confirm").focus();
    return;
  }

  hideAuthScreen();
  await finalizeLogin(pendingLoginName, pin);
  pendingLoginName = null;
}

async function finalizeLogin(name, newPin = null) {
  const existing = state.participants.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    currentUser = { name: existing.name, id: existing.id };
    if (newPin && !existing.pin) {
      existing.pin = await hashPin(newPin);
      await saveParticipant(existing);
    }
  } else {
    const id = Date.now();
    currentUser = { name, id };
    await addCurrentUserAsParticipant(name, id, newPin ? await hashPin(newPin) : null);
  }

  localStorage.setItem("quinielaUser", JSON.stringify(currentUser));
  activePredictionParticipantId = currentUser.id;
  updateAdminUI();
  switchTab("dashboard");
}

async function addCurrentUserAsParticipant(name, id, pin = null) {
  const p = { id, name, email: "", paid: false, active: true, pin };
  state.participants.push(p);
  await saveParticipant(p);
  await initParticipantDocs(id);
}

function renderCurrentTab() {
  if (currentActiveTab === "dashboard") renderDashboard();
  else if (currentActiveTab === "participants") renderParticipants();
  else if (currentActiveTab === "ranking") renderRanking();
  else if (currentActiveTab === "bonus") renderBonus();
  else if (currentActiveTab === "config") renderConfig();
  else if (currentActiveTab === "data") renderData();
}

// --- Tab Swapping ---
function switchTab(tabId) {
  currentActiveTab = tabId;
  document.querySelectorAll(".page-section").forEach(sec => sec.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  
  const targetSec = document.getElementById(`sec-${tabId}`);
  const targetBtn = document.getElementById(`tab-${tabId}`);
  
  if (targetSec && targetBtn) {
    targetSec.classList.add("active");
    targetBtn.classList.add("active");
  }

  // Show/hide floating save button
  const fab = document.getElementById("btn-save-predictions-fab");
  if (fab) fab.style.display = tabId === "predictions" ? "block" : "none";

  // Render content dynamically based on selected tab
  if (tabId === "dashboard") renderDashboard();
  else if (tabId === "participants") renderParticipants();
  else if (tabId === "matches") renderMatches();
  else if (tabId === "predictions") renderPredictions();
  else if (tabId === "ranking") renderRanking();
  else if (tabId === "bonus") renderBonus();
  else if (tabId === "config") renderConfig();
  else if (tabId === "data") renderData();
}

function setupEventListeners() {
  // Navigation
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.id.replace("tab-", "");
      switchTab(tabId);
    });
  });

  // Participant Form Submit
  document.getElementById("btn-add-participant").addEventListener("click", openAddParticipantModal);
  document.getElementById("modal-participant-form").addEventListener("submit", handleParticipantSubmit);
  document.getElementById("btn-close-modal").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });

  // Export Data Action
  document.getElementById("btn-export-data").addEventListener("click", exportData);
  document.getElementById("file-import").addEventListener("change", (e) => {
    if (!isAdmin()) { showToast("Solo el administrador puede importar datos.", "error"); e.target.value = ""; return; }
    importData(e);
  });

  // User name modal: submit on Enter
  document.getElementById("user-name-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleUserNameSubmit();
  });

  // PIN verify: update dots on input, focus input on tap, submit on Enter
  document.getElementById("pin-input").addEventListener("input", updatePinDots);
  document.getElementById("pin-dots-tap-area").addEventListener("click", () => {
    document.getElementById("pin-input").focus();
  });
  document.getElementById("pin-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handlePinSubmit();
  });

  // PIN create modal: Tab between fields, Enter on confirm submits
  document.getElementById("pin-create-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("pin-create-confirm").focus();
  });
  document.getElementById("pin-create-confirm").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handlePinCreateSubmit();
  });
}

function updateNavigation() {
  // Can add dynamic badge updates if necessary
}

// --- Dashboard Module ---
window.goToPrediction = function(matchId) {
  activePredictionPhaseFilter = "Todos";
  switchTab("predictions");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const card = document.querySelector(`.match-card[data-match-id="${matchId}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("match-highlight");
      setTimeout(() => card.classList.remove("match-highlight"), 1500);
    });
  });
};

function renderDashboard() {
  const container = document.getElementById("sec-dashboard");
  
  // Compute dashboard metrics
  const totalP = state.participants.length;
  
  let matchesPlayed = 0;
  state.matches.forEach(m => {
    if (m.scoreA !== null && m.scoreB !== null) matchesPlayed++;
  });

  const scores = calculateScores();
  const leaderName = scores.length > 0 ? scores[0].name : "Ninguno";
  const leaderPoints = scores.length > 0 ? scores[0].total : 0;

  // Render stats
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card" style="--accent-color: var(--accent-cyan); --accent-color-glow: var(--accent-cyan-glow);">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <h3>Participantes</h3>
          <p>${totalP}</p>
        </div>
      </div>
      <div class="stat-card" style="--accent-color: var(--accent-emerald); --accent-color-glow: var(--accent-emerald-glow);">
        <div class="stat-icon">⚽</div>
        <div class="stat-info">
          <h3>Partidos Jugados</h3>
          <p>${matchesPlayed} / 104</p>
        </div>
      </div>
      <div class="stat-card" style="--accent-color: var(--accent-gold); --accent-color-glow: var(--accent-gold-glow);">
        <div class="stat-icon">🏆</div>
        <div class="stat-info">
          <h3>Líder Actual</h3>
          <p>${leaderName} <span style="font-size: 1rem; font-weight: 500; color: var(--text-secondary)">(${leaderPoints} pts)</span></p>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="panel-card">
        <h3 class="panel-title">⭐ Tabla de Posiciones Rápida</h3>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th style="width: 60px">Pos</th>
                <th>Participante</th>
                <th style="text-align: center">Exactos</th>
                <th style="text-align: center">Signos</th>
                <th style="text-align: right">Puntos</th>
              </tr>
            </thead>
            <tbody>
              ${scores.slice(0, 5).map((p, idx) => `
                <tr class="${idx === 0 ? 'participant-row-active' : ''}">
                  <td class="rank-pos ${idx === 0 ? 'rank-first' : idx === 1 ? 'rank-second' : idx === 2 ? 'rank-third' : ''}">
                    ${idx + 1}
                  </td>
                  <td class="rank-name">${escapeHtml(p.name)}</td>
                  <td style="text-align: center">${p.exacts}</td>
                  <td style="text-align: center">${p.outcomes}</td>
                  <td style="text-align: right; font-weight: 700; color: var(--accent-emerald)">${p.total}</td>
                </tr>
              `).join('')}
              ${scores.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted)">No hay participantes aún.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        ${scores.length > 5 ? `<div style="text-align: right; margin-top: 1rem;">
          <button class="btn btn-secondary btn-sm" onclick="switchTab('ranking')">Ver tabla completa →</button>
        </div>` : ''}
      </div>

      <div class="panel-card">
        <h3 class="panel-title">📅 Próximos Partidos</h3>
        <div class="recent-matches-list">
          ${state.matches.filter(m => m.scoreA === null && m.scoreB === null).slice(0, 4).map(m => `
            <div class="recent-item recent-item-clickable" onclick="goToPrediction(${m.id})">
              <div class="recent-info">
                <div class="recent-icon">⚽</div>
                <div class="recent-text">
                  <p>${getFlag(m.teamA)} ${m.teamA} vs ${m.teamB} ${getFlag(m.teamB)}</p>
                  <span>Fase: ${m.phase} ${m.group ? `(Grupo ${m.group})` : ''}</span>
                </div>
              </div>
              <span class="recent-badge btn-secondary" style="font-size: 0.75rem">${formatMatchSchedule(m)} →</span>
            </div>
          `).join('')}
          ${state.matches.filter(m => m.scoreA === null && m.scoreB === null).length === 0 ? 
            '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">Todos los partidos se han jugado.</p>' : ''}
        </div>
      </div>
    </div>
  `;
}

// --- Participants Module ---
let editingParticipantId = null;

function renderParticipants() {
  const container = document.getElementById("sec-participants");
  
  const isMe = (p) => currentUser && p.id === currentUser.id;

  let rows = state.participants.map((p, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td style="font-weight: 600;">${escapeHtml(p.name)}${isMe(p) ? ' <span style="font-size:0.7rem; color:var(--accent-cyan); font-weight:500;">(tú)</span>' : ''}</td>
      <td style="color: var(--text-secondary)">${escapeHtml(p.email) || 'N/A'}</td>
      <td>
        <span class="points-pill ${p.paid ? 'points-exact' : 'points-zero'}" ${isMe(p) ? `style="cursor: pointer;" onclick="toggleParticipantPaid(${p.id})"` : ''}>
          ${p.paid ? 'Sí' : 'No'}
        </span>
      </td>
      <td>
        <span class="points-pill ${p.active ? 'points-exact' : 'points-zero'}">
          ${p.active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td style="text-align: right;">
        ${(isMe(p) || isAdmin()) ? `
          <button class="btn btn-secondary btn-sm" onclick="editParticipant(${p.id})">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteParticipant(${p.id})">🗑️ Borrar</button>
        ` : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>'}
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>👥 Participantes (${state.participants.length})</h2>
        <p>Añade y edita a los amigos del trabajo que participan en la quiniela.</p>
      </div>
      ${isAdmin() ? '<button class="btn btn-primary" id="btn-add-p">➕ Añadir Participante</button>' : ''}
    </div>

    <div class="table-responsive">
      <table class="custom-table">
        <thead>
          <tr>
            <th style="width: 50px">#</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Pagado</th>
            <th>Activo</th>
            <th style="text-align: right; width: 200px">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          ${state.participants.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">No hay participantes registrados. ¡Añade el primero!</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

  if (isAdmin()) document.getElementById("btn-add-p").addEventListener("click", openAddParticipantModal);
}

function openAddParticipantModal() {
  editingParticipantId = null;
  document.getElementById("modal-title").innerText = "Añadir Participante";
  document.getElementById("part-name").value = "";
  document.getElementById("part-email").value = "";
  document.getElementById("part-paid").checked = false;
  document.getElementById("part-active").checked = true;
  document.getElementById("modal-overlay").classList.add("active");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
}

async function handleParticipantSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("part-name").value.trim();
  const email = document.getElementById("part-email").value.trim();
  const paid = document.getElementById("part-paid").checked;
  const active = document.getElementById("part-active").checked;

  if (!name) return;

  if (editingParticipantId === null) {
    // Add new
    const id = Date.now();
    const p = { id, name, email, paid, active, pin: null };
    state.participants.push(p);
    await saveParticipant(p);
    await initParticipantDocs(id);
    showToast(`Participante "${name}" añadido correctamente.`);
  } else {
    // Edit existing
    const idx = state.participants.findIndex(p => p.id === editingParticipantId);
    if (idx !== -1) {
      state.participants[idx].name = name;
      state.participants[idx].email = email;
      state.participants[idx].paid = paid;
      state.participants[idx].active = active;
      await saveParticipant(state.participants[idx]);
      showToast(`Participante "${name}" actualizado.`);
    }
  }

  closeModal();
  renderParticipants();
}

function editParticipant(id) {
  const p = state.participants.find(p => p.id === id);
  if (!p) return;

  editingParticipantId = id;
  document.getElementById("modal-title").innerText = "Editar Participante";
  document.getElementById("part-name").value = p.name;
  document.getElementById("part-email").value = p.email || "";
  document.getElementById("part-paid").checked = p.paid;
  document.getElementById("part-active").checked = p.active;
  document.getElementById("modal-overlay").classList.add("active");
}

async function deleteParticipant(id) {
  const p = state.participants.find(p => p.id === id);
  if (!p) return;

  if (confirm(`¿Estás seguro de que deseas eliminar a ${p.name}? Se borrarán también todos sus pronósticos.`)) {
    state.participants = state.participants.filter(item => item.id !== id);
    delete state.predictions[id];
    delete state.bonus[id];
    await deleteParticipantDocs(id);
    renderParticipants();
    showToast("Participante eliminado.", "error");
  }
}

async function toggleParticipantPaid(id) {
  const p = state.participants.find(p => p.id === id);
  if (p) {
    p.paid = !p.paid;
    await saveParticipant(p);
    renderParticipants();
    showToast(`Estado de pago de ${p.name} cambiado.`);
  }
}

async function toggleParticipantActive(id) {
  const p = state.participants.find(p => p.id === id);
  if (p) {
    p.active = !p.active;
    await saveParticipant(p);
    renderParticipants();
    showToast(`Estado activo de ${p.name} cambiado.`);
  }
}

// --- Matches / Calendario Module ---
let activeMatchesFilter = "Todos";

function renderMatches() {
  const container = document.getElementById("sec-matches");
  
  // Filter matches
  let filteredMatches = state.matches;
  if (activeMatchesFilter !== "Todos") {
    if (activeMatchesFilter.startsWith("Grupo ")) {
      const g = activeMatchesFilter.replace("Grupo ", "");
      filteredMatches = state.matches.filter(m => m.phase === "Grupos" && m.group === g);
    } else {
      filteredMatches = state.matches.filter(m => m.phase === activeMatchesFilter);
    }
  }

  // Draw filter options
  const groupsList = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const phasesList = ["Todos", "Grupos", ...groupsList.map(g => `Grupo ${g}`), "Dieciseisavos", "Octavos", "Cuartos", "Semifinales", "Tercer puesto", "Final"];
  
  const options = phasesList.map(opt => `
    <option value="${opt}" ${activeMatchesFilter === opt ? 'selected' : ''}>${opt}</option>
  `).join('');

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>📅 Resultados Oficiales</h2>
        <p>Administrador de resultados reales para calcular las puntuaciones.</p>
      </div>
      <div class="filters-bar" style="margin-bottom: 0;">
        <span style="font-size: 0.9rem; font-weight: 500;">Filtrar fase:</span>
        <select class="filter-select" id="match-phase-filter">
          ${options}
        </select>
        ${isAdmin() ? '<button class="btn btn-primary" id="btn-save-all-matches">💾 Guardar Cambios</button>' : '<span style="font-size:0.8rem; color:var(--text-muted);">🔒 Solo el admin puede editar resultados</span>'}
      </div>
    </div>

    <div class="matches-grid">
      ${filteredMatches.map(m => {
        const isKnockout = m.phase !== "Grupos";
        const hasScore = m.scoreA !== null && m.scoreB !== null;
        return `
          <div class="match-card" data-match-id="${m.id}">
            <div class="match-header">
              <span class="match-badge">${m.phase} ${m.group ? `• Grupo ${m.group}` : ''}</span>
              <span class="match-time">Juego ${m.order || m.id} | ${formatMatchSchedule(m)}</span>
            </div>
            
            <div class="match-teams-container">
              <!-- Team A -->
              <div class="team-row">
                <div class="team-info">
                  <span class="team-flag">${getFlag(m.teamA)}</span>
                  <span>${m.teamA}</span>
                </div>
                <input type="number" min="0" class="score-input match-score-a"
                       value="${m.scoreA !== null ? m.scoreA : ''}" placeholder="-" ${isAdmin() ? `oninput="updateMatchScore(${m.id},'scoreA',this.value)"` : 'disabled'}>
              </div>

              <!-- Team B -->
              <div class="team-row">
                <div class="team-info">
                  <span class="team-flag">${getFlag(m.teamB)}</span>
                  <span>${m.teamB}</span>
                </div>
                <input type="number" min="0" class="score-input match-score-b"
                       value="${m.scoreB !== null ? m.scoreB : ''}" placeholder="-" ${isAdmin() ? `oninput="updateMatchScore(${m.id},'scoreB',this.value)"` : 'disabled'}>
              </div>
            </div>

            ${isKnockout ? `
              <div class="qualifier-select-container">
                <span>Clasifica:</span>
                <button class="qualifier-btn ${m.winner === m.teamA ? 'selected' : ''}"
                        ${isAdmin() ? `onclick="setMatchWinner(${m.id}, '${m.teamA}')"` : 'disabled'}
                        data-team="${m.teamA}">${m.teamA}</button>
                <button class="qualifier-btn ${m.winner === m.teamB ? 'selected' : ''}"
                        ${isAdmin() ? `onclick="setMatchWinner(${m.id}, '${m.teamB}')"` : 'disabled'}
                        data-team="${m.teamB}">${m.teamB}</button>
              </div>
            ` : ''}
            
            <div class="match-footer" style="padding-top:0.5rem; border:none; margin-top:0;">
              <span style="font-size:0.75rem; color:var(--text-muted)">
                ${m.venue ? `${m.venue} · ` : ''}Resultado: ${hasScore ? (m.scoreA > m.scoreB ? 'Gana A' : m.scoreA < m.scoreB ? 'Gana B' : 'Empate') : 'Pendiente'}
              </span>
            </div>
          </div>
        `;
      }).join('')}
      ${filteredMatches.length === 0 ? '<div class="empty-state" style="grid-column: 1/-1;"><p>No se encontraron partidos para este filtro.</p></div>' : ''}
    </div>
  `;

  // Attach filter change event listener
  document.getElementById("match-phase-filter").addEventListener("change", (e) => {
    activeMatchesFilter = e.target.value;
    renderMatches();
  });

  // Attach save button listener (admin only)
  if (isAdmin()) document.getElementById("btn-save-all-matches").addEventListener("click", saveMatchesScores);
}

// Set winner of knockout match
window.setMatchWinner = function(matchId, teamName) {
  const m = state.matches.find(item => item.id === matchId);
  if (m) m.winner = teamName;

  const card = document.querySelector(`.match-card[data-match-id="${matchId}"]`);
  if (card) {
    card.querySelectorAll(".qualifier-btn").forEach(btn => {
      btn.classList.toggle("selected", btn.getAttribute("data-team") === teamName);
    });
  }
};

window.updateMatchScore = function(matchId, field, value) {
  const m = state.matches.find(item => item.id === matchId);
  if (!m) return;
  m[field] = value === "" ? null : parseInt(value);
  if (m.scoreA !== null && m.scoreB !== null) {
    if (m.scoreA > m.scoreB) m.sign = "1";
    else if (m.scoreA < m.scoreB) m.sign = "2";
    else m.sign = "X";
    if (m.phase !== "Grupos") {
      if (m.scoreA > m.scoreB) m.winner = m.teamA;
      else if (m.scoreB > m.scoreA) m.winner = m.teamB;
    }
  } else {
    m.sign = "";
  }
};

async function saveMatchesScores() {
  const btn = document.getElementById("btn-save-all-matches");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Guardando..."; }
  try {
    await saveMatchBatch(state.matches);
    showToast("Todos los resultados oficiales guardados correctamente.");
    await propagateKnockoutTeams();
  } catch (e) {
    // error toast shown inside saveMatchBatch
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Guardar Cambios"; }
  }
}

async function propagateKnockoutTeams() {
  // Let's build a mapping of matches to set team names dynamically
  // 73 is 2A vs 2B
  // 89 is Winner 74 vs Winner 77, etc.
  const changed = [];

  const getWinnerOfMatch = (id) => {
    const m = state.matches.find(item => item.id === id);
    return m ? m.winner : "";
  };

  const getLoserOfMatch = (id) => {
    const m = state.matches.find(item => item.id === id);
    if (!m || !m.winner) return "";
    return m.winner === m.teamA ? m.teamB : m.teamA;
  };

  // Map of next matches: targetMatchId: { teamASource: matchId/string, teamBSource: matchId/string }
  // We specify source. If number, it means winner of that match. If "loser-number", loser of that match.
  const knockoutPropagationMap = {
    89: { A: 74, B: 77 },
    90: { A: 73, B: 75 },
    91: { A: 76, B: 78 },
    92: { A: 79, B: 80 },
    93: { A: 83, B: 84 },
    94: { A: 81, B: 82 },
    95: { A: 86, B: 88 },
    96: { A: 85, B: 87 },
    
    97: { A: 89, B: 90 },
    98: { A: 93, B: 94 },
    99: { A: 91, B: 92 },
    100: { A: 95, B: 96 },
    
    101: { A: 97, B: 98 },
    102: { A: 99, B: 100 },
    
    103: { A: "loser-101", B: "loser-102" },
    104: { A: 101, B: 102 }
  };

  for (const [targetIdStr, sources] of Object.entries(knockoutPropagationMap)) {
    const targetId = parseInt(targetIdStr);
    const targetMatch = state.matches.find(item => item.id === targetId);
    if (!targetMatch) continue;

    // Resolve Team A
    let newTeamA = targetMatch.teamA;
    if (typeof sources.A === "number") {
      newTeamA = getWinnerOfMatch(sources.A) || `Ganador ${sources.A}`;
    } else if (sources.A.startsWith("loser-")) {
      const srcId = parseInt(sources.A.replace("loser-", ""));
      newTeamA = getLoserOfMatch(srcId) || `Perdedor ${srcId}`;
    }

    // Resolve Team B
    let newTeamB = targetMatch.teamB;
    if (typeof sources.B === "number") {
      newTeamB = getWinnerOfMatch(sources.B) || `Ganador ${sources.B}`;
    } else if (sources.B.startsWith("loser-")) {
      const srcId = parseInt(sources.B.replace("loser-", ""));
      newTeamB = getLoserOfMatch(srcId) || `Perdedor ${srcId}`;
    }

    if (targetMatch.teamA !== newTeamA || targetMatch.teamB !== newTeamB) {
      targetMatch.teamA = newTeamA;
      targetMatch.teamB = newTeamB;
      changed.push(targetMatch);
    }
  }

  if (changed.length > 0) {
    await saveMatchBatch(changed);
    renderMatches();
  }
}

// --- Predictions / Pronósticos Module ---
let activePredictionParticipantId = null;
let activePredictionPhaseFilter = "Todos";

function renderPredictions() {
  const container = document.getElementById("sec-predictions");
  
  if (state.participants.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3 class="empty-title">Sin Participantes</h3>
        <p class="empty-description">Para poder rellenar predicciones, primero debes añadir al menos un participante.</p>
        <button class="btn btn-primary" onclick="switchTab('participants')">Añadir Participante</button>
      </div>
    `;
    return;
  }

  // Set default active participant — prefer current logged-in user
  if (currentUser && state.participants.some(p => p.id === currentUser.id)) {
    if (activePredictionParticipantId === null || !state.participants.some(p => p.id === activePredictionParticipantId)) {
      activePredictionParticipantId = currentUser.id;
    }
  } else if (activePredictionParticipantId === null || !state.participants.some(p => p.id === activePredictionParticipantId)) {
    activePredictionParticipantId = state.participants[0].id;
  }

  const p = state.participants.find(item => item.id === activePredictionParticipantId);
  const pPredictions = state.predictions[activePredictionParticipantId] || {};

  // Filter matches
  let filteredMatches = state.matches;
  if (activePredictionPhaseFilter !== "Todos") {
    if (activePredictionPhaseFilter.startsWith("Grupo ")) {
      const g = activePredictionPhaseFilter.replace("Grupo ", "");
      filteredMatches = state.matches.filter(m => m.phase === "Grupos" && m.group === g);
    } else {
      filteredMatches = state.matches.filter(m => m.phase === activePredictionPhaseFilter);
    }
  }

  const groupsList = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const phasesList = ["Todos", "Grupos", ...groupsList.map(g => `Grupo ${g}`), "Dieciseisavos", "Octavos", "Cuartos", "Semifinales", "Tercer puesto", "Final"];
  
  const phaseOptions = phasesList.map(opt => `
    <option value="${opt}" ${activePredictionPhaseFilter === opt ? 'selected' : ''}>${opt}</option>
  `).join('');

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>📝 Mis Pronósticos</h2>
        <p>Pronósticos de <strong>${p ? escapeHtml(p.name) : ""}</strong>. Solo puedes editar los tuyos.</p>
      </div>
      <div class="filters-bar" style="margin-bottom: 0;">
        <span style="font-size: 0.9rem; font-weight: 500;">Fase:</span>
        <select class="filter-select" id="pred-phase-filter">
          ${phaseOptions}
        </select>

        <button class="btn btn-primary" id="btn-save-predictions">💾 Guardar Pronósticos</button>
      </div>
    </div>

    <div class="matches-grid">
      ${filteredMatches.map(m => {
        const pred = pPredictions[m.id] || { scoreA: null, scoreB: null, winner: "" };
        const isKnockout = m.phase !== "Grupos";
        const hasOfficial = m.scoreA !== null && m.scoreB !== null;
        const locked = isMatchLocked(m);

        // Calculate points preview for this match
        let points = 0;
        let pointsClass = "points-zero";
        let pointsText = "0 pts";

        if (hasOfficial && pred.scoreA !== null && pred.scoreB !== null) {
          const isExact = pred.scoreA === m.scoreA && pred.scoreB === m.scoreB;
          const predSign = pred.scoreA > pred.scoreB ? "1" : pred.scoreA < pred.scoreB ? "2" : "X";
          const isSign = predSign === m.sign;

          if (isExact) {
            points += state.config.exactScore;
            pointsClass = "points-exact";
            pointsText = `+${state.config.exactScore} pts (Exacto)`;
          } else if (isSign) {
            points += state.config.outcome;
            pointsClass = "points-outcome";
            pointsText = `+${state.config.outcome} pts (Ganador)`;
          }

          if (isKnockout && pred.winner && pred.winner === m.winner) {
            points += state.config.qualifier;
            if (pointsClass === "points-zero") pointsClass = "points-outcome";
            pointsText = `+${points} pts (Clasifica)`;
          }
        }

        return `
          <div class="match-card${locked ? ' match-locked' : ''}" data-match-id="${m.id}">
            <div class="match-header">
              <span class="match-badge">${m.phase} ${m.group ? `• Grupo ${m.group}` : ''}</span>
              <span class="match-time">Juego ${m.order || m.id} | ${formatMatchSchedule(m)}</span>
            </div>

            ${locked ? `
              <div class="lock-banner">🔒 Pronóstico cerrado</div>
            ` : ''}

            <div class="match-teams-container">
              <!-- Team A -->
              <div class="team-row">
                <div class="team-info">
                  <span class="team-flag">${getFlag(m.teamA)}</span>
                  <span>${m.teamA}</span>
                </div>
                <input type="number" min="0" class="score-input pred-score-a"
                       value="${pred.scoreA !== null ? pred.scoreA : ''}" placeholder="-" ${locked ? 'disabled' : `oninput="updatePredScore(${m.id},'scoreA',this.value)"`}>
              </div>

              <!-- Team B -->
              <div class="team-row">
                <div class="team-info">
                  <span class="team-flag">${getFlag(m.teamB)}</span>
                  <span>${m.teamB}</span>
                </div>
                <input type="number" min="0" class="score-input pred-score-b"
                       value="${pred.scoreB !== null ? pred.scoreB : ''}" placeholder="-" ${locked ? 'disabled' : `oninput="updatePredScore(${m.id},'scoreB',this.value)"`}>
              </div>
            </div>

            ${isKnockout ? `
              <div class="qualifier-select-container">
                <span>Clasifica predicho:</span>
                <button class="qualifier-btn ${pred.winner === m.teamA ? 'selected' : ''}"
                        ${locked ? 'disabled' : `onclick="setPredWinner(${m.id}, '${m.teamA}')"`} data-team="${m.teamA}">${m.teamA}</button>
                <button class="qualifier-btn ${pred.winner === m.teamB ? 'selected' : ''}"
                        ${locked ? 'disabled' : `onclick="setPredWinner(${m.id}, '${m.teamB}')"`} data-team="${m.teamB}">${m.teamB}</button>
              </div>
            ` : ''}

            <div class="match-footer">
              <span class="real-score-indicator">
                ${m.venue ? `${m.venue} · ` : ''}Real:
                <span class="real-score-badge">${hasOfficial ? `${m.scoreA} - ${m.scoreB}` : 'Pendiente'}</span>
                ${hasOfficial && isKnockout ? `<span style="font-weight: 500; font-size:0.7rem;">(${m.winner})</span>` : ''}
              </span>
              ${hasOfficial ? `
                <span class="points-pill ${pointsClass}">${pointsText}</span>
              ` : locked ? `
                <span class="points-pill points-zero" style="font-size: 0.7rem">🔒 Cerrado</span>
              ` : `
                <span class="points-pill points-zero" style="font-size: 0.7rem">Por jugar</span>
              `}
            </div>
            ${locked ? renderOthersPreds(m, hasOfficial) : ''}
          </div>
        `;
      }).join('')}
      ${filteredMatches.length === 0 ? '<div class="empty-state" style="grid-column: 1/-1;"><p>No hay partidos.</p></div>' : ''}
    </div>
  `;

  document.getElementById("pred-phase-filter").addEventListener("change", (e) => {
    activePredictionPhaseFilter = e.target.value;
    renderPredictions();
  });

  // Save predictions button
  document.getElementById("btn-save-predictions").addEventListener("click", savePredictions);
}

window.setPredWinner = function(matchId, teamName) {
  const pId = activePredictionParticipantId;
  if (!pId) return;
  if (!state.predictions[pId]) state.predictions[pId] = {};
  if (!state.predictions[pId][matchId]) state.predictions[pId][matchId] = { scoreA: null, scoreB: null, winner: "" };
  state.predictions[pId][matchId].winner = teamName;

  const card = document.querySelector(`.match-card[data-match-id="${matchId}"]`);
  if (card) {
    card.querySelectorAll(".qualifier-btn").forEach(btn => {
      btn.classList.toggle("selected", btn.getAttribute("data-team") === teamName);
    });
  }
};

window.updatePredScore = function(matchId, field, value) {
  const pId = activePredictionParticipantId;
  if (!pId) return;
  const match = state.matches.find(m => m.id === matchId);
  if (match && isMatchLocked(match)) return;
  if (!state.predictions[pId]) state.predictions[pId] = {};
  if (!state.predictions[pId][matchId]) state.predictions[pId][matchId] = { scoreA: null, scoreB: null, winner: "" };
  state.predictions[pId][matchId][field] = value === "" ? null : parseInt(value);
};

async function savePredictions() {
  const pId = activePredictionParticipantId;
  if (!pId) return;

  const btn = document.getElementById("btn-save-predictions");
  const fab = document.getElementById("btn-save-predictions-fab");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Guardando..."; }
  if (fab) { fab.disabled = true; fab.textContent = "⏳ Guardando..."; }

  try {
    await col("predictions").doc(String(pId)).set(state.predictions[pId] || {});
    showToast("Pronósticos guardados correctamente. ✓");
  } catch (e) {
    showToast("Error al guardar pronósticos.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Guardar Pronósticos"; }
    if (fab) { fab.disabled = false; fab.textContent = "💾 Guardar"; }
  }
}

window.toggleOthersPreds = function(matchId, toggleEl) {
  const panel = document.getElementById('others-preds-' + matchId);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  const arrow = toggleEl.querySelector('.others-arrow');
  if (arrow) arrow.textContent = isOpen ? '▾' : '▴';
};

// --- Ranking / Tabla de Posiciones Module ---
function calculateScores() {
  const scores = [];

  state.participants.forEach(p => {
    if (!p.active) return; // skip inactive players

    let total = 0;
    let matchPoints = 0;
    let bonusPoints = 0;
    let exacts = 0;
    let outcomes = 0;
    let qualifiers = 0;

    const pPreds = state.predictions[p.id] || {};
    const pBonus = state.bonus[p.id] || { champion: "", runnerUp: "", semis: ["", "", "", ""] };

    // 1. Matches scoring
    state.matches.forEach(m => {
      const pred = pPreds[m.id];
      const hasOfficial = m.scoreA !== null && m.scoreB !== null;
      if (!pred || !hasOfficial || pred.scoreA === null || pred.scoreB === null) return;

      const isExact = pred.scoreA === m.scoreA && pred.scoreB === m.scoreB;
      const predSign = pred.scoreA > pred.scoreB ? "1" : pred.scoreA < pred.scoreB ? "2" : "X";
      const isSign = predSign === m.sign;

      if (isExact) {
        matchPoints += state.config.exactScore;
        exacts++;
      } else if (isSign) {
        matchPoints += state.config.outcome;
        outcomes++;
      }

      if (m.phase !== "Grupos" && pred.winner && pred.winner === m.winner) {
        matchPoints += state.config.qualifier;
        qualifiers++;
      }
    });

    // 2. Bonus scoring
    if (state.results) {
      // Champion
      if (state.results.champion && pBonus.champion === state.results.champion) {
        bonusPoints += state.config.champion;
      }
      // Runner up
      if (state.results.runnerUp && pBonus.runnerUp === state.results.runnerUp) {
        bonusPoints += state.config.runnerUp;
      }
      // Semis
      if (state.results.semis && Array.isArray(pBonus.semis)) {
        pBonus.semis.forEach(semiTeam => {
          if (semiTeam && state.results.semis.includes(semiTeam)) {
            bonusPoints += state.config.semis;
          }
        });
      }
    }

    total = matchPoints + bonusPoints;

    scores.push({
      id: p.id,
      name: p.name,
      matchPoints,
      bonusPoints,
      exacts,
      outcomes,
      qualifiers,
      total
    });
  });

  // Sort: Total Points desc -> Exact Matches desc -> Outcomes desc -> Alphabetical
  scores.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.exacts !== a.exacts) return b.exacts - a.exacts;
    if (b.outcomes !== a.outcomes) return b.outcomes - a.outcomes;
    return a.name.localeCompare(b.name);
  });

  return scores;
}

function renderRanking() {
  const container = document.getElementById("sec-ranking");
  const scores = calculateScores();

  // Create podium (top 3)
  const top1 = scores[0] || null;
  const top2 = scores[1] || null;
  const top3 = scores[2] || null;

  let podiumHtml = "";
  if (scores.length > 0) {
    podiumHtml = `
      <div class="podium-container">
        <!-- 2nd Place -->
        ${top2 ? `
          <div class="podium-card podium-2nd">
            <div class="podium-rank">2</div>
            <div class="podium-avatar">${escapeHtml(top2.name.charAt(0))}</div>
            <div class="podium-name">${escapeHtml(top2.name)}</div>
            <div class="podium-points">${top2.total} Pts</div>
          </div>
        ` : ''}
        
        <!-- 1st Place -->
        ${top1 ? `
          <div class="podium-card podium-1st">
            <div class="podium-rank">1</div>
            <div class="podium-avatar">${escapeHtml(top1.name.charAt(0))}</div>
            <div class="podium-name" style="font-size:1.05rem; font-weight:700;">${escapeHtml(top1.name)}</div>
            <div class="podium-points">${top1.total} Pts</div>
          </div>
        ` : ''}

        <!-- 3rd Place -->
        ${top3 ? `
          <div class="podium-card podium-3rd">
            <div class="podium-rank">3</div>
            <div class="podium-avatar">${escapeHtml(top3.name.charAt(0))}</div>
            <div class="podium-name">${escapeHtml(top3.name)}</div>
            <div class="podium-points">${top3.total} Pts</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  let tableRows = scores.map((p, idx) => `
    <tr>
      <td class="rank-pos ${idx === 0 ? 'rank-first' : idx === 1 ? 'rank-second' : idx === 2 ? 'rank-third' : ''}">
        ${idx + 1}
      </td>
      <td class="rank-name">${escapeHtml(p.name)}</td>
      <td style="text-align: center; font-weight: 500;">${p.matchPoints}</td>
      <td style="text-align: center; font-weight: 500;">${p.bonusPoints}</td>
      <td style="text-align: center; color: var(--accent-emerald); font-weight: 600;">${p.exacts}</td>
      <td style="text-align: center; color: var(--accent-cyan); font-weight: 600;">${p.outcomes}</td>
      <td style="text-align: center; color: var(--accent-gold); font-weight: 600;">${p.qualifiers}</td>
      <td><div class="form-badges">${getRecentFormBadges(p.id)}</div></td>
      <td style="text-align: right; font-weight: 800; font-size: 1.1rem; color: var(--accent-emerald)">
        ${p.total}
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>🏆 Clasificación General</h2>
        <p>Tabla de puntuación en tiempo real actualizada automáticamente.</p>
      </div>
      <button class="btn btn-secondary" onclick="renderRanking()">🔄 Recargar</button>
    </div>

    ${podiumHtml}

    <div class="table-responsive">
      <table class="custom-table">
        <thead>
          <tr>
            <th style="width: 60px; text-align: center;">Pos</th>
            <th>Nombre del Amigo</th>
            <th style="text-align: center; width: 120px;">Pts Partidos</th>
            <th style="text-align: center; width: 100px;">Pts Bonus</th>
            <th style="text-align: center; width: 90px;">Exactos (3p)</th>
            <th style="text-align: center; width: 90px;">Signos (1p)</th>
            <th style="text-align: center; width: 90px;">Clasifica (2p)</th>
            <th style="text-align: center; width: 140px;">Últimos 5</th>
            <th style="text-align: right; width: 100px;">Total Pts</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          ${scores.length === 0 ? '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem;">No hay registros de clasificación. Registra participantes y resultados.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

// --- Bonus / Resultados Finales Module ---
let activeBonusParticipantId = null;

function renderBonus() {
  const container = document.getElementById("sec-bonus");
  
  if (state.participants.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <h3 class="empty-title">Sin Participantes</h3>
        <p class="empty-description">Para rellenar las predicciones del podio final, primero añade participantes.</p>
        <button class="btn btn-primary" onclick="switchTab('participants')">Añadir Participante</button>
      </div>
    `;
    return;
  }

  // Lock bonus to current user
  if (currentUser && state.participants.some(p => p.id === currentUser.id)) {
    activeBonusParticipantId = currentUser.id;
  } else if (activeBonusParticipantId === null || !state.participants.some(p => p.id === activeBonusParticipantId)) {
    activeBonusParticipantId = state.participants[0].id;
  }

  const p = state.participants.find(item => item.id === activeBonusParticipantId);
  const pBonus = state.bonus[p.id] || { champion: "", runnerUp: "", semis: ["", "", "", ""] };


  // Extract all teams list dynamically from matches to feed suggestion/dropdown
  const allTeams = [...new Set(state.matches.map(m => m.teamA).concat(state.matches.map(m => m.teamB)))]
    .filter(t => t && !t.includes("Grupo") && !t.includes("Ganador") && !t.includes("Perdedor"))
    .sort();

  const getTeamOptions = (selectedVal) => {
    return `<option value="">-- Selecciona equipo --</option>` + allTeams.map(t => `
      <option value="${t}" ${selectedVal === t ? 'selected' : ''}>${getFlag(t)} ${t}</option>
    `).join('');
  };

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>⭐ Predicciones de Podio (Bonus)</h2>
        <p>Define quién será el campeón, subcampeón y semifinalistas para obtener puntos extra.</p>
      </div>
    </div>

    <div class="grid-two-cols">
      <!-- Section 1: User Prediction -->
      <div class="panel-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:0.5rem;">
          <h3 style="font-size:1.1rem; font-weight:600;">Predicciones de: <span style="color:var(--accent-cyan)">${escapeHtml(p.name)}</span></h3>
        </div>

        <form id="bonus-prediction-form">
          <div class="form-group">
            <label class="form-label">🏆 Campeón Predicho</label>
            <select class="form-control" id="pred-champ">
              ${getTeamOptions(pBonus.champion)}
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">🥈 Subcampeón Predicho</label>
            <select class="form-control" id="pred-runner">
              ${getTeamOptions(pBonus.runnerUp)}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">🥉 Semifinalistas Predichos (4 equipos)</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem;">
              <select class="form-control pred-semi" data-index="0">
                ${getTeamOptions(pBonus.semis ? pBonus.semis[0] : "")}
              </select>
              <select class="form-control pred-semi" data-index="1">
                ${getTeamOptions(pBonus.semis ? pBonus.semis[1] : "")}
              </select>
              <select class="form-control pred-semi" data-index="2">
                ${getTeamOptions(pBonus.semis ? pBonus.semis[2] : "")}
              </select>
              <select class="form-control pred-semi" data-index="3">
                ${getTeamOptions(pBonus.semis ? pBonus.semis[3] : "")}
              </select>
            </div>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">💾 Guardar Podio Predicho</button>
        </form>
      </div>

      <!-- Section 2: Real Admin Podio Results -->
      <div class="panel-card" style="border-color: rgba(251, 191, 36, 0.2);">
        <h3 class="panel-title" style="color: var(--accent-gold)">🔑 Resultados Reales del Podio</h3>
        ${isAdmin() ? `
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1.5rem;">
          Define los resultados oficiales para calcular los puntos bonus de todos los participantes.
        </p>
        <form id="bonus-real-results-form">
          <div class="form-group">
            <label class="form-label">🏆 Campeón Real</label>
            <select class="form-control" id="real-champ">
              ${getTeamOptions(state.results ? state.results.champion : "")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">🥈 Subcampeón Real</label>
            <select class="form-control" id="real-runner">
              ${getTeamOptions(state.results ? state.results.runnerUp : "")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">🥉 Semifinalistas Reales</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem;">
              <select class="form-control real-semi" data-index="0">
                ${getTeamOptions(state.results && state.results.semis ? state.results.semis[0] : "")}
              </select>
              <select class="form-control real-semi" data-index="1">
                ${getTeamOptions(state.results && state.results.semis ? state.results.semis[1] : "")}
              </select>
              <select class="form-control real-semi" data-index="2">
                ${getTeamOptions(state.results && state.results.semis ? state.results.semis[2] : "")}
              </select>
              <select class="form-control real-semi" data-index="3">
                ${getTeamOptions(state.results && state.results.semis ? state.results.semis[3] : "")}
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn-secondary" style="width: 100%; border-color: var(--accent-gold); color: var(--accent-gold); margin-top: 1rem;">
            🏆 Guardar Podio Real
          </button>
        </form>
        ` : `
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1.5rem;">
          Solo el administrador puede definir los resultados oficiales una vez termine el torneo.
        </p>
        <div style="padding: 1.5rem; background: rgba(251,191,36,0.06); border-radius: 8px; border: 1px solid rgba(251,191,36,0.15);">
          <div style="margin-bottom:1rem;"><span class="form-label">🏆 Campeón Real</span><br><span style="color:var(--text-primary); font-weight:600;">${state.results && state.results.champion ? `${getFlag(state.results.champion)} ${state.results.champion}` : '<span style="color:var(--text-muted)">Por definir</span>'}</span></div>
          <div style="margin-bottom:1rem;"><span class="form-label">🥈 Subcampeón Real</span><br><span style="color:var(--text-primary); font-weight:600;">${state.results && state.results.runnerUp ? `${getFlag(state.results.runnerUp)} ${state.results.runnerUp}` : '<span style="color:var(--text-muted)">Por definir</span>'}</span></div>
          <div><span class="form-label">🥉 Semifinalistas Reales</span><br>${state.results && state.results.semis && state.results.semis.some(s => s) ? state.results.semis.filter(s => s).map(s => `<span style="display:inline-block; margin:0.25rem 0.5rem 0 0; font-weight:600;">${getFlag(s)} ${s}</span>`).join('') : '<span style="color:var(--text-muted)">Por definir</span>'}</div>
        </div>
        `}
      </div>
    </div>
  `;

  // Submit Predictions Form
  document.getElementById("bonus-prediction-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pId = activeBonusParticipantId;
    const submitBtn = e.target.querySelector("button[type=submit]");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "⏳ Guardando..."; }

    const champion = document.getElementById("pred-champ").value;
    const runnerUp = document.getElementById("pred-runner").value;
    const semis = Array.from(document.querySelectorAll(".pred-semi")).map(el => el.value);

    state.bonus[pId] = { champion, runnerUp, semis };
    try {
      await col("bonus").doc(String(pId)).set(state.bonus[pId]);
      showToast("Predicciones de podio guardadas. ✓");
    } catch (e) {
      // error toast shown inside col().set()
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "💾 Guardar Podio Predicho"; }
    }
    renderBonus();
  });

  // Submit Real Results Form (admin only)
  const realForm = document.getElementById("bonus-real-results-form");
  if (realForm) {
    realForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isAdmin()) { showToast("Solo el administrador puede cambiar los resultados.", "error"); return; }

      const champion = document.getElementById("real-champ").value;
      const runnerUp = document.getElementById("real-runner").value;
      const semis = Array.from(document.querySelectorAll(".real-semi")).map(el => el.value);

      state.results = { champion, runnerUp, semis };
      await saveMainDoc();
      showToast("Resultados oficiales del podio guardados correctamente.");
      renderBonus();
    });
  }
}

// --- Configuration / Configuración Module ---
function isAdmin() {
  return currentUser && currentUser.name.trim().toLowerCase() === "jhon de faria";
}

function formatMatchSchedule(m) {
  if (!m.date) return "Fecha pendiente";
  if (!m.time) return `${m.date} · hora pendiente`;
  return `${m.date} · ${m.time}${m.timezone ? ` ${m.timezone}` : ""}`;
}

function isMatchLocked(m) {
  if (!m.kickoff && (!m.date || !m.time)) return false;
  return Date.now() >= new Date(m.kickoff || `${m.date}T${m.time}:00${m.utcOffset || ""}`).getTime();
}

function calcPredPoints(pred, m) {
  if (pred.scoreA === null || pred.scoreB === null || m.scoreA === null || m.scoreB === null) return null;
  const isExact = pred.scoreA === m.scoreA && pred.scoreB === m.scoreB;
  const predSign = pred.scoreA > pred.scoreB ? "1" : pred.scoreA < pred.scoreB ? "2" : "X";
  let pts = 0;
  if (isExact) pts += state.config.exactScore;
  else if (predSign === m.sign) pts += state.config.outcome;
  if (m.phase !== "Grupos" && pred.winner && pred.winner === m.winner) pts += state.config.qualifier;
  return pts;
}

function getRecentFormBadges(participantId, count = 5) {
  const pPreds = state.predictions[participantId] || {};
  const finished = state.matches
    .filter(m => m.scoreA !== null && m.scoreB !== null)
    .sort((a, b) => (a.order || a.id) - (b.order || b.id));
  const recent = finished.slice(-count);
  if (recent.length === 0) return '<span class="form-empty">—</span>';
  return recent.map(m => {
    const pred = pPreds[m.id];
    if (!pred || pred.scoreA === null || pred.scoreB === null) {
      return '<span class="form-badge form-miss" title="Sin pronóstico">—</span>';
    }
    const pts = calcPredPoints(pred, m);
    if (pts === null) return '<span class="form-badge form-miss" title="Sin datos">—</span>';
    const label = pts > 0 ? `+${pts}` : '+0';
    const cls = pts >= state.config.exactScore ? 'form-exact' : pts > 0 ? 'form-outcome' : 'form-zero';
    const tip = `${m.teamA} ${m.scoreA}-${m.scoreB} ${m.teamB}`;
    return `<span class="form-badge ${cls}" title="${escapeHtml(tip)}">${label}</span>`;
  }).join('');
}

function renderOthersPreds(m, hasOfficial) {
  const isKo = m.phase !== "Grupos";
  const rows = state.participants.map(p => {
    const pp = (state.predictions[p.id] || {})[m.id] || { scoreA: null, scoreB: null, winner: "" };
    const hasScore = pp.scoreA !== null && pp.scoreB !== null;
    const pts = (hasOfficial && hasScore) ? calcPredPoints(pp, m) : null;
    const isMe = p.id === activePredictionParticipantId;
    return `
      <tr class="${isMe ? 'others-row-me' : ''}">
        <td>${isMe ? '★ ' : ''}${escapeHtml(p.name)}</td>
        <td class="others-score">${hasScore ? `${pp.scoreA} - ${pp.scoreB}` : '<span class="no-pred">—</span>'}</td>
        ${isKo ? `<td class="others-winner">${pp.winner ? escapeHtml(pp.winner) : '<span class="no-pred">—</span>'}</td>` : ''}
        <td class="others-pts">${pts !== null ? `<span class="pts-badge ${pts > 0 ? 'pts-pos' : 'pts-zero-b'}">${pts > 0 ? '+' : ''}${pts}</span>` : '<span class="no-pred">—</span>'}</td>
      </tr>`;
  }).join('');
  return `
    <div class="others-preds-toggle" onclick="toggleOthersPreds(${m.id}, this)">
      <span>👁 Ver pronósticos de todos</span><span class="others-arrow">▾</span>
    </div>
    <div class="others-preds-panel" id="others-preds-${m.id}" style="display:none;">
      <table class="others-table">
        <thead><tr>
          <th>Participante</th><th>Marcador</th>${isKo ? '<th>Clasifica</th>' : ''}<th>Pts</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function updateAdminUI() {
  document.getElementById("btn-add-participant").style.display = isAdmin() ? "" : "none";
}

function renderConfig() {
  const container = document.getElementById("sec-config");
  const admin = isAdmin();
  const disabled = admin ? "" : "disabled";

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>⚙️ Configuración de Puntos</h2>
        <p>${admin ? "Modifica el reparto de puntos para adaptarlo a tus reglas de juego." : "Solo el administrador puede modificar las reglas de puntuación."}</p>
      </div>
      ${!admin ? `<div class="info-box" style="margin:0; padding: 0.6rem 1rem; font-size:0.85rem;">🔒 Solo <strong>Jhon de Faria</strong> puede cambiar la configuración.</div>` : ""}
    </div>

    <div class="grid-two-cols">
      <div>
        <div class="config-card">
          <h3 style="font-size:1.1rem; font-weight:600; margin-bottom:1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            Puntos por Partido
          </h3>

          <div class="config-item">
            <div class="config-label">
              <h4>Resultado Exacto</h4>
              <p>Se acierta la cantidad exacta de goles de ambos equipos.</p>
            </div>
            <input type="number" class="config-input" id="cfg-exact" value="${state.config.exactScore}" ${disabled}>
          </div>

          <div class="config-item">
            <div class="config-label">
              <h4>Signo Acertado (Ganador/Empate)</h4>
              <p>Se acierta quién gana (1 o 2) o si empatan (X), pero no el marcador exacto.</p>
            </div>
            <input type="number" class="config-input" id="cfg-outcome" value="${state.config.outcome}" ${disabled}>
          </div>

          <div class="config-item">
            <div class="config-label">
              <h4>Acierto Clasificación (Eliminatorias)</h4>
              <p>Puntos extra por acertar quién clasifica a la siguiente fase (incluso por penales).</p>
            </div>
            <input type="number" class="config-input" id="cfg-qualifier" value="${state.config.qualifier}" ${disabled}>
          </div>
        </div>

        <div class="config-card">
          <h3 style="font-size:1.1rem; font-weight:600; margin-bottom:1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            Puntos Especiales (Bonus del Podio)
          </h3>

          <div class="config-item">
            <div class="config-label">
              <h4>Campeón del Mundo</h4>
              <p>Acertar al Campeón del Mundial 2026.</p>
            </div>
            <input type="number" class="config-input" id="cfg-champ" value="${state.config.champion}" ${disabled}>
          </div>

          <div class="config-item">
            <div class="config-label">
              <h4>Subcampeón del Mundo</h4>
              <p>Acertar al Subcampeón del Mundial 2026.</p>
            </div>
            <input type="number" class="config-input" id="cfg-runner" value="${state.config.runnerUp}" ${disabled}>
          </div>

          <div class="config-item">
            <div class="config-label">
              <h4>Semifinalista</h4>
              <p>Puntos por cada semifinalista acertado (máximo 4).</p>
            </div>
            <input type="number" class="config-input" id="cfg-semi" value="${state.config.semis}" ${disabled}>
          </div>
        </div>

        ${admin ? `<button class="btn btn-primary" id="btn-save-config" style="width:100%;">💾 Guardar Configuración</button>` : ""}
      </div>

      <div>
        <div class="info-box" style="margin-top:0;">
          <h3>ℹ️ ¿Cómo funciona la puntuación?</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 1rem;">
            Los puntos se calculan automáticamente cada vez que se carga el Ranking.
          </p>
          <ul style="display:flex; flex-direction:column; gap:0.75rem;">
            <li>Si aciertas el resultado exacto (ej: 2-1 y quedo 2-1) recibes los puntos de <strong>Resultado Exacto</strong>. NO se acumulan los de Signo.</li>
            <li>Si aciertas el ganador (ej: dijiste 1-0 y quedo 3-1), recibes los puntos de <strong>Signo Acertado</strong>.</li>
            <li>En partidos eliminatorios (Dieciseisavos a la Final), si el partido queda empate en 90 min y se define por penales, los goles considerados son los del tiempo regular (ej. 1-1). La clasificación se computa aparte con el botón <strong>Clasifica</strong>.</li>
            <li>Los puntos del podio final se calculan cruzando las predicciones de la pestaña <strong>Podio</strong> con los <strong>Resultados Reales</strong> definidos por el administrador.</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  if (!admin) return;
  document.getElementById("btn-save-config").addEventListener("click", async () => {
    state.config.exactScore = parseInt(document.getElementById("cfg-exact").value) || 0;
    state.config.outcome = parseInt(document.getElementById("cfg-outcome").value) || 0;
    state.config.qualifier = parseInt(document.getElementById("cfg-qualifier").value) || 0;
    state.config.champion = parseInt(document.getElementById("cfg-champ").value) || 0;
    state.config.runnerUp = parseInt(document.getElementById("cfg-runner").value) || 0;
    state.config.semis = parseInt(document.getElementById("cfg-semi").value) || 0;

    await saveMainDoc();
    showToast("Configuración de puntuación actualizada correctamente.");
  });
}

// --- Data / Import/Export Module ---
function renderData() {
  const container = document.getElementById("sec-data");
  
  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>💾 Respaldar y Compartir Datos</h2>
        <p>Exporta tu base de datos para no perder tus datos o impórtala en otros dispositivos.</p>
      </div>
    </div>

    <div class="grid-two-cols">
      <div class="panel-card">
        <h3 class="panel-title">📤 Exportar Datos</h3>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">
          Descarga un archivo JSON que contiene la configuración, participantes, marcadores oficiales y predicciones registradas hasta ahora. Puedes usarlo como copia de seguridad.
        </p>
        <button class="btn btn-primary" id="btn-export-act">📥 Descargar Archivo JSON</button>
      </div>

      <div class="panel-card" style="border-color: rgba(6, 182, 212, 0.2);">
        <h3 class="panel-title" style="color: var(--accent-cyan)">📥 Importar Datos</h3>
        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1.5rem;">
          Carga un archivo JSON previamente exportado. <strong style="color:var(--accent-rose)">¡Atención!</strong> Esto reemplazará todos los datos locales actuales.
        </p>
        
        <div class="file-upload-wrapper">
          <button class="btn btn-secondary" style="border-color: var(--accent-cyan); color: var(--accent-cyan);">📁 Seleccionar Archivo JSON</button>
          <input type="file" id="file-import-act" class="file-upload-input" accept=".json">
        </div>
      </div>
    </div>

    ${isAdmin() ? `
    <div class="panel-card" style="margin-top: 1.5rem;">
      <h3 class="panel-title" style="color: var(--accent-rose)">⚠️ Zona de Peligro</h3>
      <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1rem;">
        Borra toda la información cargada en el dispositivo para reiniciar la quiniela a su estado por defecto.
      </p>
      <button class="btn btn-danger" id="btn-reset-app">💥 Borrar Base de Datos por Completo</button>
    </div>
    ` : ''}
  `;

  document.getElementById("btn-export-act").addEventListener("click", exportData);
  document.getElementById("file-import-act").addEventListener("change", (e) => {
    if (!isAdmin()) { showToast("Solo el administrador puede importar datos.", "error"); e.target.value = ""; return; }
    importData(e);
  });
  if (isAdmin()) document.getElementById("btn-reset-app").addEventListener("click", resetDatabase);
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dlAnchorElem = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `quiniela_mundial_2026_backup_${dateStr}.json`);
  dlAnchorElem.click();
  showToast("Base de datos exportada y descargada.");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Reset input so the same file can be re-selected if needed
  e.target.value = "";

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);

      if (!parsed.config || !parsed.participants || !parsed.matches) {
        showToast("El archivo JSON no parece ser una copia de seguridad válida.", "error");
        return;
      }

      const numParticipants = state.participants.length;
      const confirmMsg =
        `⚠️ ATENCIÓN: Esta acción borrará TODOS los datos actuales.\n\n` +
        `Ahora mismo hay ${numParticipants} participante(s) con sus pronósticos en la base de datos.\n\n` +
        `¿Deseas hacer una copia de seguridad antes de continuar?\n\n` +
        `Pulsa OK para importar de todas formas (sin guardar copia).\n` +
        `Pulsa Cancelar para abortar y exportar primero.`;

      if (!confirm(confirmMsg)) {
        showToast("Importación cancelada. Exporta una copia de seguridad antes.", "error");
        return;
      }

      state = parsed;
      await importAllState(parsed);
      showToast("Datos importados con éxito. Recargando la aplicación...");

      const activeBtn = document.querySelector(".tab-btn.active");
      const activeTabId = activeBtn ? activeBtn.id.replace("tab-", "") : "dashboard";
      switchTab(activeTabId);
    } catch (err) {
      showToast("Error al procesar el archivo JSON.", "error");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

async function resetDatabase() {
  if (confirm("¿Estás absolutamente seguro de que deseas borrar toda la base de datos? Se perderán todos los participantes, pronósticos y resultados cargados.")) {
    if (db) {
      const [partsSnap, predsSnap, bonusSnap, matchesSnap] = await Promise.all([
        col("participants").get(),
        col("predictions").get(),
        col("bonus").get(),
        col("matches").get()
      ]);
      const refs = [
        ...partsSnap.docs.map(d => d.ref),
        ...predsSnap.docs.map(d => d.ref),
        ...bonusSnap.docs.map(d => d.ref),
        ...matchesSnap.docs.map(d => d.ref),
        mainRef()
      ];
      for (let i = 0; i < refs.length; i += 400) {
        const batch = db.batch();
        refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("quinielaUser");
    showToast("Datos borrados. Reiniciando...", "error");
    setTimeout(() => window.location.reload(), 1000);
  }
}

// --- Initialize Page ---
window.addEventListener("DOMContentLoaded", initApp);
