// Family stories. One script for two kinds of page:
//   <body data-page="guide" data-root="../">      stories/index.html: the list of stories and how to add one
//   <body data-page="story" data-root="../../">   stories/<name>/index.html: reads story.md from its own folder
// A story is plain text in story.md: a short header between two "---" lines, then the story (see stories/template/story.md).
// New stories and memories go to SEND_ENDPOINT (the planned Google Apps Script web app). Until it exists, the form opens WhatsApp.
const SEND_ENDPOINT='';
const ROOT=document.body.dataset.root||'../';
const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=u=>/^(https?:\/\/|\.{0,2}\/|[\w-]+[\w./-]*$|#)/i.test(u)&&!/^javascript:/i.test(u)?u:'#';
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

// ---------- data ----------
async function loadPeople(){
  const t=await fetch(ROOT+'data/people.psv',{cache:'no-cache'}).then(r=>r.ok?r.text():'');
  const lines=t.trim().split('\n'); if(lines.length<2)return new Map();
  const H=lines[0].split('|');
  return new Map(lines.slice(1).map(l=>{const c=l.split('|'),o={};H.forEach((h,i)=>o[h]=(c[i]||'').trim());
    o.id=+o.id; o.living=!o.died; return [o.id,o];}));
}
const loadStories=()=>fetch(ROOT+'data/stories.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{stories:[]}).then(d=>d.stories||[]).catch(()=>[]);
const named=p=>p&&p.name&&p.name!=='(name not given)';
const years=p=>(p.born||p.died)?` (${p.born||'?'}–${p.died||''})`:'';
const first=p=>p.name.split(' ')[0];

// ---------- a small Markdown reader (headings, paragraphs, quotes, lists, photos, links, bold, italics) ----------
function inline(t){
  return esc(t)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(m,a,u)=>`<a href="${esc(safeUrl(u))}">${a}</a>`)
    .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/(^|[\s(])[*_]([^*_]+)[*_](?=[\s).,;:!?]|$)/g,'$1<i>$2</i>');
}
function md(text){
  const out=[];
  for(const block of text.replace(/\r/g,'').split(/\n\s*\n/)){
    const b=block.trim(); if(!b)continue;
    const lines=b.split('\n');
    let m;
    if(/^(-{3,}|\*{3,})$/.test(b)){out.push('<hr>');continue;}
    if((m=/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(b))){
      out.push(`<figure><img loading="lazy" src="${esc(safeUrl(m[2]))}" alt="${esc(m[1])}">${m[1]?`<figcaption>${inline(m[1])}</figcaption>`:''}</figure>`);continue;}
    if((m=/^(#{1,3})\s+(.*)$/.exec(lines[0]))&&lines.length===1){out.push(m[1].length===3?`<h3>${inline(m[2])}</h3>`:`<h2>${inline(m[2])}</h2>`);continue;}
    if(lines.every(l=>/^>/.test(l))){out.push(`<blockquote>${lines.map(l=>inline(l.replace(/^>\s?/,''))).join(' ')}</blockquote>`);continue;}
    if(lines.every(l=>/^[-*]\s+/.test(l))){out.push(`<ul>${lines.map(l=>`<li>${inline(l.replace(/^[-*]\s+/,''))}</li>`).join('')}</ul>`);continue;}
    if(lines.every(l=>/^\d+[.)]\s+/.test(l))){out.push(`<ol>${lines.map(l=>`<li>${inline(l.replace(/^\d+[.)]\s+/,''))}</li>`).join('')}</ol>`);continue;}
    if((m=/^Q:\s*(.*)$/s.exec(b))){out.push(`<p class="q">${inline(m[1].replace(/\n/g,' '))}</p>`);continue;}
    out.push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return out.join('\n');
}
function frontMatter(text){
  const m=/^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text.replace(/\r/g,'')); const meta={};
  if(!m)return {meta,body:text};
  m[1].split('\n').forEach(l=>{const i=l.indexOf(':');if(i>0)meta[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'');});
  return {meta,body:text.replace(/\r/g,'').slice(m[0].length)};
}
function when(s){const m=/^(\d{4})(?:-(\d{2}))?/.exec(s||'');if(!m)return s||'';return m[2]?`${MONTHS[+m[2]-1]} ${m[1]}`:m[1];}

// ---------- story page ----------
async function storyPage(){
  const box=document.getElementById('story');
  try{
    const [text,people]=await Promise.all([fetch('story.md',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(r.status);return r.text();}),loadPeople()]);
    const {meta,body}=frontMatter(text);
    const p=people.get(+meta.person);
    document.title=`${meta.title||'A family story'} · Erraballi`;
    const bits=[meta.told_by&&`Told by ${esc(meta.told_by)}`, meta.written_by&&`${meta.kind==='written'?'Written':'Recorded'} by ${esc(meta.written_by)}`,
      meta.when&&esc(when(meta.when)), meta.language&&esc(meta.language)].filter(Boolean);
    box.innerHTML=`<header class="s-opener"><p class="eyebrow">A family story</p><h1>${esc(meta.title||'A family story')}</h1>
      ${p?`<p class="who"><a href="${ROOT}#p=${p.id}">${esc(p.name)}</a>${esc(years(p))}</p>`:''}
      ${bits.length?`<p class="meta">${bits.join(' · ')}</p>`:''}</header>
      <article class="story">${md(body)}</article>
      <footer class="s-end">
        ${meta.approved_by?`<p>Shared on the family site with the approval of ${esc(meta.approved_by)}${meta.approved_on?`, ${esc(when(meta.approved_on))}`:''}.</p>`:''}
        <p>${p?`<a href="${ROOT}#p=${p.id}">See ${esc(first(p))} on the family tree</a> · `:''}<a href="${ROOT}stories/">All family stories</a> ·
        <a href="${ROOT}stories/?person=${p?p.id:''}#send">Add a memory or a correction</a></p></footer>`;
  }catch(e){box.innerHTML='<p class="loading">This story did not load. Refresh the page to try again.</p>';console.error(e);}
}

