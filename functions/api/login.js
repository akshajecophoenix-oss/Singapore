// functions/api/login.js
// Cloudflare Pages Function — replaces netlify/functions/login.js
// URL: /api/login  (POST)

import { getSupabase, signToken, ok, err, cors, parseBody } from '../_shared/helpers.js';

async function verifyPassword(password, storedHash) {
  // Supports our PBKDF2 format: "pbkdf2:saltHex:hashHex"
  if (!storedHash.startsWith('pbkdf2:')) return false;

  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;

  const saltHex = parts[1];
  const expectedHashHex = parts[2];

  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hashBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(hashBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === expectedHashHex;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email, password } = await parseBody(request);
    if (!email || !password) return err('Email and password are required', env);

    const supabase = getSupabase(env);

    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('id, full_name, email, password_hash, plan, role')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (fetchErr || !user) return err('Invalid email or password', env, 401);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return err('Invalid email or password', env, 401);

    const token = await signToken(
      { userId: user.id, email: user.email, plan: user.plan, role: user.role },
      env.JWT_SECRET
    );

    return ok({
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, plan: user.plan, role: user.role }
    }, env);

  } catch (e) {
    console.error('login error:', e);
    return err(e.message || 'Login failed', env, e.statusCode || 500);
  }
}

export async function onRequestOptions({ env }) {
  return cors(env);
}
