// --- HELPER: GET DATA FOR DAY ---
function getDayData(dayNum) {
    for (const stage of protocolData) {
        for (const week of stage.weeks) {
            const foundDay = week.days.find(d => d.day === dayNum);
            if (foundDay) return { ...foundDay, stage: stage };
        }
    }
    return { 
        day: dayNum, 
        focus: "Persistence", 
        morning: "Routine Maintenance", 
        mental: "Stay on Path", 
        mission: "Maintain Frame", 
        neuro: "Stabilizing",
        stage: protocolData[Math.floor((dayNum-1)/30)] || protocolData[0]
    };
}

// --- NEW: RANK SYSTEM LOGIC ---
function getRankName(level) {
    if (level <= 3) return "RECRUIT";      // Lv 1-3
    if (level <= 6) return "SCOUT";        // Lv 4-6
    if (level <= 9) return "OPERATOR";     // Lv 7-9
    if (level <= 12) return "VETERAN";     // Lv 10-12
    if (level <= 15) return "COMMANDER";   // Lv 13-15
    return "SOVEREIGN";                    // Lv 16+ (Max)
}

// --- STATE MANAGEMENT ---
let player = {
    level: 1, xp: 0, xpNeeded: 500, day: 1,
    stats: { vit: 0, mind: 0, soc: 0 },
    completedTasks: [], journal: {}, theme: 'light'
};

let chartsInitialized = false;
let charts = {};
let pendingModalAction = null;

function init() {
    loadData();
    applyTheme(player.theme);
    renderUI();
}

function saveData() { localStorage.setItem("protocol_v3", JSON.stringify(player)); renderUI(); }
function loadData() { const saved = localStorage.getItem("protocol_v3"); if (saved) player = JSON.parse(saved); }

// --- THEME LOGIC ---
function toggleTheme() {
    player.theme = player.theme === 'light' ? 'dark' : 'light';
    applyTheme(player.theme);
    saveData();
}

function applyTheme(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        btn.innerHTML = "☾";
    } else {
        document.documentElement.removeAttribute('data-theme');
        btn.innerHTML = "☀";
    }
    if (chartsInitialized) updateChartColors();
}

// --- MODAL FUNCTIONS ---
function showTacticalModal(title, msg, type = "alert", confirmCallback = null) {
    const modal = document.getElementById('tactical-modal');
    const titleEl = document.getElementById('t-modal-title');
    const msgEl = document.getElementById('t-modal-msg');
    const actionsEl = document.getElementById('t-modal-actions');
    
    titleEl.innerText = title;
    msgEl.innerText = msg;
    actionsEl.innerHTML = ""; 

    if (type === "alert") {
        actionsEl.innerHTML = `<button onclick="closeTacticalModal()">Thank You</button>`;
    } else if (type === "confirm") {
        pendingModalAction = confirmCallback;
        actionsEl.innerHTML = `
            <button class="danger" onclick="closeTacticalModal()">ABORT</button>
            <button onclick="executeModalAction()">CONFIRM</button>
        `;
    }
    modal.style.display = 'flex';
}

function closeTacticalModal() {
    document.getElementById('tactical-modal').style.display = 'none';
    pendingModalAction = null;
}

function executeModalAction() {
    if (pendingModalAction) pendingModalAction();
    closeTacticalModal();
}

// --- GAME LOGIC (XP & LEVELING) ---
function toggleTask(id, xp, type) {
    if (player.completedTasks.includes(id)) return;
    
    // Add XP & Stats
    player.completedTasks.push(id);
    player.xp += xp;
    player.stats[type]++;
    
    // Check Level Up
    if (player.xp >= player.xpNeeded) {
        player.xp -= player.xpNeeded; 
        player.level++;
        player.xpNeeded = Math.floor(player.xpNeeded * 1.2); // Scaling 20% harder
        
        // Get New Rank Name
        const newRank = getRankName(player.level);
        
        // Show Promotion Modal
        showTacticalModal(
            "FIELD PROMOTION", 
            `RANK PROMOTED TO [${newRank}]\nLEVEL: ${player.level}\nCAPACITY INCREASED.`, 
            "alert"
        );
    }
    saveData();
}

function finishDay() {
    showTacticalModal("DAILY TASKS", "COMPLETE DAY " + player.day + " AND SAVE PROGRESS?", "confirm", () => {
        player.day++;
        if(player.day > 90) player.day = 90;
        player.completedTasks = [];
        saveData();
        window.scrollTo(0,0);
        
        if (player.day === 31 || player.day === 61) {
            showTacticalModal("NEW STAGE", "CONGRATULATIONS! NEW STAGE UNLOCKED.", "alert");
            switchTab('info');
        } else {
            renderUI();
        }
    });
}

function saveJournal() {
    const txt = document.getElementById('journal-input').value;
    if (!txt) return;
    player.journal[new Date().toLocaleDateString()] = txt;
    saveData();
    document.getElementById('journal-status').style.display = 'block';
    setTimeout(() => document.getElementById('journal-status').style.display = 'none', 2000);
    document.getElementById('journal-input').value = "";
}

function resetData() {
    showTacticalModal("FACTORY RESET", "WARNING: ALL DATA WILL BE WIPED. PROCEED?", "confirm", () => {
        localStorage.removeItem("protocol_v3");
        location.reload();
    });
}

