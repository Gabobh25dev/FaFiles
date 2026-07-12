import { kv } from '@vercel/kv';
import { get } from '@vercel/blob';
import { checkRateLimit } from './_ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const { allowed } = await checkRateLimit(req, 'download', 30, 600);
  if (!allowed) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' });
  }

  const code = String(req.query.code || '').trim();
  const pathname = String(req.query.pathname || '').trim();

  if (!/^\d{8}$/.test(code) || !pathname) {
    return res.status(400).json({ error: 'Solicitud inválida.' });
  }

  try {
    // Vuelve a exigir el código: si ya expiró o no existe, no se entrega nada.
    const raw = await kv.get(`fafiles:${code}`);
    if (!raw) {
      return res.status(404).json({ error: 'Código incorrecto o ya expiró.' });
    }

    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const belongsToCode = (payload.files || []).some(f => f.pathname === pathname);
    if (!belongsToCode) {
      return res.status(403).json({ error: 'Este archivo no pertenece a ese código.' });
    }

    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }

    res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Convierte el stream web a stream de Node y lo transmite.
    const { Readable } = await import('node:stream');
    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al descargar el archivo.' });
  }
}