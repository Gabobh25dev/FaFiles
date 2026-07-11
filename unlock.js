import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
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
    return res.status(200).json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al abrir el casillero.' });
  }
}
