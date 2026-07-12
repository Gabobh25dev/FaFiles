import { handleUpload } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { kv } from '@vercel/kv';
import { checkRateLimit } from './_ratelimit.js';

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export default async function handler(req, res) {
  const { allowed } = await checkRateLimit(req, 'blob-upload', 60, 600);
  if (!allowed) {
    return res.status(429).json({ error: 'Demasiadas subidas en poco tiempo. Espera unos minutos.' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,

      // Se ejecuta ANTES de darle permiso al navegador para subir.
      // Aquí es donde exigimos que el código de 8 dígitos exista y no haya expirado.
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let code, name;
        try {
          ({ code, name } = JSON.parse(clientPayload || '{}'));
        } catch {
          throw new Error('Payload inválido.');
        }
        if (!/^\d{8}$/.test(code || '')) {
          throw new Error('Código inválido.');
        }
        const exists = await kv.get(`fafiles:${code}`);
        if (!exists) {
          throw new Error('El casillero ya no existe o expiró.');
        }

        return {
          access: 'private',
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          tokenPayload: JSON.stringify({ code, name }),
        };
      },

      // Se ejecuta DESPUÉS de que el archivo ya está en Blob.
      // Aquí lo registramos en la metadata del casillero.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { code, name } = JSON.parse(tokenPayload || '{}');
        const raw = await kv.get(`fafiles:${code}`);

        if (!raw) {
          // El casillero expiró justo mientras se subía: no dejamos huérfanos.
          await del(blob.pathname).catch(() => {});
          return;
        }

        const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        payload.files = payload.files || [];
        payload.files.push({ name, pathname: blob.pathname });

        const remainingTtl = Math.max(
          60,
          Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000)
        );

        await kv.set(`fafiles:${code}`, JSON.stringify(payload), { ex: remainingTtl });
        await kv.set(
          `fafiles:blobs:${code}`,
          JSON.stringify(payload.files.map(f => f.pathname)),
          { ex: remainingTtl + 900 }
        );
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message });
  }
}