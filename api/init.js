import { kv } from '@vercel/kv';
import { checkRateLimit } from './_ratelimit.js';

const TTL_SECONDS = 60 * 60; // 1 hora

function generateCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const { allowed } = await checkRateLimit(req, 'init', 15, 600);
  if (!allowed) {
    return res.status(429).json({ error: 'Demasiados casilleros creados. Espera unos minutos.' });
  }

  try {
    const { note = '', link = '' } = req.body || {};

    // Genera un código único (reintenta si por azar ya existe uno activo).
    let code;
    for (let i = 0; i < 5; i++) {
      code = generateCode();
      const exists = await kv.get(`fafiles:${code}`);
      if (!exists) break;
    }

    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
    const payload = {
      note: String(note).slice(0, 5000),
      link: String(link).slice(0, 2000),
      files: [],
      expiresAt,
    };

    await kv.set(`fafiles:${code}`, JSON.stringify(payload), { ex: TTL_SECONDS });
    await kv.zadd('fafiles:cleanup-queue', { score: Date.now() + TTL_SECONDS * 1000, member: code });

    return res.status(200).json({ code, expiresAt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al crear el casillero.' });
  }
}