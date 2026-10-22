/*
 * Checklist mode + admin-login — QR's egen opsætning.
 *
 * Kilden er Checklist-kittet (teambattle-workspace/checklist-kit, udgaven uden
 * React). checklist-loader.js og checklist-mode.js er kopier derfra og må IKKE
 * rettes her — ret i kittet og kopiér dist/ ud igen.
 *
 * Admin-login: koden tjekkes på SERVEREN af den fælles edge function
 * ef-verify-code på Supabase MAIN — ingen kode står i klienten. Admin =
 * svaret type 'admin' (master-koden) eller type 'user_sites' med rolle
 * admin/ef_admin. 5 forkerte forsøg → 60 sek. pause. Sessionen ligger i
 * localStorage 'qr_admin_session' = { name, expiresAt } i 12 timer; «Log ud»
 * rydder den, og laget slukker selv, når den er væk eller udløbet.
 *
 * Login gater KUN Checklist mode — appens åbne «Admin»-fane er uændret.
 * Ny fane i appen = én række i SCREENS (nøglen er '/' + fanens data-tab).
 */
(function () {
  var SESSION_KEY = 'qr_admin_session';
  var SESSION_MS = 12 * 60 * 60 * 1000;
  var MAX_ATTEMPTS = 5;
  var LOCK_MS = 60 * 1000;
  var VERIFY_URL = 'https://ilbjytyukicbssqftmma.supabase.co/functions/v1/ef-verify-code';
  // MAIN's offentlige anon-nøgle (samme som appen selv og kittets cmMainClient bruger).
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYmp5dHl1a2ljYnNzcWZ0bW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MzA0NjEsImV4cCI6MjA3MDQwNjQ2MX0.I_PWByMPcOYhWgeq9MxXgOo-NCZYfEuzYmo35XnBFAY';

  // ── Session ─────────────────────────────────────────────────────────
  function readSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s && typeof s.expiresAt === 'number' && s.expiresAt > Date.now()) return s;
      if (s) localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* privat fane / blokeret lager */ }
    return null;
  }
  function writeSession(name) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ name: name || 'Admin', expiresAt: Date.now() + SESSION_MS })); } catch (e) {}
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function isAdmin() { return !!readSession(); }

  // ── Skærm → fil (én side; fanerne er skærmene) ─────────────────────
  function routeKey() {
    var tab = document.querySelector('.tab.active');
    return '/' + ((tab && tab.getAttribute('data-tab')) || 'generator');
  }
  var SCREENS = [
    { path: '/generator', label: 'Generator', file: 'index.html' },
    { path: '/saved', label: 'Archive (arkiv)', file: 'index.html' },
    { path: '/scanner', label: 'Scanner', file: 'index.html' },
    { path: '/admin', label: 'Admin-fanen (backup + forklaring)', file: 'index.html' },
  ];

  function appVersion() {
    var b = document.querySelector('.version-badge');
    return b ? b.textContent.trim().replace(/^v/i, '') : '';
  }

  window.CHECKLIST_KIT = {
    app: 'qr',
    appName: 'QR',
    src: 'checklist/checklist-mode.js',
    isAdmin: isAdmin,
    routeKey: routeKey,
    screens: SCREENS,
    get version() { return appVersion(); },
  };

  // ── Login mod serveren ─────────────────────────────────────────────
  var attempts = 0;
  var lockedUntil = 0;

  function verify(code) {
    return fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
      body: JSON.stringify({ code: code }),
    }).then(function (res) {
      // Et afvist svar kan komme som 4xx med JSON — læs det alligevel.
      return res.json().catch(function () { return {}; });
    });
  }

  function adminNameFrom(data) {
    if (!data) return null;
    if (data.type === 'admin') return data.adminName || 'Admin';
    if (data.type === 'user_sites' && (data.role === 'admin' || data.role === 'ef_admin')) return data.name || 'Admin';
    return null;
  }

  // ── UI ─────────────────────────────────────────────────────────────
  var LOCK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" style="width:12px;height:12px;flex:none" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" style="width:12px;height:12px;flex:none" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';

  var CSS = [
    '.qr-admin-bar{position:fixed;top:52px;right:25px;z-index:50;display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;max-width:calc(100vw - 50px)}',
    '.qr-admin-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.04);border-radius:10px;font-family:\'Segoe UI\',monospace;cursor:pointer;transition:all .25s ease}',
    '.qr-admin-btn:hover{color:#ff6600;border-color:rgba(255,102,0,0.5);background:rgba(255,102,0,0.1)}',
    '.qr-admin-btn.on{color:#ff6600;border-color:rgba(255,102,0,0.5);background:rgba(255,102,0,0.08)}',
    '@media (max-width:600px){.qr-admin-bar{top:auto;bottom:calc(14px + env(safe-area-inset-bottom,0px));right:14px}}',
    '.qr-admin-box input.qr-admin-code{width:100%;padding:12px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;font-size:22px;letter-spacing:10px;text-align:center;font-family:inherit;margin-bottom:10px}',
    '.qr-admin-box input.qr-admin-code:focus{outline:none;border-color:#ff6600;box-shadow:0 0 10px rgba(255,102,0,0.2)}',
    '.qr-admin-err{min-height:18px;font-size:12px;color:#ff5577;margin-bottom:10px}',
  ].join('\n');

  var bar, dialog, input, errEl, okBtn;

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function renderBar() {
    if (!bar) return;
    var s = readSession();
    bar.innerHTML = '';
    if (s) {
      var cm = el('button', { type: 'button', class: 'qr-admin-btn on', 'data-testid': 'qr-checklist' }, CHECK_SVG + '<span>Checklist mode</span>');
      cm.onclick = function () { if (window.ChecklistKit) window.ChecklistKit.openPanel(); };
      var out = el('button', { type: 'button', class: 'qr-admin-btn', 'data-testid': 'qr-admin-logout', title: 'Logget ind som ' + s.name }, LOCK_SVG + '<span>Admin · Log ud</span>');
      out.onclick = function () { clearSession(); renderBar(); };
      bar.appendChild(cm);
      bar.appendChild(out);
    } else {
      var login = el('button', { type: 'button', class: 'qr-admin-btn', 'data-testid': 'qr-admin-login' }, LOCK_SVG + '<span>Admin</span>');
      login.onclick = openDialog;
      bar.appendChild(login);
    }
  }

  function setError(msg) { if (errEl) errEl.textContent = msg || ''; }

  function openDialog() {
    if (!dialog) buildDialog();
    input.value = '';
    setError(Date.now() < lockedUntil ? 'For mange forkerte forsøg — vent lidt.' : '');
    // role=dialog kun mens den er åben — ellers melder Checklist mode en skjult dialog som skærmens tilstand.
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.classList.add('show');
    setTimeout(function () { input.focus(); }, 30);
  }
  function closeDialog() {
    if (!dialog) return;
    dialog.classList.remove('show');
    dialog.removeAttribute('role');
    dialog.removeAttribute('aria-modal');
  }

  function buildDialog() {
    dialog = el('div', { class: 'modal', 'data-testid': 'qr-admin-dialog', 'aria-labelledby': 'qr-admin-title' });
    dialog.innerHTML =
      '<form class="modal-box qr-admin-box" novalidate>' +
      '<h3 id="qr-admin-title">Admin-login</h3>' +
      '<div class="modal-msg">Skriv din admin-kode.</div>' +
      '<input class="qr-admin-code" data-testid="qr-admin-code" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="12" aria-label="Admin-kode">' +
      '<div class="qr-admin-err" data-testid="qr-admin-error" role="alert"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="cancel">Annuller</button>' +
      '<button type="submit" class="btn primary" data-testid="qr-admin-submit">Log ind</button>' +
      '</div></form>';
    document.body.appendChild(dialog);
    input = dialog.querySelector('input');
    errEl = dialog.querySelector('.qr-admin-err');
    okBtn = dialog.querySelector('[type=submit]');
    dialog.querySelector('[data-act=cancel]').onclick = closeDialog;
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });
    dialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDialog(); });
    dialog.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  }

  function submit() {
    var code = (input.value || '').trim();
    if (!code) return;
    if (Date.now() < lockedUntil) {
      setError('For mange forkerte forsøg — prøv igen om ' + Math.ceil((lockedUntil - Date.now()) / 1000) + ' sek.');
      return;
    }
    okBtn.disabled = true;
    setError('');
    verify(code)
      .then(function (data) {
        var name = adminNameFrom(data);
        if (name) {
          attempts = 0;
          writeSession(name);
          closeDialog();
          renderBar();
          return;
        }
        fail('Koden giver ikke admin-adgang.');
      })
      .catch(function () { setError('Kunne ikke nå serveren — tjek forbindelsen og prøv igen.'); })
      .then(function () { okBtn.disabled = false; });
  }

  function fail(msg) {
    attempts += 1;
    input.value = '';
    if (attempts >= MAX_ATTEMPTS) {
      attempts = 0;
      lockedUntil = Date.now() + LOCK_MS;
      setError('For mange forkerte forsøg — prøv igen om 60 sek.');
    } else {
      setError(msg + ' (' + (MAX_ATTEMPTS - attempts) + ' forsøg tilbage)');
    }
    input.focus();
  }

  function boot() {
    var style = el('style', {}, CSS);
    document.head.appendChild(style);
    bar = el('div', { class: 'qr-admin-bar', 'data-testid': 'qr-admin-bar' });
    document.body.appendChild(bar);
    renderBar();
    // Udløb og log ud i en anden fane: knapperne følger med (laget tjekker selv hvert 3. sek.).
    window.addEventListener('storage', function (e) { if (!e.key || e.key === SESSION_KEY) renderBar(); });
    setInterval(renderBar, 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
