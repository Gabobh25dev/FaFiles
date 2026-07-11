import { put } from '@vercel/blob';
import { kv } from '@vercel/kv';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false },
};

const TTL_SECONDS = 60 * 60; // 1 hora

function generateCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    const form = new IncomingForm({ multiples: true, maxTotalFileSize: 200 * 1024 * 1024 });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err); else resolve({ fields, files });
      });
    });

    const link = fields.link?.[0] || fields.link || '';
    const note = fields.note?.[0] || fields.note || '';
    let rawFiles = files.files || [];
    if (!Array.isArray(rawFiles)) rawFiles = [rawFiles];

    if (!rawFiles.length && !link && !note) {
      return res.status(400).json({ error: 'No hay nada que guardar.' });
    }

    // Generar código único (reintenta si por azar ya existe)
    let code;
    for (let i = 0; i < 5; i++) {
      code = generateCode();
      const exists = await kv.get(`fafiles:${code}`);
      if (!exists) break;
    }

    const uploaded = [];
    for (const f of rawFiles) {
      if (!f || !f.filepath) continue;
      const buffer = fs.readFileSync(f.filepath);
      const blob = await put(`fafiles/${code}/${Date.now()}-${f.originalFilename}`, buffer, {
        access: 'public',
        contentType: f.mimetype || 'application/octet-stream',
      });
      uploaded.push({ name: f.originalFilename, url: blob.url, pathname: blob.pathname });
    }

    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

    const payload = { note, link, files: uploaded, expiresAt };

    await kv.set(`fafiles:${code}`, JSON.stringify(payload), { ex: TTL_SECONDS });
    // guardado aparte (con más margen) para que el cron de limpieza pueda
    // borrar los blobs reales aunque la clave principal ya haya expirado
    await kv.set(`fafiles:blobs:${code}`, JSON.stringify(uploaded.map(u => u.pathname)), { ex: TTL_SECONDS + 900 });
    await kv.zadd('fafiles:cleanup-queue', { score: Date.now() + TTL_SECONDS * 1000, member: code });

    return res.status(200).json({ code, expiresAt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al procesar la subida.' });
  }
}
