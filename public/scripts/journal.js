/* journal.js: handles journal UI in journal.html */
const updatesListEl = document.getElementById('updatesList');
const addUpdateBtn = document.getElementById('addUpdate');
const downloadUpdatesBtn = document.getElementById('downloadUpdates');
const clearLocalBtn = document.getElementById('clearLocal');
const updTitle = document.getElementById('upd-title');
const updBody = document.getElementById('upd-body');
const updDate = document.getElementById('upd-date');

let remoteUpdates = [];
let localUpdates = JSON.parse(localStorage.getItem('dulmethUpdates') || '[]');
let editingLocalIndex = null;

async function loadUpdatesManifest(){
  try{
    const res = await fetch('/data/updates.json', {cache:'no-cache'});
    if(!res.ok) throw new Error('no updates manifest');
    const json = await res.json();
    remoteUpdates = (json.updates || []).map(u => ({...u}));
  }catch(e){
    console.warn('No remote updates.json, using empty list.', e);
    remoteUpdates = [];
  }
  renderUpdates();
}

function mergedUpdates(){
  const localAnnotated = localUpdates.map((u, idx) => ({...u, _source: 'local', _localIndex: idx}));
  const remoteAnnotated = remoteUpdates.map((u, idx) => ({...u, _source: 'remote', _remoteIndex: idx}));
  const merged = [...localAnnotated, ...remoteAnnotated];
  merged.sort((a,b)=> (b.date||0) - (a.date||0));
  return merged;
}

function renderUpdates(){
  const list = mergedUpdates();
  if(list.length === 0){
    updatesListEl.innerHTML = '<p style="color:var(--muted)">No updates yet.</p>';
    return;
  }
  updatesListEl.innerHTML = '';
  for(const u of list){
    const wrapper = document.createElement('div');
    wrapper.className = 'journal-entry';
    const h = document.createElement('strong'); h.textContent = u.title || 'Update';
    const meta = document.createElement('div'); meta.style.fontSize = '.85rem'; meta.style.color = 'var(--muted)';
    const d = new Date(u.date || Date.now()); meta.textContent = d.toLocaleString() + (u._source === 'local' ? ' • (local)' : ' • (remote)');
    const p = document.createElement('div'); p.style.marginTop = '.4rem'; p.textContent = u.body || '';
    wrapper.appendChild(h); wrapper.appendChild(meta); wrapper.appendChild(p);

    const ctrl = document.createElement('div');
    ctrl.style.marginTop = '.5rem';
    ctrl.style.display = 'flex';
    ctrl.style.gap = '.4rem';

    if(u._source === 'local'){
      const editBtn = document.createElement('button'); editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', ()=> startEdit(u._localIndex));
      const delBtn = document.createElement('button'); delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', ()=> deleteLocal(u._localIndex));
      ctrl.appendChild(editBtn); ctrl.appendChild(delBtn);
    } else {
      const copyBtn = document.createElement('button'); copyBtn.textContent = 'Copy to local';
      copyBtn.addEventListener('click', ()=> copyRemoteToLocal(u));
      ctrl.appendChild(copyBtn);
    }

    wrapper.appendChild(ctrl);
    updatesListEl.appendChild(wrapper);
  }
}

function startEdit(localIdx){
  const entry = localUpdates[localIdx];
  if(!entry) return;
  editingLocalIndex = localIdx;
  updTitle.value = entry.title || '';
  updBody.value = entry.body || '';
  const dt = entry.date ? new Date(entry.date) : new Date();
  updDate.value = dt.toISOString().slice(0,10);
  addUpdateBtn.textContent = 'Save Changes';
}

function saveEdit(){
  if(editingLocalIndex === null) return;
  const title = (updTitle.value || '').trim();
  const body = (updBody.value || '').trim();
  const dateVal = updDate.value ? new Date(updDate.value).getTime() : Date.now();
  if(!title && !body) return;
  localUpdates[editingLocalIndex] = { title: title || 'Update', body, date: dateVal, local:true };
  localStorage.setItem('dulmethUpdates', JSON.stringify(localUpdates));
  editingLocalIndex = null;
  updTitle.value = ''; updBody.value = ''; updDate.value = '';
  addUpdateBtn.textContent = 'Add Update';
  renderUpdates();
}

