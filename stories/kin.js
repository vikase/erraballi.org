// Names in stories. A name in a story can be a link to that person on the tree:
//   <a class="kin" href="../#p=200" data-p="200">Pramila</a>        (HTML story pages, href goes to the tree root)
//   [Pramila](#p=200)                                              (story.md pages; stories.js turns it into the same link)
// With this script, the link opens a small card: name, years, what the person is to the storyteller
// (<body data-teller="199">) and what the person is to the reader (the "I am ..." choice on the tree).
// Phones: a tap opens the card, and the card's button goes to the tree. Computers: hover opens the card, a click goes to the tree.
// Without this script the link still works: it opens the person on the tree.
// An element with data-kin-to="ID" gets the reader's word for that person ("Your grandfather"), or stays hidden.
// The relationship rules are a copy of the "relationship engine" in /index.html. If you change the words there, change them here.
(function(){
const ROOT=document.body.dataset.root||'../';
const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const okPsv=t=>typeof t==='string'&&/^id\|name\|/.test(t)&&t.split('\n').length>100;

// ---------- data: the copy the tree saved last (live from the master sheet), else the repo file ----------
function loadText(){let saved=null; try{saved=localStorage.getItem('erraballi-psv');}catch(e){}
  if(okPsv(saved))return Promise.resolve(saved);
  return fetch(ROOT+'data/people.psv',{cache:'no-cache'}).then(r=>r.ok?r.text():'');}
let byId=new Map(), ME=0;
const ready=loadText().then(t=>{
  const lines=(t||'').trim().split('\n'); if(lines.length<2)return;
  const H=lines[0].split('|');
  lines.slice(1).forEach(l=>{const c=l.split('|'),o={};H.forEach((h,i)=>o[h]=(c[i]||'').trim());
    o.id=+o.id; o.parents=o.parents?o.parents.split(' & ').map(Number):[]; o.spouses=o.spouses?o.spouses.split(' & ').map(Number):[];
    o.gen=o.gen?+o.gen:null; o.living=!o.died; o.desc=o.gen!==null; o.g=gender(o); byId.set(o.id,o);});
  try{const v=+localStorage.getItem('erraballi-me'); if(v&&byId.has(v))ME=v;}catch(e){}
}).catch(e=>console.error(e));

// ---------- relationship words (copied from /index.html) ----------
function gender(p){const r=(p.rel||'').toLowerCase();
  if(/\b(wife|mother|grandmother|aunt|sister|daughter|self)\b/.test(r))return r.includes('self')?'M':'F';
  if(/\b(husband|father|grandfather|uncle|brother|son)\b/.test(r))return 'M';
  if(/\sDevi$/.test(p.name||''))return 'F'; // the rel column has no gender for cousins; "Devi" names are women
  return '';}
const spW=p=>p.g==='M'?'husband':p.g==='F'?'wife':'spouse';
const spousesOf=p=>p.spouses.map(id=>byId.get(id)).filter(Boolean);
function ancestors(id){const m=new Map([[id,{d:0,via:null}]]),q=[id];
  while(q.length){const c=q.shift(),d=m.get(c).d,x=byId.get(c); if(!x)continue;
    for(const p of x.parents){if(!m.has(p)&&byId.has(p)){m.set(p,{d:d+1,via:c});q.push(p);}}}return m;}
const ORD=['','first','second','third','fourth','fifth','sixth','seventh'];
const REM=['','once','twice','three times','four times','five times'];
const greats=n=>'great-'.repeat(n);
function term(dA,dB,g,half){
  const pick=(m,f,n)=>g==='M'?m:g==='F'?f:n;
  if(dA===0&&dB===0)return 'the same person';
  if(dA===0){if(dB===1)return pick('father','mother','parent'); if(dB===2)return pick('grandfather','grandmother','grandparent'); return greats(dB-2)+pick('grandfather','grandmother','grandparent');}
  if(dB===0){if(dA===1)return pick('son','daughter','child'); if(dA===2)return pick('grandson','granddaughter','grandchild'); return greats(dA-2)+pick('grandson','granddaughter','grandchild');}
  if(dA===1&&dB===1)return (half?'half-':'')+pick('brother','sister','sibling');
  if(dA===1)return greats(dB-2)+pick('uncle','aunt','aunt or uncle');
  if(dB===1)return (dA>=3?'grand-':'')+greats(Math.max(0,dA-3))+pick('nephew','niece','niece or nephew');
  const deg=Math.min(dA,dB)-1, rem=Math.abs(dA-dB);
  return `${ORD[deg]||deg+'th'} cousin${rem?' '+(REM[rem]||rem+' times')+' removed':''}`;
}
function bloodRel(a,b){
  const A=ancestors(a.id),B=ancestors(b.id),c=[];
  for(const [id,x] of A){const y=B.get(id); if(y)c.push({id,s:x.d+y.d,dA:x.d,dB:y.d});}
  if(!c.length)return null;
  c.sort((p,q)=>p.s-q.s||Math.min(p.dA,p.dB)-Math.min(q.dA,q.dB)||((byId.get(q.id).gen||0)-(byId.get(p.id).gen||0)));
  const best=c[0];
  const chain=(M,from)=>{const out=[];let k=best.id;while(k!==from){k=M.get(k).via;out.push(k);}return out;};
  const up=chain(A,a.id).reverse(), down=chain(B,b.id);
  const cA=up.length?byId.get(up[up.length-1]):null, cB=down.length?byId.get(down[0]):null;
  const half=!!(cA&&cB&&cA.id!==cB.id&&cA.parents.length===2&&cB.parents.length===2&&cA.parents.filter(x=>cB.parents.includes(x)).length===1);
  let t=term(best.dA,best.dB,a.g,half); if(half&&best.dA>0&&best.dB>0&&!(best.dA===1&&best.dB===1))t='half-'+t;
  return {t};
}
function inLaw(p,a2,me,b2,t){
  const g=(x,m,f,n)=>x.g==='M'?m:x.g==='F'?f:n, pre=a2!==p, suf=b2!==me;
  const child=/^((great-)*grand)?(son|daughter|child)$/, sib=/^(half-)?(brother|sister|sibling)$/, par=/^((great-)*grand)?(father|mother|parent)$/;
  if(pre&&!suf){if(child.test(t))return 'your '+t.replace(/(son|daughter|child)$/,g(p,'son','daughter','child'))+'-in-law';
    if(sib.test(t))return 'your '+g(p,'brother','sister','sibling')+'-in-law';}
  if(!pre&&suf){if(par.test(t))return 'your '+t.replace(/(father|mother|parent)$/,g(p,'father','mother','parent'))+'-in-law';
    if(sib.test(t))return 'your '+g(p,'brother','sister','sibling')+'-in-law';}
  if(pre&&suf&&sib.test(t))return 'your '+g(p,'brother','sister','sibling')+'-in-law';
  return (pre?spW(p)+' of ':'')+'your '+(suf?spW(b2)+'’s ':'')+t;
}
// what p is to the person with id vid, as "your ..."; '' if not known
function termTo(p,vid){
  const me=byId.get(vid); if(!me||!p)return ''; if(p.id===vid)return 'you';
  if(p.spouses.includes(vid))return 'your '+spW(p);
  let a2=p.desc?p:spousesOf(p).find(s=>s.desc), b2=me.desc?me:spousesOf(me).find(s=>s.desc);
  if(!a2||!b2)return ''; let r=null;
  if(!p.desc&&ancestors(b2.id).has(p.id)){r=bloodRel(p,b2); if(r)a2=p;}
  if(!r&&!me.desc&&ancestors(a2.id).has(vid)){r=bloodRel(a2,me); if(r)b2=me;}
  if(!r)r=bloodRel(a2,b2); if(!r)return '';
  return inLaw(p,a2,me,b2,r.t);
}
const cap=x=>x?x[0].toUpperCase()+x.slice(1):x;
const years=p=>(p.born||p.died)?`${p.born||'?'}–${p.died||''}`:'';
const named=p=>p&&p.name&&p.name!=='(name not given)';

// ---------- the card ----------
let card=null, openFor=null, hideT=null;
function makeCard(){card=document.createElement('div'); card.className='kincard'; card.hidden=true; card.setAttribute('role','dialog');
  card.addEventListener('mouseenter',()=>clearTimeout(hideT)); card.addEventListener('mouseleave',()=>hideSoon());
  document.body.appendChild(card);}
function cardHTML(p,link){
  const TELLER=+document.body.dataset.teller||0; // story.md pages set it from the person in the header
  const teller=TELLER&&TELLER!==p.id?byId.get(TELLER):null;
  const his=teller?termTo(p,TELLER).replace(/^your /,teller.g==='F'?'her ':'his ').replace(/ your /g,teller.g==='F'?' her ':' his '):'';
  const mine=ME?termTo(p,ME):'';
  let you='';
  if(mine==='you')you='<p class="kc-you"><b>This is you.</b></p>';
  else if(mine)you=`<p class="kc-you"><b>${esc(cap(mine))}</b></p>`;
  else if(!ME)you=`<p class="kc-ask"><a href="${ROOT}">Choose your name on the tree</a> to see how you are related.</p>`;
  const where=[p.living&&p.city?esc(p.city):'', p.occ?esc(p.occ):''].filter(Boolean).join(' · ');
  return `<button class="kc-x" type="button" aria-label="Close">×</button>
    <p class="kc-name">${esc(p.title?p.title+' ':'')}${esc(p.name)}</p>
    ${years(p)?`<p class="kc-yrs">${esc(years(p))}</p>`:''}
    ${his?`<p class="kc-his">${esc(cap(his))}</p>`:''}
    ${you}
    ${where?`<p class="kc-where">${where}</p>`:''}
    <a class="kc-go" href="${esc(link)}">See on the family tree →</a>`;
}
function place(a){
  const r=a.getBoundingClientRect(), w=Math.min(300,window.innerWidth-24);
  card.style.width=w+'px';
  let x=r.left+window.scrollX; x=Math.max(12+window.scrollX,Math.min(x,window.scrollX+window.innerWidth-w-12));
  card.style.left=x+'px'; card.style.top='0px'; card.hidden=false;
  const h=card.offsetHeight, below=r.bottom+8, above=r.top-h-8;
  const y=(below+h<window.innerHeight||above<0)?below:above;
  card.style.top=(y+window.scrollY)+'px';
}
function show(a){const p=byId.get(+a.dataset.p); if(!p||!named(p))return false;
  if(!card)makeCard(); clearTimeout(hideT);
  if(openFor!==a){card.innerHTML=cardHTML(p,a.getAttribute('href')); card.setAttribute('aria-label',p.name);
    card.querySelector('.kc-x').onclick=hide; openFor&&openFor.setAttribute('aria-expanded','false');}
  openFor=a; a.setAttribute('aria-expanded','true'); place(a); return true;}
function hide(){if(card)card.hidden=true; if(openFor)openFor.setAttribute('aria-expanded','false'); openFor=null;}
function hideSoon(){clearTimeout(hideT); hideT=setTimeout(hide,250);}
const HOVER=window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches;

function wire(root){
  (root||document).querySelectorAll('a.kin[data-p]').forEach(a=>{ if(a._kin)return; a._kin=1;
    a.setAttribute('aria-haspopup','dialog'); a.setAttribute('aria-expanded','false');
    if(HOVER){a.addEventListener('mouseenter',()=>{clearTimeout(hideT); hideT=setTimeout(()=>show(a),180);});
      a.addEventListener('mouseleave',hideSoon);
      a.addEventListener('focus',()=>show(a)); a.addEventListener('blur',hideSoon);}
    else a.addEventListener('click',e=>{ if(openFor===a){hide();e.preventDefault();return;} if(show(a))e.preventDefault(); });
  });
}
document.addEventListener('click',e=>{if(card&&!card.hidden&&!card.contains(e.target)&&!(e.target.closest&&e.target.closest('a.kin')))hide();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
window.addEventListener('resize',hide);

// the reader's word for one person, for example the line "Your grandfather" under a story title
function personal(root){(root||document).querySelectorAll('[data-kin-to]').forEach(el=>{
  const p=byId.get(+el.dataset.kinTo), t=ME&&p?termTo(p,ME):'';
  if(t&&t!=='you'){el.textContent=cap(t);el.hidden=false;} else el.hidden=true;});}

window.Kin={ready,wire,personal};
ready.then(()=>{wire();personal();});
})();
