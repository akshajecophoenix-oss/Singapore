// functions/api/auth.js
// Handles all auth routes the dashboard calls:
//   GET  /api/auth?action=me       — get current user
//   POST /api/auth?action=login    — login
//   POST /api/auth?action=register — register

import { getSupabase, signToken, verifyToken, requireAuth, ok, err, cors, parseBody } from '../_shared/helpers.js';

// ── Password helpers ──────────────────────────────────────────────
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(hashBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash.startsWith('pbkdf2:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const saltHex = parts[1];
  const expectedHashHex = parts[2];
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(hashBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === expectedHashHex;
}

// ── GET /api/auth?action=me ───────────────────────────────────────
async function handleMe(request, env) {
  try {
    const user = await requireAuth(request, env);
    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, plan, role, created_at')
      .eq('id', user.userId)
      .single();

    if (error || !data) return err('User not found', env, 404);
    return ok({ user: data }, env);
  } catch (e) {
    return err(e.message || 'Auth failed', env, e.statusCode || 401);
  }
}

// ── POST /api/auth?action=login ───────────────────────────────────
async function handleLogin(request, env) {
  try {
    const { email, password } = await parseBody(request);
    if (!email || !password) return err('Email and password are required', env);

    const supabase = getSupabase(env);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, full_name, email, password_hash, plan, role')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) return err('Invalid email or password', env, 401);

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
    return err(e.message || 'Login failed', env, 500);
  }
}

// ── POST /api/auth?action=register ───────────────────────────────
async function handleRegister(request, env) {
  try {
    const { full_name, email, password, company, industry } = await parseBody(request);

    if (!full_name || !email || !password) {
      return err('full_name, email and password are required', env);
    }
    if (password.length < 8) {
      return err('Password must be at least 8 characters', env);
    }

    const supabase = getSupabase(env);

    // Check if already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) return err('An account with this email already exists', env);

    const passwordHash = await hashPassword(password);

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

    return ok({
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, plan: user.plan, role: user.role }
    }, env, 201);

  } catch (e) {
    return err(e.message || 'Registration failed', env, 500);
  }
}

// ── PATCH /api/auth?action=update ────────────────────────────────
async function handleUpdate(request, env) {
  try {
    const user = await requireAuth(request, env);
    const { full_name } = await parseBody(request);
    if (!full_name) return err('full_name is required', env);

    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from('users')
      .update({ full_name: full_name.trim() })
      .eq('id', user.userId)
      .select('id, full_name, email, plan, role')
      .single();

    if (error) throw new Error(error.message);
    return ok({ user: data }, env);
  } catch (e) {
    return err(e.message || 'Update failed', env, e.statusCode || 500);
  }
}

// ── Router ────────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action === 'me') return handleMe(request, env);
  return err('Unknown action', env, 404);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action === 'login')    return handleLogin(request, env);
  if (action === 'register') return handleRegister(request, env);
  return err('Unknown action', env, 404);
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action === 'update') return handleUpdate(request, env);
  return err('Unknown action', env, 404);
}

export async function onRequestOptions({ env }) {
  return cors(env);
}
