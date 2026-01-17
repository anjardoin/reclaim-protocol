// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyBdMPEZymzoBoh9SsL2Ih0k8E1cq3a0mJk",
    authDomain: "reclaim-protocol-101.firebaseapp.com",
    projectId: "reclaim-protocol-101",
    storageBucket: "reclaim-protocol-101.firebasestorage.app",
    messagingSenderId: "130134213935",
    appId: "1:130134213935:web:2d6a42bcc93d020e350dda"
  };

// Initialize Vars
let auth, db;
let currentUser = null;
let unsubscribeDoc = null; 
let isCloudMode = false;

// Cek Firebase SDK
if (typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        console.log("Firebase SDK loaded.");
    } catch (e) { console.error("Firebase Init Error:", e); }
}

// --- STATE MANAGEMENT ---
const defaultState = {
    level: 1, xp: 0, xpNeeded: 500, day: 1,
    stats: { vit: 0, mind: 0, soc: 0 },
    completedTasks: [], journal: {}, theme: 'light'
};

let player = { ...defaultState };
let chartsInitialized = false;
let charts = {};
let pendingModalAction = null;

// --- INITIALIZATION ---
function init() {
    console.log("System Initializing...");
    
    // 1. Load LocalStorage (Guest Mode) agar UI langsung muncul
    loadLocalData(); 
    
    // 2. Setup Event Listeners
    setupEventListeners();

    // 3. Cek Koneksi Firebase
    if (auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                currentUser = user;
                isCloudMode = true;
                updateConnectionStatus("online");
                loadCloudData(user.uid);
            } else {
                currentUser = null;
                isCloudMode = false;
                updateConnectionStatus("offline");
                if (unsubscribeDoc) unsubscribeDoc();
                loadLocalData();
            }
            renderAccountUI();
        });
    } else {
        renderAccountUI();
    }
}

// --- DATA HANDLING ---
function loadLocalData() {
    try {
        const saved = localStorage.getItem("protocol_v3");
        if (saved) {
            player = JSON.parse(saved);
            console.log("Loaded from LocalStorage.");
        } else {
            player = { ...defaultState };
        }
        applyTheme(player.theme);
        renderUI();
    } catch (e) {
        console.error("Local Load Error:", e);
        player = { ...defaultState };
    }
}

function loadCloudData(uid) {
    if (!db) return;
    const userRef = db.collection('users').doc(uid);
    unsubscribeDoc = userRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            player = { ...defaultState, ...data };
            applyTheme(player.theme);
            renderUI(); // Render ulang UI dengan data baru
            
            // Jika sedang di tab info, update chart juga
            if (document.getElementById('tab-info').classList.contains('active')) {
                updateChartColors();
            }
            console.log("Synced from Cloud.");
        } else {
            console.log("New cloud user. Uploading local progress...");
            userRef.set(player);
        }
    });
}

function saveData() {
    localStorage.setItem("protocol_v3", JSON.stringify(player));
    if (isCloudMode && currentUser && db) {
        db.collection('users').doc(currentUser.uid).update(player).catch(e => {
            db.collection('users').doc(currentUser.uid).set(player);
        });
    }
}

function resetData() {
    showTacticalModal("FACTORY RESET", "WIPE ALL DATA (LOCAL & CLOUD)?", "confirm", () => {
        // Reset player state to default
        player = { ...defaultState };
        
        // 1. Reset Local Storage
        saveData(); // This saves the reset 'player' object to local storage

        // 2. Reset Cloud Data (If logged in)
        if (isCloudMode && currentUser && db) {
            // Option A: Set cloud data to defaultState (Overwrite) - SAFER
            db.collection('users').doc(currentUser.uid).set(player)
                .then(() => {
                    console.log("Cloud data reset successfully.");
                    location.reload();
                })
                .catch((error) => {
                    console.error("Error resetting cloud data: ", error);
                    showTacticalModal("ERROR", "Failed to reset cloud data.", "alert");
                });
                
            // Option B: Delete the document entirely (User starts fresh next login)
            // db.collection('users').doc(currentUser.uid).delete().then(...)
        } else {
            // Only local reset needed
            location.reload();
        }
    });
}

