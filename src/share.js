import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { rpc } from './supabase.js';
import { getArts } from './arts.js';
import { renderTicketPng } from './ticket.js';

// Public share links for WL tickets:
//   /s/<code>/<artId>      page with preview tags (X reads these), then sends people to the website
//   /s/<code>/<artId>.png  the ticket image
// A link only works while its owner is whitelisted and not banned. Codes are 12 random characters.

export const shareRouter = Router();

shareRouter.use(
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }),
);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function notFound(res, png) {
  if (png) return res.status(404).type('text/plain').send('Not found');
  return res
    .status(404)
    .type('html')
    .send(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${esc(config.frontendUrl)}/"><title>ZEC PRINTER</title><a href="${esc(config.frontendUrl)}/">Open ZEC PRINTER</a>`);
}

shareRouter.get('/:code/:file', async (req, res) => {
  const { code, file } = req.params;
  const match = /^(\d{1,9})(\.png)?$/.exec(file);
  const wantsPng = Boolean(match?.[2]);
  if (!/^[A-Za-z0-9]{12}$/.test(code) || !match) return notFound(res, wantsPng);

  try {
    const card = await rpc('api_share_card', { p_code: code });
    if (!card?.username) return notFound(res, wantsPng);

    const arts = await getArts().catch(() => []);
    const artIndex = arts.findIndex((a) => a.id === Number(match[1]));
    const art = artIndex >= 0 ? arts[artIndex] : arts[0];
    const artId = art ? art.id : Number(match[1]);
    const serial = String(artIndex >= 0 ? artIndex + 1 : 1).padStart(4, '0');

    if (wantsPng) {
      const png = await renderTicketPng({
        cacheKey: `${code}|${artId}|${card.username}|${card.wl_tier ?? ''}|${art?.url ?? ''}`,
        username: card.username,
        tier: card.wl_tier,
        artUrl: art?.url ?? null,
        serial,
      });
      return res.type('png').set('Cache-Control', 'public, max-age=3600').send(png);
    }

    const title = `@${card.username} is whitelisted for ZEC PRINTER`;
    const desc = `${card.wl_tier ? card.wl_tier + ' spot. ' : ''}3,333 pieces printed on Zcash.`;
    const image = `${config.publicUrl}/s/${code}/${artId}.png`;
    const pageUrl = `${config.publicUrl}/s/${code}/${artId}`;
    const site = `${config.frontendUrl}/`;
    return res
      .type('html')
      .set('Cache-Control', 'public, max-age=300')
      .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(site)}">
</head><body><a href="${esc(site)}">Open ZEC PRINTER</a></body></html>`);
  } catch (err) {
    console.error('[share] error:', err?.message ?? err);
    return res.status(500).type('text/plain').send('Something went wrong');
  }
});
