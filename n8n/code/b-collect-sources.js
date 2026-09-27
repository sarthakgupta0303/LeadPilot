// Workflow B · "Collect sources" (Code node, Run Once for All Items)
// Pull out which KB sources the agent actually looked at, for citations and the messages table.
const out = $input.first().json;
const sources = new Set();
for (const step of out.intermediateSteps || []) {
  const text = (typeof step.observation === 'string' ? step.observation : JSON.stringify(step.observation || ''))
    .replace(/\\"/g, '"');
  for (const m of text.matchAll(/"page_url"\s*:\s*"([^"]+)"/g)) sources.add(m[1]);
  for (const m of text.matchAll(/"source_name"\s*:\s*"([^"]+)"/g)) sources.add(m[1]);
}
return [{ json: { reply: out.output, sources: [...sources], flag: null } }];