// --- UI UPDATES ---
function updateConnectionStatus(status) {
    const el = document.getElementById('connection-status');
    const txt = document.getElementById('storage-status');
    if (el && txt) {
        if (status === 'online') {
            el.classList.remove('offline'); el.classList.add('online');
            el.title = "Connected to Cloud";
            txt.innerText = "Cloud Synced";
            txt.style.color = "var(--status-online)";
        } else {
            el.classList.remove('online'); el.classList.add('offline');
            el.title = "Local Storage Only";
            txt.innerText = "Local Storage";
            txt.style.color = "var(--text-dim)";
        }
    }
}

function renderAccountUI() {
    const container = document.getElementById('account-ui');
    if (!container) return;

    if (isCloudMode && currentUser) {
        container.innerHTML = `
            <span class="account-status-text" style="color:var(--accent)">OPERATOR IDENTIFIED</span>
            <p class="small-text">${currentUser.email}</p>
            <button class="danger" id="btn-logout">DISCONNECT (LOGOUT)</button>
        `;
        document.getElementById('btn-logout').onclick = logout;
    } else {
        container.innerHTML = `
            <span class="account-status-text" style="color:var(--text-dim)">GUEST MODE (LOCAL)</span>
            <p class="small-text">Data disimpan di browser ini. Login untuk sync antar device.</p>
            <button class="google-btn" id="btn-login-google">[o] SYNC WITH GOOGLE</button>
        `;
        document.getElementById('btn-login-google').onclick = loginWithGoogle;
    }
}

// --- AUTH ACTIONS ---
function loginWithGoogle() {
    if (!auth) return alert("Firebase not configured! Check function.js");
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(e => showTacticalModal("LOGIN ERROR", e.message, "alert"));
}

function logout() {
    showTacticalModal("CONFIRM LOGOUT", "RETURN TO LOCAL MODE?", "confirm", () => {
        if(auth) auth.signOut();
    });
}

// --- GAMEPLAY LOGIC ---
function toggleTask(id, xp, type) {
    if (player.completedTasks.includes(id)) return;
    player.completedTasks.push(id);
    player.xp += xp;
    player.stats[type]++;
    
    if (player.xp >= player.xpNeeded) {
        player.xp -= player.xpNeeded; 
        player.level++;
        player.xpNeeded = Math.floor(player.xpNeeded * 1.2);
        showTacticalModal("PROMOTION", `RANK: ${getRankName(player.level)}`, "alert");
    }
    saveData();
    renderUI();
}

function finishDay() {
    showTacticalModal("DAILY TASK", `COMPLETE DAY ${player.day}?`, "confirm", () => {
        player.day++;
        if(player.day > 90) player.day = 90;
        player.completedTasks = [];
        if (player.day === 31 || player.day === 61) {
            showTacticalModal("NEW STAGE", "STAGE UNLOCKED.", "alert");
            switchTab('info');
        }
        saveData();
        renderUI();
        window.scrollTo(0,0);
    });
}

function saveJournal() {
    const input = document.getElementById('journal-input');
    if (!input.value) return;
    player.journal[new Date().toLocaleDateString()] = input.value;
    
    const status = document.getElementById('journal-status');
    status.style.display = 'block';
    setTimeout(() => status.style.display = 'none', 2000);
    input.value = "";
    saveData();
    renderUI();
}

// --- RENDERING HELPERS ---
function getDayData(dayNum) {
    // Pastikan protocolData loaded
    if (typeof protocolData === 'undefined') {
        console.error("protocolData is missing! Make sure data.js is loaded before script.js");
        return {}; 
    }
    for (const stage of protocolData) {
        for (const week of stage.weeks) {
            const foundDay = week.days.find(d => d.day === dayNum);
            if (foundDay) return { ...foundDay, stage: stage };
        }
    }
    return { 
        day: dayNum, focus: "Persistence", morning: "Routine", mental: "Focus", mission: "Grind", neuro: "Stable",
        stage: protocolData[Math.floor((dayNum-1)/30)] || protocolData[0]
    };
}

function getRankName(level) {
    if (level <= 3) return "RECRUIT";
    if (level <= 6) return "SCOUT";
    if (level <= 9) return "OPERATOR";
    if (level <= 12) return "VETERAN";
    if (level <= 15) return "COMMANDER";
    return "SOVEREIGN";
}

