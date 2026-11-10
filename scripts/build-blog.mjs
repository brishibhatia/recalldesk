import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { basename } from "node:path";

// Small renderer for this repository's reviewed Markdown article, not an arbitrary user-content renderer.
const source = await readFile("docs/blog-draft.md", "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const inline = (value) =>
  escape(value)
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_all, alt, path) =>
        `<img alt="${alt}" src="screenshots/${basename(path)}">`,
    )
    .replace(
      /\[([^\]]*)\]\(([^)]+)\)/g,
      (_all, text, path) =>
        `<a href="${path.startsWith("https://") ? path : new URL(path, "https://github.com/brishibhatia/recalldesk/blob/main/docs/").href}">${text}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
const lines = source.split("\n"),
  output = [];
let paragraph = [],
  code = null,
  table = false;
const flush = () => {
  if (paragraph.length) output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  paragraph = [];
};
for (const line of lines) {
  if (line.startsWith("```")) {
    flush();
    if (code) {
      output.push(`<pre tabindex="0" role="region" aria-label="Scoring formula"><code>${escape(code.join("\n"))}</code></pre>`);
      code = null;
    } else code = [];
    continue;
  }
  if (code) {
    code.push(line);
    continue;
  }
  if (line.startsWith("|")) {
    flush();
    const headingRow = !table;
    if (!table) {
      output.push(
        '<div class="table-scroll" tabindex="0" role="region" aria-label="Evaluation results"><table>',
      );
      table = true;
    }
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    const cells = line.split("|").slice(1, -1);
    output.push(
      `<tr>${cells.map((c) => headingRow ? `<th scope="col">${inline(c.trim())}</th>` : `<td>${inline(c.trim())}</td>`).join("")}</tr>`,
    );
    continue;
  }
  if (table) {
    output.push("</table></div>");
    table = false;
  }
  const heading = /^(#{1,3}) (.+)$/.exec(line);
  if (heading) {
    flush();
    const n = heading[1].length;
    output.push(`<h${n}>${inline(heading[2])}</h${n}>`);
    continue;
  }
  if (!line.trim()) {
    flush();
    continue;
  }
  paragraph.push(line);
}
flush();
await mkdir("_site/screenshots", { recursive: true });
for (const match of source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g))
  await copyFile(
    new URL(match[1], new URL("../docs/", import.meta.url)),
    `_site/screenshots/${basename(match[1])}`,
  );
await copyFile(
  "artifacts/demo/recalldesk-demo.webm",
  "_site/recalldesk-demo.webm",
);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="RecallDesk: payment-aware support, controlled product fulfillment, durable case memory and measured learning."><title>RecallDesk — remembering the fix that failed</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f8f5;color:#26372f;font:17px/1.75 system-ui,sans-serif}header,main,footer{max-width:900px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #dbe3d7}header strong{color:#216b51}main{max-width:820px}h1{font-size:clamp(30px,5vw,48px);line-height:1.2;letter-spacing:-1.5px}h2{margin-top:44px;font-size:25px}a{color:#176448;text-underline-offset:3px}a:focus-visible{outline:3px solid #216b51;outline-offset:4px}p{margin:24px 0}img{display:block;max-width:100%;height:auto;border:1px solid #dbe3d7;border-radius:12px}code,pre{font-size:14px;background:#eaf0e7;border-radius:6px}code{padding:2px 5px}pre{padding:20px;overflow:auto}table{width:100%;border-collapse:collapse;background:white}td,th{text-align:left;border-bottom:1px solid #dbe3d7;padding:12px}tr:first-child{font-weight:700}.table-scroll{overflow:auto}footer{font-size:14px;border-top:1px solid #dbe3d7}.status{background:#eef4e8;border-left:4px solid #216b51;padding:16px 20px;font-size:15px}@media(max-width:520px){body{font-size:16px}header,main,footer{padding:22px}header{flex-wrap:wrap}}
</style></head><body><header><strong>recalldesk.</strong><a href="https://github.com/brishibhatia/recalldesk">Source, setup &amp; evidence</a></header><main><p class="status">Project article · Local software and synthetic evaluation verified. Authenticated Tatum Mainnet service/account reads passed; actual payment verification, Walrus storage/recall and validated live-model inference remain pending. This static article is not the deployed support app.</p><section aria-label="Recorded demonstration"><h2>Watch the working sample</h2><video controls preload="metadata" style="width:100%;border-radius:12px" src="recalldesk-demo.webm"></video><p>8 November recording · 2:40 silent walkthrough. Synthetic scenarios and simulated providers; real product entitlement and database changes.</p></section>${output.join("\n")}</main><footer>Article source revised 10 November 2026 · Public source visibility and reuse rights are separate; see the repository notice.</footer></body></html>`;
await writeFile("_site/index.html", html);
await writeFile("_site/.nojekyll", "");
console.log(
  "Article preview packaged in _site; this command does not publish it or deploy the support backend.",
);
