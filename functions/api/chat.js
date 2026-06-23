// functions/api/chat.js
// Cloudflare Pages Function — replaces netlify/functions/chat.js
// URL: /api/chat  (POST)
// Uses Gemini 2.5 Flash API — same as before, just env via context.env

import { requireAuth, ok, err, cors, parseBody } from '../_shared/helpers.js';

const SYSTEM_PROMPT = `You are Aria, an expert ESG compliance advisor for The Climate Architects.
You help businesses understand and comply with sustainability regulations in Singapore and the European Union.

Singapore regulations you know deeply:
- Carbon Tax (CPA): S$45/tonne for facilities emitting ≥25,000 tCO2e/year from 2026-27
- Mandatory Energy Management (ECA): companies consuming ≥54 TJ/year must appoint certified Energy Manager
- Water Efficiency Management (WEMP): premises using ≥60,000 m³/year must submit records to PUB
- Mandatory Packaging Reporting: brand owners/importers >S$10M turnover with ≥50 tonnes packaging
- Climate Reporting for non-listed companies: revenue ≥S$1B + assets ≥S$500M, from FY2027
- SGX Sustainability Reporting: listed companies, IFRS SDS, 4 months after FY end
- E-waste EPR: producers/retailers of regulated electronics

EU regulations you know deeply:
- CSRD: >1,000 employees AND >€450M turnover (post-Omnibus I). FY2027 data, report 2028. ESRS standards.
- CBAM: Importers of steel, cement, aluminium, fertilizers, electricity, hydrogen. ACD deadline 31 Mar 2026.
- EmpCo: Greenwashing ban — all EU consumer-facing claims. Enforcement 27 Sep 2026.
- CSDDD: >5,000 employees AND >€1.5B turnover. Phase 1 July 2028. Value-Chain Cap protects SMEs.
- ESPR: Unsold goods destruction ban 19 Jul 2026 for textiles/footwear. Digital Product Passports from 2027.
- PPWR: 100% recyclable packaging + PFAS ban from 12 Aug 2026.
- Pay Transparency: Salary ranges in job ads from 7 Jun 2026.
- DIWASS: Digital waste shipments mandatory from 21 May 2026.
- VSME: Voluntary SME standard from EFRAG — Basic/Narrative-PAT/Business Partner modules.

Keep answers concise, practical, and actionable. Always mention the specific threshold or deadline.
If you don't know something, say so and suggest they book a call with the team.`;

// Simple chat message rate limit using KV (if available)
async function checkRateLimit(userId, plan, env) {
  if (plan !== 'free') return true; // Pro users unlimited
  if (!env.TCA_KV) return true; // No KV configured — skip limiting

  const key = `chat_count:${userId}:${new Date().toISOString().split('T')[0]}`;
  const count = parseInt(await env.TCA_KV.get(key) || '0');
  if (count >= 5) return false;
  await env.TCA_KV.put(key, String(count + 1), { expirationTtl: 86400 }); // expires in 24h
  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const user = await requireAuth(request, env);
    const body = await parseBody(request);

    // Rate limit free users
    const allowed = await checkRateLimit(user.userId, user.plan, env);
    if (!allowed) {
      return err('Daily message limit reached (5/day on Free plan). Upgrade to Pro for unlimited access.', env, 429);
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // ── Audit insight generation ──────────────────────────────────
    if (action === 'insight') {
      const { score, gaps, applicable, market } = body;
      const marketContext = market === 'eu' ? 'EU directives (CSRD, CBAM, EmpCo, CSDDD)' : 'Singapore regulations (Carbon Tax, ECA, WEMP, SGX)';
      const prompt = `A business just completed their ESG compliance audit for ${marketContext}.
Score: ${score}% compliant. Applicable frameworks: ${applicable}. Gaps: ${gaps?.length || 0}.
${gaps?.length ? `Key gaps: ${gaps.map(g => g.title).join(', ')}` : 'No gaps identified.'}

Write a 2-3 sentence professional insight about their compliance standing and the most important next step they should take. Be specific and actionable.`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
        }
      );
      const geminiData = await geminiRes.json();
      const insight = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'Analysis complete. Please review your gaps above.';
      return ok({ insight }, env);
    }

    // ── Regular chat ──────────────────────────────────────────────
    const { messages } = body;
    if (!messages || !Array.isArray(messages)) {
      return err('messages array is required', env);
    }

    // Convert to Gemini format
    const geminiContents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\nUser: ' + messages[0]?.content }] },
      ...messages.slice(1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: geminiContents })
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.text();
      console.error('Gemini error:', errData);
      return err('AI service temporarily unavailable', env, 503);
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) return err('No response from AI service', env, 503);

    return ok({ reply }, env);

  } catch (e) {
    console.error('chat error:', e);
    return err(e.message || 'Chat failed', env, e.statusCode || 500);
  }
}

export async function onRequestOptions({ env }) {
  return cors(env);
}