function renderUI() {
    const lvlDisplay = document.getElementById('level-display');
    if(lvlDisplay) lvlDisplay.innerText = `LV.${player.level} ${getRankName(player.level)}`;
    
    document.getElementById('day-display').innerText = "DAY " + player.day;
    document.getElementById('xp-text').innerText = `${player.xp} / ${player.xpNeeded} XP`;
    document.getElementById('xp-bar').style.width = (player.xp / player.xpNeeded * 100) + "%";

    document.getElementById('stat-vit').innerText = player.stats.vit;
    document.getElementById('stat-mind').innerText = player.stats.mind;
    document.getElementById('stat-soc').innerText = player.stats.soc;

    const stgIdx = Math.ceil(player.day / 30) || 1;
    const bioStage = document.getElementById('bio-stage');
    if(bioStage) bioStage.innerText = `STAGE ${stgIdx > 3 ? 3 : stgIdx}`;
    
    const bioXp = document.getElementById('bio-xp');
    if(bioXp) bioXp.innerText = player.xp + " XP";

    const currentData = getDayData(player.day);
    if(currentData.focus) {
        document.getElementById('mission-header').innerText = `LOG: DAY ${player.day}`;
        document.getElementById('daily-focus').innerText = `FOCUS: ${currentData.focus.toUpperCase()}`;
    
        const list = document.getElementById('task-list');
        list.innerHTML = "";
        
        const tasks = [
            { id: `d${player.day}_morn`, text: `PHYSIO: ${currentData.morning}`, xp: 100, type: 'vit' },
            { id: `d${player.day}_ment`, text: `PSYCH: ${currentData.mental}`, xp: 150, type: 'mind' },
            { id: `d${player.day}_miss`, text: `MISSION: ${currentData.mission}`, xp: 200, type: 'soc' }
        ];
    
        tasks.forEach(t => {
            const isDone = player.completedTasks.includes(t.id);
            const div = document.createElement('div');
            div.className = `task-item ${isDone ? 'completed' : ''}`;
            div.innerHTML = `<div class="checkbox"></div><span style="flex-grow:1; font-size:0.8rem;">${t.text}</span><span class="xp-tag">+${t.xp}XP</span>`;
            div.onclick = () => toggleTask(t.id, t.xp, t.type);
            list.appendChild(div);
        });
    }

    const hist = document.getElementById('journal-history');
    hist.innerHTML = "";
    Object.keys(player.journal).reverse().forEach(date => {
        hist.innerHTML += `<div style="margin-bottom:10px; border-bottom:1px dashed var(--accent); padding-bottom:5px;"><strong style="color:var(--text-main)">> ${date}</strong><br>${player.journal[date]}</div>`;
    });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab);
    });

    const stageBtns = document.querySelectorAll('.stage-btn');
    stageBtns.forEach((btn, idx) => {
        btn.onclick = () => manualSetStage(idx + 1);
    });

    const btnTheme = document.getElementById('theme-toggle-btn');
    if(btnTheme) btnTheme.onclick = toggleTheme;

    const btnFinish = document.getElementById('btn-finish-day');
    if(btnFinish) btnFinish.onclick = finishDay;

    const btnSaveJournal = document.getElementById('btn-save-journal');
    if(btnSaveJournal) btnSaveJournal.onclick = saveJournal;

    const btnReset = document.getElementById('btn-reset-data');
    if(btnReset) btnReset.onclick = resetData;
    
    const btnEmerg = document.getElementById('btn-emergency');
    if(btnEmerg) btnEmerg.onclick = () => document.getElementById('emergency-modal').style.display = 'flex';
    
    const btnCloseEmerg = document.getElementById('btn-close-emergency');
    if(btnCloseEmerg) btnCloseEmerg.onclick = () => document.getElementById('emergency-modal').style.display = 'none';
}

// --- HELPERS (Tabs, Theme, Charts) ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const targetTab = document.getElementById('tab-' + tabId);
    if(targetTab) targetTab.classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    // INISIALISASI CHART HANYA JIKA TAB INFO DIBUKA
    if (tabId === 'info') {
        setTimeout(() => {
            // Cek apakah chart canvas visible dan belum init
            if (!chartsInitialized) {
                initCharts();
                chartsInitialized = true;
            } else {
                updateChartColors();
            }
        }, 100); // Delay kecil agar DOM rendering selesai
        
        const currentStageIdx = Math.ceil(player.day / 30);
        setStageUI(currentStageIdx > 3 ? 3 : (currentStageIdx || 1));
    }
}

