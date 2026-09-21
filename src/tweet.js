const TWEET_RE =
  /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:\/(?:photo|video)\/\d)?\/?$/;

/**
 * Checks the FORMAT of a post link only. No request is made to X.
 * Returns { handle, id, url } for a valid X post link, otherwise null.
 */
export function parseTweetUrl(input) {
  const clean = String(input ?? '').trim().split(/[?#]/)[0];
  const match = TWEET_RE.exec(clean);
  if (!match) return null;
  return { handle: match[1], id: match[2], url: `https://x.com/${match[1]}/status/${match[2]}` };
}
