/* Family password gate for every page on the site.
   Load it as the first script in <head>: <script src="/gate.js"></script>
   The page stays hidden until the visitor types the family password. The browser then remembers it.
   Note: this keeps out casual visitors and search engines. The repo is public, so it is not real security.
   Guest passwords (GUESTS) give a view-only visit for friends: the page can read, but it cannot send anything
   (no photos, details, children, messages, albums, stories or "Here now" pings), and the edit buttons are hidden.
   To revoke a guest password, delete its line in GUESTS. The browser checks the saved password on each visit,
   so the guest is locked out on the next page load (GitHub Pages can take about 10 minutes to update). */
(function () {
  var KEY = 'erraballi-unlocked', HASH = 'e907ff8b'; // FNV-1a hash of the family password, lower case
  var GUESTS = { // FNV-1a hash of each guest password, lower case: who it is for
    '691f3925': 'friends, Nov 2026'
  };
  function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  var de = document.documentElement;
  function guestMode() {
    window.EG_GUEST = true; de.classList.add('eg-guest');
    var gs = document.createElement('style');
    gs.textContent = 'html.eg-guest :is(#addKid,.fix,.msg,#faceTools,.askstory,#hereBtn,#nudge,#addAlb,#addForm,#send,a[href$="#send"]){display:none!important}' +
      '#eg-guestpill{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:2147483646;font:600 12px Karla,system-ui,sans-serif;' +
      'background:rgba(42,36,30,.78);color:#fff;padding:5px 10px;border-radius:99px;pointer-events:none}';
    document.head.appendChild(gs);
    var pill = function () { if (document.getElementById('eg-guestpill')) return; var b = document.createElement('div'); b.id = 'eg-guestpill'; b.textContent = 'Guest view · read only'; document.body.appendChild(b); };
    if (document.body) pill(); else document.addEventListener('DOMContentLoaded', pill);
    var f0 = window.fetch; // a guest page sends nothing: refuse every request that is not a plain read
    if (f0) window.fetch = function (u, o) {
      var m = ((o && o.method) || (u && u.method) || 'GET').toUpperCase();
      if (m !== 'GET' && m !== 'HEAD') return Promise.reject(new Error('Guest view is read only'));
      return f0.apply(this, arguments);
    };
  }
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === HASH) return;
  if (saved && GUESTS[saved]) { guestMode(); return; }
  if (saved) { try { localStorage.removeItem(KEY); } catch (e) {} } // an old or revoked password
  de.classList.add('eg-locked');
  var st = document.createElement('style');
  st.textContent =
    'html.eg-locked,html.eg-locked body{overflow:hidden!important;height:100%}' +
    'html.eg-locked body>*:not(#eg-gate){display:none!important}' +
    '#eg-gate{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;' +
    'background:linear-gradient(rgba(42,36,30,.45),rgba(42,36,30,.65)),url(/img/kalleda.jpg) center/cover #f5f2ea;font-family:Karla,system-ui,-apple-system,"Segoe UI",sans-serif;color:#2a241e}' +
    '#eg-gate form{background:#fcfbf7;border-radius:14px;padding:28px 26px 24px;width:100%;max-width:340px;box-shadow:0 12px 36px rgba(0,0,0,.35);text-align:center}' +
    '#eg-gate .te{font-family:"Noto Serif Telugu",Gautami,serif;font-weight:700;font-size:26px;color:#8a2f2f;line-height:1.2}' +
    '#eg-gate h1{font-family:Literata,Georgia,serif;font-weight:400;font-size:26px;margin:6px 0 4px}' +
    '#eg-gate p{margin:0 0 16px;color:#766c60;font-size:14px}' +
    '#eg-gate input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px 12px;border:1px solid #c9bea9;border-radius:8px;background:#fff;color:#2a241e}' +
    '#eg-gate button{margin-top:10px;width:100%;font:inherit;font-weight:600;font-size:16px;padding:10px;border:0;border-radius:8px;background:#8a2f2f;color:#fff;cursor:pointer}' +
    '#eg-gate .err{min-height:18px;margin:8px 0 0;color:#8a2f2f;font-size:13px}';
  document.head.appendChild(st);
  function mount() {
    var d = document.createElement('div'); d.id = 'eg-gate';
    d.innerHTML = '<form autocomplete="off"><div class="te">ఎర్రబల్లి</div><h1>The Erraballi family</h1>' +
      '<p>This site is for the family. Type the family password or your guest password.</p>' +
      '<input type="password" aria-label="Password" placeholder="Password" autofocus>' +
      '<button type="submit">Enter</button><div class="err" aria-live="polite"></div></form>';
    document.body.appendChild(d);
    var f = d.querySelector('form'), inp = d.querySelector('input'), err = d.querySelector('.err');
    f.onsubmit = function (e) {
      e.preventDefault();
      var h = fnv(inp.value.trim().toLowerCase());
      if (h === HASH || GUESTS[h]) {
        try { localStorage.setItem(KEY, h); } catch (x) {}
        if (h !== HASH) guestMode();
        de.classList.remove('eg-locked'); d.remove(); st.remove();
        window.dispatchEvent(new Event('resize')); // the tree sizes itself to the screen
      } else { err.textContent = 'That password did not match. Ask a family member.'; inp.select(); }
    };
    inp.focus();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
