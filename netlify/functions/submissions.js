// Identity-gated proxy for the Netlify Forms API.
//
// SECURITY MODEL — the whole point of this file:
//   1. The API token lives only in this function's environment. It is never
//      sent to the browser and never appears in any file in this repo.
//   2. Netlify populates context.clientContext.user only when the request
//      carries a valid Netlify Identity token. No valid user => 401, and no
//      submission data is fetched or returned at all.
//   3. Identity registration is invite-only, so only people Desmond invited
//      by email can ever obtain a token.
//
// A visitor who finds this URL gets 401. Hiding the page in the UI is not
// what protects the data — this check is.

// Netlify rejects custom env var names beginning with NETLIFY_, so the token
// could be called almost anything. Try the likely names, then fall back to
// recognising a Netlify personal access token by its shape.
const TOKEN_NAMES = [
  'NETLIFY_API_TOKEN', 'NETLIFY_ACCESS_TOKEN', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_TOKEN',
  'API_TOKEN', 'ACCESS_TOKEN', 'AUTH_TOKEN', 'FORMS_TOKEN', 'FORMS_API_TOKEN',
  'DASHBOARD_TOKEN', 'SUBMISSIONS_TOKEN', 'PAT', 'NF_TOKEN'
];

function findToken() {
  for (const name of TOKEN_NAMES) {
    const value = (process.env[name] || '').trim();
    if (value) return { name, value };
  }
  // Last resort: any variable holding something shaped like a Netlify PAT.
  for (const [name, raw] of Object.entries(process.env)) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (/^nfp_[A-Za-z0-9]{20,}$/.test(value)) return { name, value };
  }
  return null;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

exports.handler = async (event, context) => {
  // --- The gate ---
  const user = context.clientContext && context.clientContext.user;
  if (!user) return json(401, { error: 'Not logged in.' });

  const token = findToken();
  if (!token) {
    return json(500, {
      error: 'No API token found.',
      help: 'Add your Netlify personal access token under Site configuration → ' +
            'Environment variables. Any name works except one starting with NETLIFY_.',
      // Names only, never values — enough to debug without exposing anything.
      envNamesSeen: Object.keys(process.env).filter(n => /TOKEN|PAT|KEY|SECRET/i.test(n))
    });
  }

  const siteId = process.env.SITE_ID;
  if (!siteId) return json(500, { error: 'SITE_ID not available in this environment.' });

  const api = async path => {
    const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token.value}` }
    });
    if (!res.ok) throw Object.assign(new Error(`Netlify API ${res.status}`), { status: res.status });
    return res.json();
  };

  try {
    const forms = await api(`/sites/${siteId}/forms`);

    const collected = await Promise.all(
      forms.map(async form => {
        const subs = await api(`/forms/${form.id}/submissions?per_page=100`);
        return {
          name: form.name,
          count: subs.length,
          submissions: subs.map(s => ({
            id: s.id,
            number: s.number,
            createdAt: s.created_at,
            data: s.data || {}
          }))
        };
      })
    );

    return json(200, {
      user: user.email,
      tokenVar: token.name, // so we can confirm which variable was picked up
      forms: collected
    });
  } catch (err) {
    const status = err.status === 401 ? 401 : 502;
    return json(status, {
      error: status === 401
        ? 'The API token was rejected. It may have been revoked — generate a new one and update the environment variable.'
        : 'Could not reach the Netlify API.'
    });
  }
};
