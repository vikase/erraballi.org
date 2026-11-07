/* Family password gate for every page on the site.
   Load it as the first script in <head>: <script src="/gate.js"></script>
   The page stays hidden until the visitor types the family password. The browser then remembers it.
   Note: this keeps out casual visitors and search engines. The repo is public, so it is not real security. */
(function () {
  var KEY = 'erraballi-unlocked', HASH = 'e907ff8b'; // FNV-1a hash of the password, lower case
  function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  var ok = false; try { ok = localStorage.getItem(KEY) === HASH; } catch (e) {}
  if (ok) return;
  var de = document.documentElement; de.classList.add('eg-locked');
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
      '<p>This site is for the family. Type the family password.</p>' +
      '<input type="password" aria-label="Family password" placeholder="Family password" autofocus>' +
      '<button type="submit">Enter</button><div class="err" aria-live="polite"></div></form>';
    document.body.appendChild(d);
    var f = d.querySelector('form'), inp = d.querySelector('input'), err = d.querySelector('.err');
    f.onsubmit = function (e) {
      e.preventDefault();
      if (fnv(inp.value.trim().toLowerCase()) === HASH) {
        try { localStorage.setItem(KEY, HASH); } catch (x) {}
        de.classList.remove('eg-locked'); d.remove(); st.remove();
        window.dispatchEvent(new Event('resize')); // the tree sizes itself to the screen
      } else { err.textContent = 'That password did not match. Ask a family member.'; inp.select(); }
    };
    inp.focus();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
