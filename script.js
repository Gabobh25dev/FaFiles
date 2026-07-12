// ---------- Cliente de Vercel Blob (subida directa navegador -> Blob) ----------
import { upload } from 'https://esm.sh/@vercel/blob@2.6.1/client';

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

function isSafeUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

lockBtn.addEventListener('click', async () => {
  const link = linkInput.value.trim();
  const note = noteInput.value.trim();

  if (!selectedFiles.length && !link && !note) {
    setHint(lockHint, 'Agrega al menos un archivo, link o nota.', 'error');
    return;
  }

  lockBtn.disabled = true;

  try {
    // 1. Crear el casillero (código + metadata), todavía sin archivos.
    setHint(lockHint, 'Reservando casillero…', '');
    const initRes = await fetch('/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, link }),
    });
    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(initData.error || 'No se pudo crear el casillero.');

    const { code, expiresAt } = initData;

    // 2. Subir cada archivo DIRECTO al Blob Storage (no pasa por nuestra función),
    // uno por uno para evitar condiciones de carrera al registrar la lista.
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setHint(lockHint, `Subiendo ${i + 1} de ${selectedFiles.length}: ${file.name}…`, '');

      await upload(`fafiles/${code}/${Date.now()}-${file.name}`, file, {
        access: 'private',
        handleUploadUrl: '/api/blob-upload',
        clientPayload: JSON.stringify({ code, name: file.name }),
      });
    }

    stubCode.textContent = code;
    stubExpiry.textContent = 'expira ' + formatExpiry(expiresAt);
    stubResult.hidden = false;
    setHint(lockHint, '', '');
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

    vaultLink.innerHTML = '';
    if (data.link && isSafeUrl(data.link)) {
      const a = document.createElement('a');
      a.href = data.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = data.link;
      vaultLink.appendChild(a);
      vaultLink.hidden = false;
    } else if (data.link) {
      // Link presente pero con esquema no permitido (ej. javascript:) — se muestra como texto plano, no como link clickeable.
      vaultLink.textContent = data.link;
      vaultLink.hidden = false;
    } else {
      vaultLink.hidden = true;
    }

    vaultFiles.innerHTML = '';
    (data.files || []).forEach(f => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = f.url;
      a.setAttribute('download', f.name);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = f.name;
      const dlSpan = document.createElement('span');
      dlSpan.textContent = 'descargar ↓';
      a.appendChild(nameSpan);
      a.appendChild(dlSpan);
      li.appendChild(a);
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