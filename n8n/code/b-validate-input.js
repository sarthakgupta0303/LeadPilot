// Workflow B · "Validate input" (Code node, Run Once for All Items)
// Reject bad or oversized requests before spending any AI money.
const b = $input.first().json.body || {};
const message = String(b.message || '').trim();
const session_id = String(b.session_id || '').trim();
const company_id = String(b.company_id || '').trim();
let error = null;
if (!/^[0-9a-f-]{36}$/i.test(company_id)) error = 'Missing or invalid company_id';
else if (!/^[\w-]{8,64}$/.test(session_id)) error = 'Missing or invalid session_id';
else if (!message) error = 'Empty message';
else if (message.length > 1000) error = 'Message too long (max 1000 characters)';
return [{ json: { ok: !error, error, message, session_id, company_id,
  campaign_source: b.campaign_source ? String(b.campaign_source).slice(0, 100) : '' } }];
