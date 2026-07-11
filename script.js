// ---------- Tabs ----------
const tabs = document.querySelectorAll('.tab');
const panels = { lock: document.getElementById('panel-lock'), unlock: document.getElementById('panel-unlock') };

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected','false'); });
    tab.classList.add('is-active'); tab.setAttribute('aria-selected','true');
    Object.values(panels).forEach(p => p.classList.remove('is-active'));
    panels[tab.dataset.tab].classList.add('is-active');
  });
});

// ---------- Lock (upload) ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const linkInput = document.getElementById('linkInput');
const noteInput = document.getElementById('noteInput');
const lockBtn = document.getElementById('lockBtn');
const lockHint = document.getElementById('lockHint');
const stubResult = document.getElementById('stubResult');
const stubCode = document.getElementById('stubCode');
const stubExpiry = document.getElementById('stubExpiry');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const newLockBtn = document.getElementById('newLockBtn');

let selectedFiles = [];

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('is-drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-drag'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('is-drag');
  addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => addFiles(fileInput.files));

function addFiles(fileArr) {
  for (const f of fileArr) selectedFiles.push(f);
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const li = document.createElement('li');
    const sizeKb = (f.size / 1024).toFixed(0);
    li.innerHTML = `<span>${escapeHtml(f.name)} · ${sizeKb} KB</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'quitar';
    btn.addEventListener('click', () => { selectedFiles.splice(i, 1); renderFileList(); });
    li.appendChild(btn);
    fileList.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

lockBtn.addEventListener('click', async () => {
  const link = linkInput.value.trim();
  const note = noteInput.value.trim();

  if (!selectedFiles.length && !link && !note) {
    setHint(lockHint, 'Agrega al menos un archivo, link o nota.', 'error');
    return;
  }

  lockBtn.disabled = true;
  setHint(lockHint, 'Cerrando casillero…', '');

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('files', f));
  if (link) formData.append('link', link);
  if (note) formData.append('note', note);

  try {
    const res = await fetch('/api/lock', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo cerrar el casillero.');

    stubCode.textContent = data.code;
    stubExpiry.textContent = 'expira ' + formatExpiry(data.expiresAt);
    stubResult.hidden = false;
    setHint(lockHint, '', '');
    lockBtn.parentElement.querySelector('.dropzone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    setHint(lockHint, err.message, 'error');
  } finally {
    lockBtn.disabled = false;
  }
});

copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(stubCode.textContent);
  copyCodeBtn.textContent = 'Copiado ✓';
  setTimeout(() => copyCodeBtn.textContent = 'Copiar código', 1500);
});

newLockBtn.addEventListener('click', () => {
  selectedFiles = [];
  renderFileList();
  linkInput.value = '';
  noteInput.value = '';
  stubResult.hidden = true;
});

function formatExpiry(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function setHint(el, text, kind) {
  el.textContent = text;
  el.className = 'hint' + (kind ? ' ' + kind : '');
}

// ---------- Unlock (retrieve) ----------
const codeInput = document.getElementById('codeInput');
const unlockBtn = document.getElementById('unlockBtn');
const unlockHint = document.getElementById('unlockHint');
const vaultResult = document.getElementById('vaultResult');
const vaultExpiry = document.getElementById('vaultExpiry');
const vaultNote = document.getElementById('vaultNote');
const vaultLink = document.getElementById('vaultLink');
const vaultFiles = document.getElementById('vaultFiles');

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 8);
});
codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlockBtn.click(); });

unlockBtn.addEventListener('click', async () => {
  const code = codeInput.value.trim();
  if (code.length !== 8) {
    setHint(unlockHint, 'El código debe tener 8 dígitos.', 'error');
    return;
  }

  unlockBtn.disabled = true;
  setHint(unlockHint, 'Abriendo…', '');
  vaultResult.hidden = true;

  try {
    const res = await fetch('/api/unlock?code=' + code);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Código inválido o expirado.');

    vaultExpiry.textContent = 'se borra a las ' + formatExpiry(data.expiresAt);

    if (data.note) { vaultNote.textContent = data.note; vaultNote.hidden = false; } else { vaultNote.hidden = true; }
    if (data.link) {
      vaultLink.innerHTML = `<a href="${data.link}" target="_blank" rel="noopener">${escapeHtml(data.link)}</a>`;
      vaultLink.hidden = false;
    } else { vaultLink.hidden = true; }

    vaultFiles.innerHTML = '';
    (data.files || []).forEach(f => {
      const li = document.createElement('li');
      li.innerHTML = `<a href="${f.url}" download="${escapeHtml(f.name)}"><span>${escapeHtml(f.name)}</span><span>descargar ↓</span></a>`;
      vaultFiles.appendChild(li);
    });

    vaultResult.hidden = false;
    setHint(unlockHint, '', '');
  } catch (err) {
    setHint(unlockHint, err.message, 'error');
  } finally {
    unlockBtn.disabled = false;
  }
});
