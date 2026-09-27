// Workflow A · "Clean text" (Code node, Run Once for All Items)
// Turn each page's HTML into clean readable text. Skips pages that failed or are near-empty.
const links = $('Collect links').all();
const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&[a-z]+;|&#\d+;/gi, ' ');

const pages = [];
$input.all().forEach((item, i) => {
  const html = item.json.html;
  if (typeof html !== 'string' || !html) return;                 // page failed to load
  const title = decode(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim());
  const text = decode(html
      .replace(/<(script|style|noscript|svg|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  if (text.length < 200) return;                                 // skip near-empty pages
  pages.push({ json: { page_url: links[i] ? links[i].json.url : '', title, text } });
});
if (!pages.length) {
  throw new Error('No readable text found on the website (it may need JavaScript to render).');
}
return pages;
