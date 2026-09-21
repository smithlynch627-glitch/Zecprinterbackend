import crypto from 'node:crypto';

// Checks a Zcash mainnet address INCLUDING its checksum, so typos are caught before saving.
//   transparent: t1... (P2PKH) or t3... (P2SH), base58check, 35 characters
//   shielded:    u1... (unified address, bech32m) or zs1... (Sapling, bech32)
// Returns { ok: true, type, address } or { ok: false, reason }.

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const T_PREFIXES = { t1: [0x1c, 0xb8], t3: [0x1c, 0xbd] };

function base58Decode(str) {
  let n = 0n;
  for (const ch of str) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of str) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

function checkTransparent(addr) {
  if (!/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false;
  const raw = base58Decode(addr);
  if (!raw || raw.length !== 26) return false;
  const payload = raw.subarray(0, 22);
  const checksum = raw.subarray(22);
  if (!sha256(sha256(payload)).subarray(0, 4).equals(checksum)) return false;
  const prefix = T_PREFIXES[addr.slice(0, 2)];
  return raw[0] === prefix[0] && raw[1] === prefix[1];
}

// ---- bech32 / bech32m (BIP-173 / BIP-350) ----
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
export const BECH32 = 1;
export const BECH32M = 0x2bc830a3;

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ GEN[i]) >>> 0;
  }
  return chk;
}

const hrpExpand = (hrp) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

/** Verifies a bech32-family string. No 90-character limit: unified addresses are longer. */
export function bech32Verify(str, expectedConst) {
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) return null;
  const s = str.toLowerCase();
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length) return null;
  const hrp = s.slice(0, pos);
  const data = [];
  for (const ch of s.slice(pos + 1)) {
    const v = CHARSET.indexOf(ch);
    if (v < 0) return null;
    data.push(v);
  }
  return polymod([...hrpExpand(hrp), ...data]) === expectedConst ? { hrp, normalized: s } : null;
}

export function validateZcashAddress(input) {
  const addr = String(input ?? '').trim();
  if (!addr) return { ok: false, reason: 'EMPTY' };
  if (addr.length > 500) return { ok: false, reason: 'INVALID' };

  if (/^t/i.test(addr)) {
    return checkTransparent(addr) ? { ok: true, type: 'transparent', address: addr } : { ok: false, reason: 'INVALID' };
  }

  const lower = addr.toLowerCase();
  if (lower.startsWith('u1')) {
    const r = bech32Verify(addr, BECH32M);
    if (r && r.hrp === 'u' && r.normalized.length >= 100) return { ok: true, type: 'shielded', address: r.normalized };
    return { ok: false, reason: 'INVALID' };
  }
  if (lower.startsWith('zs1')) {
    const r = bech32Verify(addr, BECH32);
    if (r && r.hrp === 'zs' && r.normalized.length === 78) return { ok: true, type: 'shielded', address: r.normalized };
    return { ok: false, reason: 'INVALID' };
  }
  return { ok: false, reason: 'UNSUPPORTED' };
}