function deleteLocal(localIdx){
  if(!confirm('Delete this local update?')) return;
  localUpdates.splice(localIdx,1);
  localStorage.setItem('dulmethUpdates', JSON.stringify(localUpdates));
  if(editingLocalIndex === localIdx) { editingLocalIndex = null; addUpdateBtn.textContent = 'Add Update'; updTitle.value=''; updBody.value=''; updDate.value=''; }
  renderUpdates();
}

function copyRemoteToLocal(remoteEntry){
  const copy = { title: remoteEntry.title||'Update', body: remoteEntry.body||'', date: Date.now(), local:true };
  localUpdates.unshift(copy);
  localStorage.setItem('dulmethUpdates', JSON.stringify(localUpdates));
  renderUpdates();
}

addUpdateBtn.addEventListener('click', ()=>{
  if(editingLocalIndex !== null){
    saveEdit();
    return;
  }
  const title = (updTitle.value || '').trim();
  const body = (updBody.value || '').trim();
  const dateVal = updDate.value ? new Date(updDate.value).getTime() : Date.now();
  if(!body && !title) return;
  const entry = { title: title || 'Update', body, date: dateVal, local:true };
  localUpdates.unshift(entry);
  localStorage.setItem('dulmethUpdates', JSON.stringify(localUpdates));
  updTitle.value = ''; updBody.value = ''; updDate.value = '';
  renderUpdates();
});

downloadUpdatesBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(mergedUpdates(), null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'dulmeth-updates.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

clearLocalBtn.addEventListener('click', ()=>{
  if(!confirm('Clear local (unsent) updates?')) return;
  localUpdates = [];
  localStorage.removeItem('dulmethUpdates');
  editingLocalIndex = null;
  addUpdateBtn.textContent = 'Add Update';
  renderUpdates();
});

/* journal entry rendering and submission */
(function(){
  function el(id){ return document.getElementById(id); }
  var list = el('journalList');
  var form = el('entryForm');
  var msg = el('formMsg');

  function render(entries){
    if (!list) return;
    list.innerHTML = '';
    (entries || []).forEach(function(e){
      var d = document.createElement('div');
      d.className = 'entry';
      var title = document.createElement('h3');
      title.textContent = e.title || 'Untitled';
      var date = document.createElement('div');
      date.className = 'date';
      date.textContent = e.date || '';
      var ex = document.createElement('div');
      ex.textContent = e.excerpt || e.body || '';
      d.appendChild(title);
      d.appendChild(date);
      d.appendChild(ex);
      list.appendChild(d);
    });
    if ((entries||[]).length === 0) list.textContent = 'No entries yet.';
  }

  function load(){
    fetch('/journal.json', {cache:'no-store'}).then(function(res){
      if (!res.ok) throw new Error('network');
      return res.json();
    }).then(function(data){
      render(data);
    }).catch(function(){
      list.textContent = 'Could not load entries.';
    });
  }

  if (form) {
    form.addEventListener('submit', function(e){
      e.preventDefault();
      msg.textContent = 'Saving…';
      
      // Debug: Log raw values from form
      console.log('=== FORM SUBMISSION ===');
      console.log('title element:', el('title'));
      console.log('title value:', el('title').value);
      console.log('excerpt element:', el('excerpt'));
      console.log('excerpt value:', el('excerpt').value);
      console.log('date value:', el('date').value);
      console.log('body value:', el('body').value);
      
      var payload = {
        title: el('title').value.trim(),
        date: el('date').value || undefined,
        excerpt: el('excerpt').value.trim(),
        body: el('body').value.trim()
      };
      
      console.log('Payload being sent:', payload);
      
      fetch('/api/journal', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      }).then(function(res){
        return res.json().then(function(j){ return {status: res.status, body: j}; });
      }).then(function(r){
        if (r.status >= 200 && r.status < 300) {
          // Redirect to the journal page so the user sees the updated read-only list
          window.location.href = '/journal.html';
          return;
        } else {
          msg.textContent = 'Failed: ' + (r.body && r.body.error ? r.body.error : 'server error');
        }
      }).catch(function(err){
        msg.textContent = 'Failed to save (network).';
        console.error(err);
      });
    });
  }

  // initial load
  load();
})();