// ---------- guide page ----------
async function guidePage(){
  const [people,stories]=await Promise.all([loadPeople(),loadStories()]);
  const live=stories.filter(s=>s.status==='live'), has=new Set(live.map(s=>s.person));
  // the shelf
  document.getElementById('shelf').innerHTML=live.map(s=>{const p=people.get(s.person);
    return `<a class="scard" href="${ROOT}${esc(s.url)}"><small>${p?esc(p.name):'A family story'}</small><b>${esc(s.title)}</b><span>${esc(s.by||'')}</span></a>`;}).join('')
    +`<a class="scard empty" href="#ways"><small>The next one</small><b>Whose story should be here?</b><span>Every elder has one. Here is how to collect it →</span></a>`;
  // elders with no story yet
  const elders=[...people.values()].filter(p=>named(p)&&p.living&&+p.born&&+p.born<=1955&&!has.has(p.id)).sort((a,b)=>+a.born-+b.born);
  document.getElementById('elders').innerHTML=elders.map(p=>`<a href="?person=${p.id}#record">${esc(p.name)} <small>b. ${esc(p.born)}${p.city?' · '+esc(p.city):''}</small></a>`).join('')
    ||'<p class="muted">No one on the list right now.</p>';
  document.getElementById('elderCount').textContent=elders.length?`${elders.length} `:'';
  // names for the form
  document.getElementById('names').innerHTML=[...people.values()].filter(named).map(p=>`<option value="${esc(p.name)}">`).join('');
  const q=new URLSearchParams(location.search), pid=+q.get('person'), pre=people.get(pid);
  if(pre){document.getElementById('sf-who').value=pre.name;
    if(!pre.living)document.querySelector('input[name="kind"][value="memory"]').checked=true;}
  let me=null; try{me=people.get(+localStorage.getItem('erraballi-me'));}catch(e){}
  if(me)document.getElementById('sf-from').value=me.name;
  // the form
  const f=document.getElementById('sendForm');
  f.onsubmit=async e=>{e.preventDefault();
    const v=id=>f.querySelector(id).value.trim();
    const kind=(f.querySelector('input[name="kind"]:checked')||{}).value||'story';
    const d={type:'story',kind,person:v('#sf-who'),text:v('#sf-text'),link:v('#sf-link'),by:v('#sf-from'),ok:v('#sf-ok'),at:new Date().toISOString()};
    const KIND={written:'A written story',recording:'A recording',memory:'A memory',interview:'A plan to interview'};
    if(SEND_ENDPOINT){try{await fetch(SEND_ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(d)});
        f.querySelector('.ok').textContent='Thank you. We will send you a draft to check before anything goes on the site.';f.reset();}catch(err){f.querySelector('.ok').textContent='That did not send. Try again.';}return;}
    const msg=`Family story for erraballi.org\n${KIND[kind]||'A story'} about: ${d.person||'(not given)'}${d.link?'\nLink: '+d.link:''}${d.text?'\n\n'+d.text:''}${d.by?'\n\nFrom: '+d.by:''}${d.ok?'\nWho said yes: '+d.ok:''}`;
    window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank','noopener');
    f.querySelector('.ok').textContent='WhatsApp opened with your message. Send it to the family group or to Vikas. Attach the recording or photos there.';};
  // print the questions only
  document.getElementById('printQ').onclick=()=>{document.body.classList.add('print-questions');window.print();setTimeout(()=>document.body.classList.remove('print-questions'),500);};
  if(location.hash){const t=document.querySelector(location.hash);if(t)setTimeout(()=>t.scrollIntoView(),50);}
}

if(document.body.dataset.page==='story')storyPage(); else guidePage();
