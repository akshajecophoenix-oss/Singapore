// functions/api/register.js
// Cloudflare Pages Function — replaces netlify/functions/register.js
// URL: /api/register  (POST)
// Key change: export onRequest instead of export handler
//             uses Web Crypto for password hashing via bcrypt-style approach
//             env variables accessed via context.env not process.env

import { getSupabase, signToken, ok, err, cors, parseBody } from '../_shared/helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { full_name, email, password } = await parseBody(request);

    if (!full_name || !email || !password) {
      return err('full_name, email and password are required', env);
    }
    if (password.length < 8) {
      return err('Password must be at least 8 characters', env);
    }

    const supabase = getSupabase(env);

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) return err('An account with this email already exists', env);

    // Hash password using Web Crypto (PBKDF2 — Workers-compatible bcrypt alternative)
    const salt = crypto.getRandomValues(new Uint8Array(16));
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
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const passwordHash = `pbkdf2:${saltHex}:${hashHex}`;

    // Insert user
    const { data: user, error: insertErr } = await supabase
      .from('users')
      .insert({
        full_name: full_name.trim(),
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        plan: 'free',
        role: 'user',
      })
      .select('id, full_name, email, plan, role')
      .single();

    if (insertErr) throw new Error(insertErr.message);

    const token = await signToken(
      { userId: user.id, email: user.email, plan: user.plan, role: user.role },
      env.JWT_SECRET
    );

    return ok({ token, user: { id: user.id, full_name: user.full_name, email: user.email, plan: user.plan, role: user.role } }, env, 201);

  } catch (e) {
    console.error('register error:', e);
    return err(e.message || 'Registration failed', env, e.statusCode || 500);
  }
}

// Handle OPTIONS preflight
export async function onRequestOptions({ env }) {
  return cors(env);
}
