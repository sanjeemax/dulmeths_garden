/* gallery.js: handles gallery + read-only journal preview */
const galleryEl = document.getElementById('gallery');
const metaEl = document.getElementById('meta');
const q = document.getElementById('q');
const sortSel = document.getElementById('sort');
const gridRange = document.getElementById('grid');
const toggleView = document.getElementById('toggleView');
const playBtn = document.getElementById('play');
const downloadAll = document.getElementById('downloadAll');

const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-image');
const lbClose = document.getElementById('lb-close');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');

let images = [];
let filtered = [];
let current = 0;
let slideshowId = null;
let listView = false;

async function loadList(){
  try{
    const res = await fetch('/images/images.json', {cache:'no-cache'});
    if(!res.ok) throw new Error('manifest not served: ' + res.status);
    const json = await res.json();
    images = (json.images || []).map((i,idx)=>({ ...i, _idx:idx }));
  }catch(e){
    console.warn('Failed to load images.json, falling back to sample list.', e);
    images = [
      { file:'pic1.jpg', caption:'Caption for image 1', date: Date.now()-200000 },
      { file:'pic2.jpg', caption:'Caption for image 2', date: Date.now()-100000 },
      { file:'pic3.jpg', caption:'Caption for image 3', date: Date.now() }
    ].map((i,idx)=>({...i, _idx:idx}));
  }
  applyFilters();
}

function applyFilters(){
  const term = q.value.trim().toLowerCase();
  filtered = images.filter(i => !term || (i.caption || '').toLowerCase().includes(term) || (i.file||'').toLowerCase().includes(term));
  if(sortSel.value === 'name') filtered.sort((a,b)=>(a.file||'').localeCompare(b.file||''));
  if(sortSel.value === 'newest') filtered.sort((a,b)=>(b.date||0)-(a.date||0));
  render();
}

function render(){
  galleryEl.innerHTML = '';
  document.documentElement.style.setProperty('--col-width', gridRange.value + 'px');
  metaEl.textContent = `${filtered.length} image(s)`;
  if(filtered.length === 0){ galleryEl.innerHTML = '<p style="color:var(--muted)">No images found.</p>'; return; }

  for(let i=0;i<filtered.length;i++){
    const it = filtered[i];
    const fig = document.createElement('figure');
    fig.tabIndex = 0;
    const a = document.createElement('a');
    a.href = '/images/' + it.file;
    a.target = '_blank';
    a.rel = 'noopener';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = '/images/' + it.file;
    img.alt = it.alt || it.caption || it.file || 'image';
    img.onerror = ()=>{ img.src='/images/placeholder.png'; };
    a.appendChild(img);
    const cap = document.createElement('figcaption');
    cap.textContent = it.caption || it.file;
    fig.appendChild(a);
    fig.appendChild(cap);
    fig.addEventListener('click', (ev)=>{
      ev.preventDefault();
      openLightbox(i);
    });
    fig.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openLightbox(i); }
    });
    galleryEl.appendChild(fig);
  }
}

function openLightbox(idx){
  current = idx;
  const it = filtered[current];
  if(!it) return;
  lbImg.src = '/images/' + it.file;
  lbImg.alt = it.alt || it.caption || it.file;
  lb.classList.add('active');
  lb.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
}
function closeLightbox(){
  lb.classList.remove('active');
  lb.setAttribute('aria-hidden','true');
  lbImg.src = '';
  document.body.style.overflow = '';
}
function next(){
  if(filtered.length === 0) return;
  current = (current + 1) % filtered.length;
  openLightbox(current);
}
function prev(){
  if(filtered.length === 0) return;
  current = (current - 1 + filtered.length) % filtered.length;
  openLightbox(current);
}

q.addEventListener('input', applyFilters);
sortSel.addEventListener('change', applyFilters);
gridRange.addEventListener('input', ()=>{ document.documentElement.style.setProperty('--col-width', gridRange.value + 'px'); });
toggleView.addEventListener('click', ()=>{
  listView = !listView;
  if(listView){ galleryEl.style.gridTemplateColumns = '1fr'; toggleView.textContent = 'Grid View'; }
  else { galleryEl.style.gridTemplateColumns = ''; toggleView.textContent = 'Toggle View'; }
});

lbClose.addEventListener('click', closeLightbox);
lbNext.addEventListener('click', (e)=>{ e.stopPropagation(); next(); });
lbPrev.addEventListener('click', (e)=>{ e.stopPropagation(); prev(); });
lb.addEventListener('click', (e)=>{ if(e.target === lb) closeLightbox(); });

document.addEventListener('keydown', (e)=>{
  if(lb.classList.contains('active')){
    if(e.key === 'Escape') closeLightbox();
    if(e.key === 'ArrowRight') next();
    if(e.key === 'ArrowLeft') prev();
  }
});

playBtn.addEventListener('click', ()=>{
  if(slideshowId){
    clearInterval(slideshowId); slideshowId = null; playBtn.textContent = 'Start Slideshow';
  } else {
    if(filtered.length === 0) return;
    slideshowId = setInterval(()=>{ next(); }, 3000);
    playBtn.textContent = 'Stop Slideshow';
    if(!lb.classList.contains('active')) openLightbox(0);
  }
});

downloadAll.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(filtered, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'dulmeth-images.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

/* ============ Journal preview (read-only) ============ */
const journalPreviewEl = document.getElementById('journalPreview');

async function loadJournalPreview(){
  if(!journalPreviewEl) return;
  try{
    const res = await fetch('/data/updates.json', {cache:'no-cache'});
    if(!res.ok) throw new Error('no updates manifest: ' + res.status);
    const json = await res.json();
    renderJournalPreview(json.updates || []);
  }catch(e){
    console.warn('Failed to load updates.json', e);
    journalPreviewEl.innerHTML = '<p style="color:var(--muted)">No updates available.</p>';
  }
}

function renderJournalPreview(list){
  if(!journalPreviewEl) return;
  if(!list || list.length === 0){
    journalPreviewEl.innerHTML = '<p style="color:var(--muted)">No updates yet.</p>';
    return;
  }
  // show up to 5 most recent entries
  list.sort((a,b)=>(b.date||0)-(a.date||0));
  const shown = list.slice(0,5);
  journalPreviewEl.innerHTML = '';
  for(const u of shown){
    const div = document.createElement('div');
    div.className = 'journal-entry';
    const h = document.createElement('h3'); h.textContent = u.title || 'Update';
    const d = document.createElement('div'); d.className = 'date'; d.textContent = new Date(u.date || Date.now()).toLocaleString();
    const p = document.createElement('div'); p.textContent = u.body || '';
    div.appendChild(h);
    div.appendChild(d);
    div.appendChild(p);
    journalPreviewEl.appendChild(div);
  }
  if(list.length > shown.length){
    const more = document.createElement('div');
    more.style.marginTop = '.5rem';
    more.innerHTML = `<a href="/journal.html" style="color:var(--accent);text-decoration:none">View all updates</a>`;
    journalPreviewEl.appendChild(more);
  }
}

/* initialize */
loadJournalPreview();
loadList();