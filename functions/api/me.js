// functions/api/me.js
// Cloudflare Pages Function — replaces netlify/functions/me.js
// GET   /api/me  — get current user profile
// PATCH /api/me  — update profile

import { getSupabase, requireAuth, ok, err, cors, parseBody } from '../_shared/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
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
    return err(e.message || 'Failed to fetch profile', env, e.statusCode || 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
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
    return err(e.message || 'Failed to update profile', env, e.statusCode || 500);
  }
}

export async function onRequestOptions({ env }) {
  return cors(env);
}
