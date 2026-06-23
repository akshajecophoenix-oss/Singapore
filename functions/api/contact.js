// functions/api/contact.js
// Cloudflare Pages Function
// POST /api/contact — saves form submissions to Supabase contact_forms table

import { getSupabase, ok, err, cors, parseBody } from '../_shared/helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await parseBody(request);
    const {
      form_type,
      full_name,
      email,
      company,
      industry,
      role,
      time_slot,
      market,
      message
    } = body;

    // Basic validation
    if (!full_name || !email) {
      return err('Name and email are required', env);
    }

    // Email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return err('Please enter a valid email address', env);
    }

    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from('contact_forms')
      .insert({
        form_type:  form_type  || 'general',
        full_name:  full_name.trim(),
        email:      email.toLowerCase().trim(),
        company:    company    || null,
        industry:   industry   || null,
        role:       role       || null,
        time_slot:  time_slot  || null,
        market:     market     || null,
        message:    message    || null,
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(error.message);

    return ok({
      success: true,
      message: 'Thank you! We will be in touch within 24 hours.',
      id: data.id
    }, env, 201);

  } catch (e) {
    console.error('contact form error:', e);
    return err(e.message || 'Failed to submit form', env, 500);
  }
}

export async function onRequestOptions({ env }) {
  return cors(env);
}
