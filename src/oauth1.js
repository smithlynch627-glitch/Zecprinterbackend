import crypto from 'node:crypto';

// RFC 3986 percent-encoding, as OAuth 1.0a requires.
export const pct = (value) =>
  encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Builds a signed OAuth 1.0a (HMAC-SHA1) Authorization header.
 * `params` are query/body parameters that are part of the signature.
 * `oauthExtra` are additional oauth_* parameters (oauth_callback, oauth_verifier).
 */
export function oauthHeader({
  method,
  url,
  consumerKey,
  consumerSecret,
  token = '',
  tokenSecret = '',
  params = {},
  oauthExtra = {},
  nonce = crypto.randomBytes(16).toString('hex'),
  timestamp = Math.floor(Date.now() / 1000).toString(),
}) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
    ...(token ? { oauth_token: token } : {}),
    ...oauthExtra,
  };

  const paramString = Object.entries({ ...params, ...oauth })
    .map(([k, v]) => [pct(k), pct(v)])
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const baseString = [method.toUpperCase(), pct(url), pct(paramString)].join('&');
  const signingKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  return (
    'OAuth ' +
    Object.keys(oauth)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauth[k])}"`)
      .join(', ')
  );
}