function manualSetStage(id) { setStageUI(id); }
function setStageUI(stageId) {
    if (typeof protocolData === 'undefined') return;
    const data = protocolData[stageId - 1];
    if (!data) return;

    document.querySelectorAll('.stage-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-stage-${stageId}`);
    if(activeBtn) activeBtn.classList.add('active');

    document.getElementById('stage-title').innerText = data.title;
    document.getElementById('stage-theme').innerText = data.subtitle || data.theme;
    document.getElementById('stage-desc').innerText = data.description;
    
    const msContainer = document.getElementById('stage-milestones');
    msContainer.innerHTML = '';
    if(data.weeks) {
        data.weeks.forEach(w => {
            msContainer.innerHTML += `<div class="milestone-item"><span class="check-icon">✓</span> W${w.week}: ${w.theme}</div>`;
        });
    }
}

function toggleTheme() {
    player.theme = player.theme === 'light' ? 'dark' : 'light';
    applyTheme(player.theme);
    saveData();
}

function applyTheme(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if(btn) btn.innerHTML = "☾";
    } else {
        document.documentElement.removeAttribute('data-theme');
        if(btn) btn.innerHTML = "☀";
    }
    if (chartsInitialized) updateChartColors();
}

function showTacticalModal(title, msg, type = "alert", confirmCallback = null) {
    const modal = document.getElementById('tactical-modal');
    document.getElementById('t-modal-title').innerText = title;
    document.getElementById('t-modal-msg').innerText = msg;
    const actions = document.getElementById('t-modal-actions');
    actions.innerHTML = "";

    if (type === 'alert') {
        const btn = document.createElement('button');
        btn.innerText = "ACKNOWLEDGED";
        btn.onclick = closeTacticalModal;
        actions.appendChild(btn);
    } else {
        const btnNo = document.createElement('button');
        btnNo.className = "danger"; btnNo.innerText = "ABORT"; btnNo.onclick = closeTacticalModal;
        
        const btnYes = document.createElement('button');
        btnYes.innerText = "CONFIRM";
        btnYes.onclick = () => { confirmCallback(); closeTacticalModal(); };
        
        actions.appendChild(btnNo); actions.appendChild(btnYes);
    }
    modal.style.display = 'flex';
}

function closeTacticalModal() { document.getElementById('tactical-modal').style.display = 'none'; }

// --- CHART GENERATION (FIXED) ---
function initCharts() {
    const ctxN = document.getElementById('neuroChart');
    const ctxR = document.getElementById('radarChart');

    // Cek apakah elemen ada sebelum mencoba membuat chart
    if (!ctxN || !ctxR) {
        console.warn("Chart elements not found yet.");
        return;
    }

    const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim();
    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    const fontConfig = { family: 'Courier New', size: 10 };
    
    // Data Radar dinamis berdasarkan stats
    const maxStat = 90;
    const norm = (v) => Math.min(100, Math.round((v/maxStat)*100));
    const radarData = [norm(player.stats.vit), norm(player.stats.mind), norm(player.stats.soc), norm(player.stats.vit), norm(player.stats.soc)];

    // 1. NEURO CHART
    charts.neuro = new Chart(ctxN.getContext('2d'), {
        type: 'line',
        data: {
            labels: ['Start', 'D15', 'D30', 'D45', 'D60', 'D75', 'Finish'],
            datasets: [
                { label: 'Craving', data: [100, 80, 40, 30, 20, 15, 5], borderColor: '#D65D5D', borderWidth: 2, pointRadius: 0 },
                { label: 'Confidence', data: [20, 25, 35, 55, 70, 85, 100], borderColor: accentColor, backgroundColor: accentColor + '33', fill: true, borderWidth: 2 }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { x: { ticks: { color: textColor } }, y: { display: false } },
            plugins: { legend: { labels: { color: textColor, font: fontConfig } } } 
        }
    });

    // 2. RADAR CHART
    charts.radar = new Chart(ctxR.getContext('2d'), {
        type: 'radar',
        data: {
            labels: ['VIT', 'MND', 'SOC', 'RES', 'LEAD'],
            datasets: [{ 
                label: 'Current', 
                data: radarData, 
                borderColor: accentColor, 
                backgroundColor: accentColor+'33',
                pointBackgroundColor: accentColor
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { 
                r: { 
                    grid: { color: '#888' }, 
                    pointLabels: { color: textColor, font: fontConfig },
                    ticks: { display: false, backdropColor: 'transparent' }
                } 
            }, 
            plugins: { legend: { display: false } } 
        }
    });
}

function updateChartColors() {
    if(charts.neuro) charts.neuro.destroy();
    if(charts.radar) charts.radar.destroy();
    initCharts();
}

// --- START APPLICATION ---
document.addEventListener('DOMContentLoaded', () => {
    init();
});