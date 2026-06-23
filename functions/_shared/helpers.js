// functions/_shared/helpers.js
// ─────────────────────────────────────────────────────────────────
// Shared utilities for ALL Cloudflare Pages Functions
// Key differences from Netlify version:
//   - No require() — uses ES module imports
//   - JWT uses Web Crypto API (no jsonwebtoken package — not available in Workers)
//   - Supabase client works the same (supabase-js is Workers-compatible)
//   - Request object is a standard Web Request, not Netlify's event object
// ─────────────────────────────────────────────────────────────────
// Lightweight Supabase REST client — no npm package needed
// Works natively in Cloudflare Workers without any dependencies

// ── Supabase lightweight client (no npm needed) ───────────────────
export function getSupabase(env) {
  return new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
}

class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
  }
  from(table) {
    return new SupabaseQuery(this.url, this.key, table);
  }
}

class SupabaseQuery {
  constructor(url, key, table) {
    this._url    = url;
    this._key    = key;
    this._table  = table;
    this._method = 'GET';
    this._body   = null;
    this._select = '*';
    this._filters = [];
    this._order  = null;
    this._limit  = null;
    this._range  = null;
    this._single = false;
    this._count  = false;
    this._prefer = 'return=representation';
  }

  select(cols = '*', opts = {}) {
    this._select = cols;
    if (opts.count === 'exact') this._count = true;
    return this;
  }

  insert(data) {
    this._method = 'POST';
    this._body   = data;
    return this;
  }

  update(data) {
    this._method = 'PATCH';
    this._body   = data;
    return this;
  }

  delete() {
    this._method = 'DELETE';
    return this;
  }

  eq(col, val) {
    this._filters.push(`${col}=eq.${encodeURIComponent(val)}`);
    return this;
  }

  order(col, { ascending = true } = {}) {
    this._order = `${col}.${ascending ? 'asc' : 'desc'}`;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  range(from, to) {
    this._range = `${from}-${to}`;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  then(resolve, reject) {
    return this._run().then(resolve, reject);
  }

  async _run() {
    // Build URL
    let qs = `select=${encodeURIComponent(this._select)}`;
    for (const f of this._filters) qs += `&${f}`;
    if (this._order) qs += `&order=${this._order}`;
    if (this._limit) qs += `&limit=${this._limit}`;

    const endpoint = `${this._url}/rest/v1/${this._table}?${qs}`;

    // Build headers
    const headers = {
      'apikey':        this._key,
      'Authorization': `Bearer ${this._key}`,
      'Content-Type':  'application/json',
      'Prefer':        this._count ? 'count=exact' : this._prefer,
    };
    if (this._single) headers['Accept'] = 'application/vnd.pgrst.object+json';
    if (this._range)  headers['Range']  = this._range;

    const res = await fetch(endpoint, {
      method:  this._method,
      headers,
      body:    this._body ? JSON.stringify(this._body) : undefined,
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!res.ok) {
      const msg = data?.message || data?.hint || data?.error || `Supabase error ${res.status}: ${text}`;
      return { data: null, error: { message: msg }, count: null };
    }

    const count = this._count
      ? parseInt(res.headers.get('content-range')?.split('/')[1] || '0')
      : null;

    return { data, error: null, count };
  }
}

// ── JWT using Web Crypto API (Workers-compatible) ─────────────────
// Cloudflare Workers don't support Node's jsonwebtoken package.
// We use the built-in Web Crypto API instead.

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

export async function signToken(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + 60 * 60 * 24 * 7 }; // 7 days
  const body = base64url(JSON.stringify(fullPayload));
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = base64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

export async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Invalid token format');

  const [header, body, sig] = parts;
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = Uint8Array.from(base64urlDecode(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new AuthError('Invalid token signature');

  const payload = JSON.parse(base64urlDecode(body));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError('Token expired. Please log in again.');
  }
  return payload;
}

export function getTokenFromRequest(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.split(' ')[1];
}

export async function requireAuth(request, env) {
  const token = getTokenFromRequest(request);
  if (!token) throw new AuthError('No token provided. Please log in.');
  return await verifyToken(token, env.JWT_SECRET);
}

// ── CORS / Response helpers ───────────────────────────────────────
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env?.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };
}

export function ok(body, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(env),
  });
}

export function err(message, env, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(env),
  });
}

export function cors(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

export async function parseBody(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// ── Custom error ──────────────────────────────────────────────────
export class AuthError extends Error {
  constructor(msg) {
    super(msg);
    this.statusCode = 401;
  }
}
