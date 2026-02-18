// === Constants ===
const API_BASE = '';

// === Utility ===

function formatNumber(num) {
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// === Theme ===

function getTheme() {
    return localStorage.getItem('corbitt_theme') || 'dark';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('corbitt_theme', theme);
}

function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// === Language ===

function getLang() {
    return localStorage.getItem('corbitt_lang') || 'ar';
}

function applyLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    localStorage.setItem('corbitt_lang', lang);

    document.querySelectorAll('[data-ar][data-en]').forEach(function(el) {
        el.textContent = el.getAttribute('data-' + lang);
    });
}

function toggleLang() {
    applyLang(getLang() === 'ar' ? 'en' : 'ar');
}

// === Dashboard State ===
// Server sends a snapshot, we animate expenses locally using expPerSecond

var snapshot = null;
var snapshotTime = 0; // timestamp when we received the snapshot

function fetchSnapshot() {
    fetch(API_BASE + '/api/get-revenue')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            snapshot = data;
            snapshotTime = Date.now();
        })
        .catch(function(err) {
            console.error('Failed to fetch:', err);
        });
}

function updateDashboard() {
    if (!snapshot) return;

    var expTodayEl = document.getElementById('expensesToday');
    if (!expTodayEl) return;

    // Seconds elapsed since snapshot
    var elapsed = (Date.now() - snapshotTime) / 1000;
    var expTick = snapshot.expPerSecond * elapsed;
    var revTick = (snapshot.revPerSecond || 0) * elapsed;

    // Expenses: snapshot + local tick
    var expToday = snapshot.expensesToday + expTick;
    var expMonth = snapshot.expensesMonth + expTick;
    var expYear = snapshot.expensesYear + expTick;

    expTodayEl.textContent = formatNumber(expToday);
    document.getElementById('expensesMonth').textContent = formatNumber(expMonth);
    document.getElementById('expensesYear').textContent = formatNumber(expYear);

    // Revenue: snapshot + local tick (moves per second like expenses)
    var revToday = snapshot.revenueToday + revTick;
    var revMonth = snapshot.revenueMonth + revTick;
    var revYear = snapshot.revenueYear + revTick;

    document.getElementById('revenueToday').textContent = formatNumber(revToday);
    document.getElementById('revenueMonth').textContent = formatNumber(revMonth);
    document.getElementById('revenueYear').textContent = formatNumber(revYear);

    // Net result
    var net = revYear - expYear;
    var sign = net >= 0 ? '+' : '';
    var netResultEl = document.getElementById('netResult');
    var netResultCard = document.getElementById('netResultCard');
    var netLabelEl = document.getElementById('netLabel');

    netResultEl.textContent = sign + formatNumber(net);

    var lang = getLang();
    netResultCard.classList.remove('positive', 'negative');
    if (net >= 0) {
        netResultCard.classList.add('positive');
        netLabelEl.setAttribute('data-ar', 'ربح');
        netLabelEl.setAttribute('data-en', 'Profit');
        netLabelEl.textContent = lang === 'ar' ? 'ربح' : 'Profit';
    } else {
        netResultCard.classList.add('negative');
        netLabelEl.setAttribute('data-ar', 'خسارة');
        netLabelEl.setAttribute('data-en', 'Loss');
        netLabelEl.textContent = lang === 'ar' ? 'خسارة' : 'Loss';
    }
}

// === Clock ===

function updateClock() {
    var timeEl = document.getElementById('clockTime');
    if (!timeEl) return;

    var now = new Date();
    var lang = getLang();

    // Time: HH:MM:SS
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    timeEl.textContent = h + ':' + m + ':' + s;

    // Date
    var dateEl = document.getElementById('clockDate');
    if (lang === 'ar') {
        dateEl.textContent = now.toLocaleDateString('ar-SA', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    } else {
        dateEl.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}

// === Initialize ===

applyTheme(getTheme());
applyLang(getLang());

if (document.getElementById('expensesToday')) {
    // Fetch once from server, re-fetch every 5 minutes to stay synced
    fetchSnapshot();
    setInterval(fetchSnapshot, 300000);

    // Animate every second: dashboard + clock
    updateClock();
    updateDashboard();
    setInterval(function() {
        updateClock();
        updateDashboard();
    }, 1000);
}
