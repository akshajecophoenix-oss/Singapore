// functions/api/change-password.js
// Cloudflare Pages Function
// POST /api/change-password

import { getSupabase, requireAuth, ok, err, cors, parseBody } from '../_shared/helpers.js';

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
  const [, saltHex, expectedHashHex] = storedHash.split(':');
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

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const user = await requireAuth(request, env);
    const { current_password, new_password } = await parseBody(request);

    if (!current_password || !new_password) {
      return err('current_password and new_password are required', env);
    }
    if (new_password.length < 8) {
      return err('New password must be at least 8 characters', env);
    }

    const supabase = getSupabase(env);
    const { data: userData, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', user.userId)
      .single();

    if (error || !userData) return err('User not found', env, 404);

    const valid = await verifyPassword(current_password, userData.password_hash);
    if (!valid) return err('Current password is incorrect', env, 401);

    const newHash = await hashPassword(new_password);
    await supabase.from('users').update({ password_hash: newHash }).eq('id', user.userId);

    return ok({ message: 'Password updated successfully' }, env);

  } catch (e) {
    return err(e.message || 'Failed to change password', env, e.statusCode || 500);
  }
}

export async function onRequestOptions({ env }) {
  return cors(env);
}
