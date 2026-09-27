// Workflow A · "Collect links" (Code node, Run Once for All Items)
// Find same-website links on the homepage (max 20 pages, homepage included).
const source = $('Start ingestion').first().json;
const home = new URL(source.source_url);
const html = $input.first().json.html || '';
const MAX_PAGES = 20;
const SKIP_PATH = /\/(careers|jobs|blog|news|press|legal|privacy|terms|cookies?|login|signin|sign-in|signup|cart|tag|author)(\/|$)/i;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|ico|css|js|xml|zip|mp4|mp3|docx?|xlsx?)$/i;
const sameSite = (u) => u.hostname.replace(/^www\./, '') === home.hostname.replace(/^www\./, '');
const norm = (u) => u.origin + (u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '/');

const urls = new Set([norm(home)]);
for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
  let u;
  try { u = new URL(m[1], home); } catch { continue; }
  if (!/^https?:$/.test(u.protocol) || !sameSite(u)) continue;
  if (SKIP_PATH.test(u.pathname) || SKIP_EXT.test(u.pathname)) continue;
  urls.add(norm(u));
}
return [...urls].slice(0, MAX_PAGES).map((url) => ({ json: { url } }));
