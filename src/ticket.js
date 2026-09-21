import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { isAllowedArtUrl } from './arts.js';

// Renders a whitelisted user's WL ticket as a 1200x630 PNG (the size X uses for large link previews).
// Text is drawn with bundled fonts, so it looks the same on any server.

const require = createRequire(import.meta.url);
const font = (pkg, file) => readFile(require.resolve(`${pkg}/files/${file}`));

let fontsPromise = null;
function loadFonts() {
  fontsPromise ??= Promise.all([
    font('@fontsource/big-shoulders-display', 'big-shoulders-display-latin-900-normal.woff'),
    font('@fontsource/big-shoulders-display', 'big-shoulders-display-latin-800-normal.woff'),
    font('@fontsource/archivo', 'archivo-latin-500-normal.woff'),
    font('@fontsource/archivo', 'archivo-latin-700-normal.woff'),
  ]).then(([d900, d800, b500, b700]) => [
    { name: 'Display', data: d900, weight: 900, style: 'normal' },
    { name: 'Display', data: d800, weight: 800, style: 'normal' },
    { name: 'Body', data: b500, weight: 500, style: 'normal' },
    { name: 'Body', data: b700, weight: 700, style: 'normal' },
  ]);
  return fontsPromise;
}

// ---- art download (Cloudinary only, size-limited, cached) ----
const artCache = new Map();
const MAX_ART_BYTES = 6_000_000;

export async function fetchArtDataUri(url) {
  if (!isAllowedArtUrl(url)) return null;
  if (artCache.has(url)) return artCache.get(url);
  // Ask Cloudinary for a small square JPEG first; fall back to the original file.
  const sized = url.replace('/image/upload/', '/image/upload/c_fill,w_560,h_560,f_jpg,q_85/');
  for (const candidate of [sized, url]) {
    try {
      const res = await fetch(candidate, { redirect: 'error', signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (!['image/jpeg', 'image/png'].includes(type)) continue;
      if (Number(res.headers.get('content-length') || 0) > MAX_ART_BYTES) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_ART_BYTES) continue;
      const dataUri = `data:${type};base64,${buf.toString('base64')}`;
      if (artCache.size >= 64) artCache.delete(artCache.keys().next().value);
      artCache.set(url, dataUri);
      return dataUri;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// ---- tiny element helper (satori takes React-like objects) ----
const h = (type, style, ...children) => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
});
const img = (src, style) => ({ type: 'img', props: { src, width: style.width, height: style.height, style } });

const C = { gold: '#F4B728', ink: '#1C1407', soft: '#5A4827', sheet: '#FFF8E6', green: '#1D7A46', riso: '#FF5F1F' };

function barcode() {
  const widths = [4, 2, 6, 2, 3, 5, 2, 4, 2, 6, 3, 2, 5, 2, 4, 3, 2, 6, 2, 4, 5, 2, 3, 2, 6, 4, 2, 3, 5, 2, 4, 2];
  return h('div', { height: 56, alignItems: 'stretch', gap: 3 }, ...widths.map((w, i) => h('div', { width: w, background: i % 3 === 2 ? C.soft : C.ink })));
}

function row(label, value, size = 40) {
  return h(
    'div',
    { justifyContent: 'space-between', alignItems: 'baseline', width: '100%' },
    h('div', { fontFamily: 'Body', fontWeight: 500, fontSize: 24, color: C.soft }, label),
    h('div', { fontFamily: 'Display', fontWeight: 800, fontSize: size, color: C.ink }, value),
  );
}

function tree({ username, tier, artDataUri, serial }) {
  const art = artDataUri
    ? img(artDataUri, { width: 452, height: 452, objectFit: 'cover' })
    : h('div', { width: 452, height: 452, background: C.gold, alignItems: 'center', justifyContent: 'center', fontFamily: 'Display', fontWeight: 900, fontSize: 64, color: C.ink }, 'ZEC PRINTER');

  return h(
    'div',
    { width: 1200, height: 630, background: C.gold, padding: '56px 64px', alignItems: 'center', fontFamily: 'Body', position: 'relative' },
    // the print
    h(
      'div',
      { flexDirection: 'column', alignItems: 'center' },
      h('div', { padding: 18, background: C.sheet, border: `6px solid ${C.ink}`, boxShadow: `12px 12px 0 ${C.ink}` }, art),
      h('div', { marginTop: 22, fontFamily: 'Display', fontWeight: 800, fontSize: 30, color: C.ink }, serial ? `ZEC PRINTER No. ${serial}` : 'ZEC PRINTER'),
    ),
    // the ticket
    h(
      'div',
      {
        marginLeft: 64,
        flex: 1,
        height: 518,
        flexDirection: 'column',
        background: C.sheet,
        border: `6px solid ${C.ink}`,
        borderRadius: 20,
        padding: '34px 40px',
        position: 'relative',
      },
      h('div', { fontFamily: 'Display', fontWeight: 900, fontSize: 88, lineHeight: 0.9, color: C.ink }, 'ZEC PRINTER'),
      h('div', { marginTop: 8, fontFamily: 'Body', fontWeight: 700, fontSize: 28, color: C.soft }, 'Whitelist pass'),
      h('div', { marginTop: 24, marginBottom: 22, borderTop: `4px dashed ${C.soft}`, width: '100%' }),
      h(
        'div',
        { flexDirection: 'column', gap: 14, width: '100%' },
        row('X account', `@${username}`, username.length > 12 ? 36 : 44),
        row('Status', 'Whitelisted'),
        row('Tier', tier || 'WL'),
      ),
      h('div', { marginTop: 'auto' }, barcode()),
      // the seal
      h(
        'div',
        {
          position: 'absolute',
          right: 34,
          bottom: 22,
          transform: 'rotate(-9deg)',
          border: `6px solid ${C.green}`,
          borderRadius: 12,
          padding: '4px 16px 0',
          background: 'rgba(255,248,230,0.92)',
          fontFamily: 'Display',
          fontWeight: 900,
          fontSize: 42,
          color: C.green,
          letterSpacing: 2,
        },
        'APPROVED',
      ),
    ),
  );
}

// ---- rendering: at most 2 at a time, results cached ----
let running = 0;
const queue = [];
async function withSlot(fn) {
  if (running >= 2) await new Promise((resolve) => queue.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

const pngCache = new Map();

export async function renderTicketPng({ cacheKey, username, tier, artUrl, serial }) {
  if (cacheKey && pngCache.has(cacheKey)) return pngCache.get(cacheKey);
  const png = await withSlot(async () => {
    const [fonts, artDataUri] = await Promise.all([loadFonts(), artUrl ? fetchArtDataUri(artUrl) : null]);
    const svg = await satori(tree({ username, tier, artDataUri, serial }), { width: 1200, height: 630, fonts });
    return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  });
  if (cacheKey) {
    if (pngCache.size >= 300) pngCache.delete(pngCache.keys().next().value);
    pngCache.set(cacheKey, png);
  }
  return png;
}
