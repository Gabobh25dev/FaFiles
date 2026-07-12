import { kv } from '@vercel/kv';

/**
 * Límite simple por IP usando KV (contador con expiración).
 * Devuelve { allowed: boolean, remaining: number }.
 */
export async function checkRateLimit(req, bucket, limit, windowSeconds) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';

  const key = `ratelimit:${bucket}:${ip}`;
  const count = await kv.incr(key);
  if (count === 1) {
    await kv.expire(key, windowSeconds);
  }

  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}