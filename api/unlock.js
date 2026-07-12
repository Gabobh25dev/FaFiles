import { kv } from '@vercel/kv';
import { checkRateLimit } from './_ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const { allowed } = await checkRateLimit(req, 'unlock', 20, 600);
  if (!allowed) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' });
  }

  const code = String(req.query.code || '').trim();

  if (!/^\d{8}$/.test(code)) {
    return res.status(400).json({ error: 'Código inválido.' });
  }

  try {
    const raw = await kv.get(`fafiles:${code}`);
    if (!raw) {
      return res.status(404).json({ error: 'Código incorrecto o ya expiró.' });
    }

    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // Convierte cada archivo en un link de descarga que pasa por nuestra propia
    // función (que vuelve a exigir el código), en vez de exponer la URL del blob.
    const filesWithDownloadUrl = (payload.files || []).map(f => ({
      name: f.name,
      url: `/api/download?code=${code}&pathname=${encodeURIComponent(f.pathname)}`,
    }));

    return res.status(200).json({ ...payload, files: filesWithDownloadUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al abrir el casillero.' });
  }
}