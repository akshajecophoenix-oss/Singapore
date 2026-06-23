// functions/api/audits.js
// Cloudflare Pages Function — replaces netlify/functions/audits.js
// GET  /api/audits      — list user's audits
// POST /api/audits      — save new audit

import { getSupabase, requireAuth, ok, err, cors, parseBody } from '../_shared/helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const user = await requireAuth(request, env);
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from('audits')
      .select('id, created_at, score, applicable, gaps, market')
      .eq('user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    return ok({ audits: data || [] }, env);

  } catch (e) {
    return err(e.message || 'Failed to load audits', env, e.statusCode || 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const user = await requireAuth(request, env);
    const body = await parseBody(request);

    const { score, applicable, compliant, gaps, answers, ai_insight, market } = body;

    const supabase = getSupabase(env);
    const { data, error } = await supabase
      .from('audits')
      .insert({
        user_id: user.userId,
        score: score ?? 0,
        applicable: applicable ?? 0,
        compliant: compliant ?? 0,
        gaps: gaps ?? [],
        answers: answers ?? {},
        ai_insight: ai_insight ?? '',
        market: market ?? 'sg',
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(error.message);
    return ok({ id: data.id, created_at: data.created_at }, env, 201);

  } catch (e) {
    return err(e.message || 'Failed to save audit', env, e.statusCode || 500);
  }
}

export async function onRequestOptions({ env }) {
  return cors(env);
}
