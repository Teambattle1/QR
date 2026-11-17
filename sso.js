/*
 * Platform-SSO til RLS-lockdown på Supabase MAIN (2026-11) — udgave uden React.
 * Samme regler som TODO/src/lib/sso.ts + RequireSso.tsx.
 *
 * Når QR-tabellerne er låst, svarer databasen kun på staff-kald med et gyldigt
 * SSO-token i headeren `x-eventday-sso` (Postgres tjekker det med is_staff()).
 * Offentlige flows (scan af en aktivitets-QR) går gennem RPC'er og kræver intet login.
 *
 * Opsætning via script-taggets data-attributter:
 *   data-app="qr"               → staff-session i localStorage '<app>_sso_session'
 *   data-app-name="QR"          → vises på login-skærmen
 *   data-extra-keys="a,b"       → andre localStorage-sessioner med { token, expiresAt } (fx admin-login)
 *
 * Token-kilder i prioriteret rækkefølge: ekstra nøgler, egen staff-session, cookien
 * `eventday_sso` (sat på .eventday.dk ved login på app.eventday.dk). Tokenet læses pr. kald.
 */
(function () {
  var script = document.currentScript;
  var APP = (script && script.getAttribute('data-app')) || 'app';
  var APP_NAME = (script && script.getAttribute('data-app-name')) || APP;
  var EXTRA_KEYS = ((script && script.getAttribute('data-extra-keys')) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);

  var SSO_COOKIE = 'eventday_sso';
  var SSO_HEADER = 'x-eventday-sso';
  var LOGIN_URL = 'https://app.eventday.dk';
  var VERIFY_URL = 'https://ilbjytyukicbssqftmma.supabase.co/functions/v1/ef-verify-code';
  // MAIN's offentlige anon-nøgle (samme som appen selv bruger).
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYmp5dHl1a2ljYnNzcWZ0bW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MzA0NjEsImV4cCI6MjA3MDQwNjQ2MX0.I_PWByMPcOYhWgeq9MxXgOo-NCZYfEuzYmo35XnBFAY';
  var STAFF_SESSION_KEY = APP + '_sso_session';
  var STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
  var RECHECK_INTERVAL_MS = 60 * 1000;
  var CODE_LENGTH = 4;
  var MAX_ATTEMPTS = 5;
  var LOCK_MS = 60 * 1000;
  // Roller som is_sso_crew_or_admin() (og dermed is_staff()) accepterer
  var STAFF_ROLES = ['admin', 'ef_admin', 'crew'];
  var CHANGE_EVENT = APP + ':sso';

  function decodePayload(token) {
    try {
      var b64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = decodeURIComponent(Array.prototype.map.call(atob(b64), function (c) {
        return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  // Klient-side forhåndstjek (udløb + staff-rolle). Signaturen tjekkes kun af Postgres.
  function isUsableToken(token) {
    if (!token) return false;
    var p = decodePayload(token);
    if (!p) return false;
    if (typeof p.exp === 'number' && p.exp * 1000 <= Date.now()) return false;
    return !p.role || STAFF_ROLES.indexOf(p.role) !== -1;
  }

  function readStoredToken(key) {
    try {
      var s = JSON.parse(localStorage.getItem(key) || 'null');
      if (!s) return '';
      if (typeof s.expiresAt === 'number' && s.expiresAt <= Date.now()) return '';
      return typeof s.token === 'string' ? s.token : '';
    } catch (e) { return ''; }
  }

  function readSsoCookie() {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + SSO_COOKIE + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }

  function getToken() {
    var sources = EXTRA_KEYS.map(readStoredToken).concat([readStoredToken(STAFF_SESSION_KEY), readSsoCookie()]);
    for (var i = 0; i < sources.length; i++) if (isUsableToken(sources[i])) return sources[i];
    return '';
  }

  // fetch til supabase-js (global.fetch): tilføjer x-eventday-sso på REST-kald (/rest/v1/, også RPC).
  // Kun REST — edge functions har egne CORS-regler for headers.
  function fetchWithSso(input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : (input && (input.href || input.url)) || '';
    if (url.indexOf('/rest/v1/') === -1) return fetch(input, init);
    var token = getToken();
    if (!token) return fetch(input, init);
    var headers = new Headers(init.headers || {});
    headers.set(SSO_HEADER, token);
    return fetch(input, Object.assign({}, init, { headers: headers }));
  }

  function notify() { window.dispatchEvent(new Event(CHANGE_EVENT)); }

  function saveSession(name, token) {
    try {
      localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify({ name: name, token: token, expiresAt: Date.now() + STAFF_SESSION_TTL_MS }));
    } catch (e) { /* privat tilstand */ }
    notify();
  }

  function logout() {
    try { localStorage.removeItem(STAFF_SESSION_KEY); } catch (e) {}
    notify();
  }

  function onChange(cb) {
    window.addEventListener(CHANGE_EVENT, cb);
    window.addEventListener('storage', cb);
    window.addEventListener('focus', cb);
    setInterval(cb, RECHECK_INTERVAL_MS);
  }

  // ── Login-skærm ────────────────────────────────────────────────────
  var LOCK_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var EXT_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  var RETRY_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>';

  var CSS = [
    '.esso-gate{position:fixed;inset:0;z-index:9990;background:#0b0b0f;color:#fff;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}',
    '.esso-card{width:100%;max-width:380px;background:#16161d;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:16px}',
    '.esso-card h1{margin:0;font-size:20px;display:flex;align-items:center;gap:10px}',
    '.esso-card p{margin:0;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.7)}',
    '.esso-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 18px;border-radius:10px;font-weight:700;font-size:15px;border:none;cursor:pointer;text-decoration:none;color:#fff;font-family:inherit}',
    '.esso-btn.primary{background:#ff6600}.esso-btn.ghost{background:rgba(255,255,255,0.08)}',
    '.esso-code{border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;display:flex;flex-direction:column;gap:8px}',
    '.esso-code label{font-size:13px;color:rgba(255,255,255,0.6)}',
    '.esso-code input{padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:#0b0b0f;color:#fff;font-size:20px;letter-spacing:8px;text-align:center;font-family:inherit}',
    '.esso-code input:focus{outline:none;border-color:#ff6600}',
    '.esso-msg{font-size:13px;color:rgba(255,255,255,0.6);min-height:16px}.esso-msg.err{color:#f87171}',
  ].join('\n');

  var gate = null;
  var attempts = 0;
  var lockedUntil = 0;

  function buildGate() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    gate = document.createElement('div');
    gate.className = 'esso-gate';
    gate.setAttribute('data-testid', 'sso-gate');
    gate.innerHTML =
      '<div class="esso-card" role="dialog" aria-modal="true" aria-labelledby="esso-title">' +
      '<h1 id="esso-title">' + LOCK_SVG + '<span>Log ind for at fortsætte</span></h1>' +
      '<p></p>' +
      '<a class="esso-btn primary" href="' + LOGIN_URL + '">' + EXT_SVG + '<span>Log ind på app.eventday.dk</span></a>' +
      '<button type="button" class="esso-btn ghost" data-act="retry">' + RETRY_SVG + '<span>Jeg er logget ind — prøv igen</span></button>' +
      '<div class="esso-code"><label for="esso-code-input">Eller log ind med din kode</label>' +
      '<input id="esso-code-input" data-testid="sso-code" inputmode="numeric" autocomplete="one-time-code" maxlength="' + CODE_LENGTH + '" placeholder="••••">' +
      '<div class="esso-msg" role="alert"></div></div></div>';
    gate.querySelector('p').textContent = APP_NAME + ' viser interne data og kræver, at du er logget ind. Log ind på app.eventday.dk — så er du også logget ind her.';
    gate.querySelector('[data-act=retry]').onclick = notify;
    var input = gate.querySelector('input');
    input.addEventListener('input', function () {
      var v = input.value.replace(/\s/g, '').toUpperCase().slice(0, CODE_LENGTH);
      input.value = v;
      if (v.length === CODE_LENGTH) submit(v, input);
    });
    document.body.appendChild(gate);
  }

  function setMsg(text, isErr) {
    var m = gate && gate.querySelector('.esso-msg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'esso-msg' + (isErr ? ' err' : '');
  }

  function submit(code, input) {
    if (Date.now() < lockedUntil) {
      setMsg('For mange forsøg — prøv igen om ' + Math.ceil((lockedUntil - Date.now()) / 1000) + ' sek.', true);
      input.value = '';
      return;
    }
    input.disabled = true;
    setMsg('Tjekker koden…');
    fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
      body: JSON.stringify({ code: code }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data || {} }; });
    }).then(function (r) {
      // Kun medarbejder-/admin-koder får et sessionToken fra ef-verify-code
      if (r.data.sessionToken && isUsableToken(r.data.sessionToken)) {
        attempts = 0;
        saveSession(r.data.adminName || r.data.name || 'Medarbejder', r.data.sessionToken);
        return;
      }
      if (r.status === 429) { setMsg('For mange forsøg — vent lidt og prøv igen', true); return; }
      if (r.status >= 500) { setMsg('Kunne ikke tjekke koden — prøv igen', true); return; }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) { attempts = 0; lockedUntil = Date.now() + LOCK_MS; }
      setMsg(r.data.type || r.data.sessionToken ? 'Koden giver ikke adgang her' : 'Forkert kode', true);
    }).catch(function () {
      setMsg('Kunne ikke tjekke koden — prøv igen', true);
    }).then(function () {
      input.disabled = false;
      input.value = '';
      if (gate && gate.style.display !== 'none') input.focus();
    });
  }

  // Viser login-skærmen indtil der er et brugbart token; kalder onReady én gang ved login.
  // opts.isPublic(): true = siden der vises lige nu er offentlig (fx QR-generatoren) → ingen login-skærm.
  // Returnerer check(), så appen kan tjekke igen, når brugeren skifter fane.
  function requireLogin(onReady, opts) {
    var ready = false;
    var isPublic = (opts && opts.isPublic) || function () { return false; };
    function check() {
      var ok = !!getToken();
      if (!ok && isPublic()) {
        if (gate) gate.style.display = 'none';
        return;
      }
      if (ok) {
        if (gate) gate.style.display = 'none';
        if (!ready) { ready = true; if (onReady) onReady(); }
      } else {
        if (!gate) buildGate();
        gate.style.display = '';
        setMsg('');
      }
    }
    function start() { check(); onChange(check); }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    return check;
  }

  window.EventdaySso = {
    getToken: getToken,
    isStaff: function () { return !!getToken(); },
    fetchWithSso: fetchWithSso,
    saveSession: saveSession,
    logout: logout,
    onChange: onChange,
    requireLogin: requireLogin,
  };
})();