// --- RENDER UI ---
function renderUI() {
    // 1. Update Header Info (Level & Rank)
    const rankTitle = getRankName(player.level);
    document.getElementById('level-display').innerText = `LV.${player.level} ${rankTitle}`;
    
    document.getElementById('day-display').innerText = "DAY " + player.day;
    document.getElementById('xp-text').innerText = `${player.xp} / ${player.xpNeeded} XP`;
    document.getElementById('xp-bar').style.width = (player.xp / player.xpNeeded * 100) + "%";

    // 2. Stats
    document.getElementById('stat-vit').innerText = player.stats.vit;
    document.getElementById('stat-mind').innerText = player.stats.mind;
    document.getElementById('stat-soc').innerText = player.stats.soc;

    // 3. Biometrics UI
    const currentStageVal = Math.ceil(player.day / 30) || 1;
    const safeStage = currentStageVal > 3 ? 3 : currentStageVal;
    if (document.getElementById('bio-stage')) {
        document.getElementById('bio-stage').innerText = "STAGE " + safeStage;
        document.getElementById('bio-xp').innerText = player.xp + " XP";
    }

    // 4. Missions List
    const currentData = getDayData(player.day);
    document.getElementById('mission-header').innerText = "LOG: DAY " + player.day;
    document.getElementById('daily-focus').innerText = "FOCUS: " + (currentData.focus ? currentData.focus.toUpperCase() : "UNKNOWN");

    const list = document.getElementById('task-list');
    list.innerHTML = "";

    const tasks = [
        { id: `d${player.day}_morn`, text: "PHYSIO: " + currentData.morning, xp: 100, type: 'vit' },
        { id: `d${player.day}_ment`, text: "PSYCH: " + currentData.mental, xp: 150, type: 'mind' },
        { id: `d${player.day}_miss`, text: "MISSION: " + currentData.mission, xp: 200, type: 'soc' }
    ];

    tasks.forEach(t => {
        const isDone = player.completedTasks.includes(t.id);
        list.innerHTML += `
            <div class="task-item ${isDone ? 'completed' : ''}" onclick="toggleTask('${t.id}', ${t.xp}, '${t.type}')">
                <div class="checkbox"></div>
                <span style="flex-grow:1; font-size:0.8rem;">${t.text}</span>
                <span class="xp-tag">+${t.xp}XP</span>
            </div>`;
    });

    // 5. Journal History
    const hist = document.getElementById('journal-history');
    hist.innerHTML = "";
    Object.keys(player.journal).reverse().forEach(date => {
        hist.innerHTML += `<div style="margin-bottom:10px; border-bottom:1px dashed var(--accent); padding-bottom:5px;"><strong style="color:var(--text-main)">> ${date}</strong><br>${player.journal[date]}</div>`;
    });
}

// --- DASHBOARD & CHART LOGIC (SAMA SEPERTI SEBELUMNYA) ---
function manualSetStage(id) { setStageUI(id); }

function setStageUI(stageId) {
    const data = protocolData[stageId - 1];
    if (!data) return;
    document.querySelectorAll('.stage-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-stage-${stageId}`).classList.add('active');
    document.getElementById('stage-title').innerText = data.title;
    document.getElementById('stage-theme').innerText = data.subtitle || data.theme;
    document.getElementById('stage-desc').innerText = data.description;
    const msContainer = document.getElementById('stage-milestones');
    msContainer.innerHTML = '';
    data.weeks.forEach(week => {
        msContainer.innerHTML += `<div class="milestone-item"><span class="check-icon">✓</span> Week ${week.week}: ${week.theme}</div>`;
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    if (tabId === 'info') {
        if (!chartsInitialized) { setTimeout(initCharts, 100); chartsInitialized = true; }
        const currentStageIdx = Math.ceil(player.day / 30);
        setStageUI(currentStageIdx > 3 ? 3 : (currentStageIdx || 1));
    }
}

function toggleEmergency() {
    const modal = document.getElementById('emergency-modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function initCharts() {
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-main');
    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent');
    const fontConfig = { family: 'Courier New', size: 10 };
    const maxStat = 90; 
    const normalize = (val) => Math.min(100, Math.round((val / maxStat) * 100));

    const radarData = [
        normalize((player.stats.vit + player.stats.soc) / 2),
        normalize(player.stats.mind),
        normalize(player.stats.soc),
        normalize(player.stats.vit),
        normalize(player.stats.soc)
    ];

    const ctxNeuro = document.getElementById('neuroChart').getContext('2d');
    charts.neuro = new Chart(ctxNeuro, {
        type: 'line',
        data: {
            labels: ['Start', 'D15', 'D30', 'D45', 'D60', 'D75', 'Finish'],
            datasets: [
                { label: 'Craving', data: [100, 80, 40, 30, 20, 15, 5], borderColor: '#D65D5D', borderWidth: 2, pointRadius: 0 },
                { label: 'Confidence', data: [20, 25, 35, 55, 70, 85, 100], borderColor: accentColor, backgroundColor: accentColor + '33', fill: true, borderWidth: 2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor, font: fontConfig } } }, scales: { x: { ticks: { color: textColor } }, y: { display: false } } }
    });

    const ctxRadar = document.getElementById('radarChart').getContext('2d');
    charts.radar = new Chart(ctxRadar, {
        type: 'radar',
        data: {
            labels: ['Voice', 'Boundaries', 'Eye', 'Nerves', 'Social'],
            datasets: [
                { label: 'Target', data: [90, 95, 90, 95, 85], borderColor: accentColor, backgroundColor: accentColor + '55', borderWidth: 2 },
                { label: 'Current Build', data: radarData, borderColor: '#FFFFFF', borderDash: [5,5], pointRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor, font: fontConfig } } }, scales: { r: { ticks: { display: false, backdropColor: 'transparent' }, grid: { color: '#888' }, pointLabels: { color: textColor, font: fontConfig } } } }
    });
}

function updateChartColors() {
    if(charts.neuro) charts.neuro.destroy();
    if(charts.radar) charts.radar.destroy();
    initCharts();
}

init();