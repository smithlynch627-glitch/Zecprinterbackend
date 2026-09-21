import { rpc } from './supabase.js';

// Only Cloudinary image links are ever used (the database enforces the same rule),
// so the backend never fetches from any other host.
export const ART_URL_RE = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[A-Za-z0-9_.,/-]+$/;
export const isAllowedArtUrl = (url) => typeof url === 'string' && url.length <= 400 && ART_URL_RE.test(url) && !url.includes('..');

// Active arts from the database, cached for 5 minutes.
let cache = { at: 0, data: null, pending: null };

export async function getArts() {
  if (cache.data && Date.now() - cache.at < 5 * 60_000) return cache.data;
  if (!cache.pending) {
    cache.pending = rpc('api_public_arts')
      .then((rows) => {
        const data = (Array.isArray(rows) ? rows : []).filter((a) => Number.isInteger(a.id) && isAllowedArtUrl(a.url));
        cache = { at: Date.now(), data, pending: null };
        return data;
      })
      .catch((err) => {
        cache.pending = null;
        if (cache.data) return cache.data; // serve the last good list if the database blips
        throw err;
      });
  }
  return cache.pending;
}
