import { kv } from '@vercel/kv';
import { del } from '@vercel/blob';

// Se ejecuta periódicamente (ver vercel.json) y borra del Blob Storage
// los archivos cuyo código de casillero ya venció.
export default async function handler(req, res) {
  try {
    const now = Date.now();
    const dueCodes = await kv.zrange('fafiles:cleanup-queue', 0, now, { byScore: true });

    let deletedFiles = 0;

    for (const code of dueCodes) {
      const rawPaths = await kv.get(`fafiles:blobs:${code}`);
      if (rawPaths) {
        const pathnames = typeof rawPaths === 'string' ? JSON.parse(rawPaths) : rawPaths;
        for (const pathname of pathnames) {
          try {
            await del(pathname);
            deletedFiles++;
          } catch (e) {
            console.error('No se pudo borrar', pathname, e.message);
          }
        }
        await kv.del(`fafiles:blobs:${code}`);
      }
      await kv.del(`fafiles:${code}`); // por si acaso ya no expiró solo
      await kv.zrem('fafiles:cleanup-queue', code);
    }

    return res.status(200).json({ ok: true, processed: dueCodes.length, deletedFiles });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en limpieza.' });
  }
}
