#!/usr/bin/env node
// SEO/GEO implementation verification net for the agent-andon static site.
//
// Verifies IMPLEMENTATION CORRECTNESS of the SEO surface — NOT rankings/traffic
// (those are lagging/external/non-deterministic and measured separately). These
// are the silent failures that quietly cost citations: malformed JSON-LD, a
// robots.txt that blocks GPTBot, a canonical that points nowhere, an og:image 404.
//
// Usage:
//   node seo-verify.mjs <site-dir>        # check a real site dir, exit 1 on any fail
//   node seo-verify.mjs --selftest        # prove the net can FAIL (neg fixtures) and
//                                          # PASS (positive control) — no repo needed
//
// Zero dependencies (Node stdlib only), to honour the repo's runtime-deps:0 ethos.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended"];
const CANONICAL = "https://agentandon.com/";

// ── site model: a flat map of served paths → contents, + the set of files that exist ──
function modelFromDir(dir) {
  const files = new Set();
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else files.add("/" + relative(dir, p).split("\\").join("/"));
    }
  })(dir);
  const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : null);
  return {
    index: read("index.html"),
    robots: read("robots.txt"),
    sitemap: read("sitemap.xml"),
    llms: read("llms.txt"),
    has: (servedPath) => files.has(servedPath.startsWith("/") ? servedPath : "/" + servedPath),
  };
}

// resolve an og/twitter image content value to a served path for existence check
function imgPath(v) {
  if (!v) return null;
  try { return new URL(v).pathname; } catch { return v.startsWith("/") ? v : "/" + v; }
}
const metaContent = (html, prop) => {
  // match <meta property="og:x" content="..."> or name="twitter:x", attr order-agnostic
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html?.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
};

// ── checks: each returns {name, pass, detail} ──
function checks(m) {
  const out = [];
  const add = (name, pass, detail = "") => out.push({ name, pass, detail });
  const html = m.index || "";

  // C1 canonical
  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  const canonHref = canon?.match(/href=["']([^"']+)["']/i)?.[1];
  add("canonical", canonHref === CANONICAL, canonHref ? `href=${canonHref}` : "missing <link rel=canonical>");

  // C2 Open Graph + image exists
  const ogImg = metaContent(html, "og:image");
  const ogOk = ["og:title", "og:description", "og:type", "og:url"].every((p) => metaContent(html, p)) && !!ogImg;
  const ogImgExists = ogImg ? m.has(imgPath(ogImg)) : false;
  add("og:tags", ogOk, ogOk ? "" : "missing one of og:title/description/type/url/image");
  add("og:image-exists", ogImgExists, ogImg ? `${ogImg} → ${m.has(imgPath(ogImg)) ? "present" : "404"}` : "no og:image");

  // C3 Twitter card + image exists
  const tw = metaContent(html, "twitter:card");
  const twImg = metaContent(html, "twitter:image");
  add("twitter:card", tw === "summary_large_image", tw ? `card=${tw}` : "missing twitter:card");
  add("twitter:image-exists", !!twImg && m.has(imgPath(twImg)), twImg ? `${twImg}` : "missing twitter:image");

  // C4 JSON-LD: parses, has SoftwareApplication + FAQPage
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1]);
  let nodes = [];
  let parseOk = blocks.length > 0;
  for (const b of blocks) {
    try { const j = JSON.parse(b); nodes.push(...(j["@graph"] ? j["@graph"] : [j])); }
    catch { parseOk = false; }
  }
  const types = new Set(nodes.map((n) => n && n["@type"]));
  const app = nodes.find((n) => n && n["@type"] === "SoftwareApplication");
  const appOk = !!app && !!app.name && !!app.applicationCategory && !!app.offers;
  const faq = nodes.find((n) => n && n["@type"] === "FAQPage");
  const faqOk = !!faq && Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 1 &&
    faq.mainEntity.every((q) => q["@type"] === "Question" && q.acceptedAnswer);
  add("jsonld-parses", parseOk && blocks.length > 0, blocks.length ? (parseOk ? `${blocks.length} block(s)` : "JSON parse error") : "no ld+json");
  add("jsonld-SoftwareApplication", appOk, appOk ? "" : "need name+applicationCategory+offers");
  add("jsonld-FAQPage", faqOk, faqOk ? `${faq.mainEntity.length} Q` : "need FAQPage w/ ≥1 Question+answer");

  // C5 robots.txt — AI bots NOT disallowed from /, sitemap referenced
  const robots = m.robots;
  if (!robots) add("robots-allows-ai", false, "no robots.txt");
  else {
    const groups = parseRobots(robots);
    const blocked = AI_BOTS.filter((ua) => robotBlocksRoot(groups, ua));
    add("robots-allows-ai", blocked.length === 0, blocked.length ? `BLOCKS: ${blocked.join(", ")}` : `${AI_BOTS.length} AI UAs allowed`);
    add("robots-has-sitemap", /^\s*sitemap:\s*\S+/im.test(robots), "Sitemap: directive");
  }

  // C6 sitemap.xml — well-formed-ish, lists homepage
  const sm = m.sitemap;
  add("sitemap-valid", !!sm && /<urlset[\s>]/i.test(sm) && /<loc>\s*\S+\s*<\/loc>/i.test(sm), sm ? "" : "no sitemap.xml");
  add("sitemap-has-home", !!sm && new RegExp(`<loc>\\s*${CANONICAL}\\s*</loc>`, "i").test(sm), "homepage <loc>");

  // C7 llms.txt — H1 + at least one link
  const llms = m.llms;
  const firstLine = llms?.split(/\r?\n/).find((l) => l.trim().length);
  add("llms-format", !!llms && /^#\s+\S/.test(firstLine || "") && /\]\(https?:\/\//.test(llms), llms ? "" : "no llms.txt");

  // C8 fonts self-hosted — no external font CDN, @font-face files exist.
  // NOTE: scans @font-face declared INLINE in index.html — this site is single-file
  // (inline <style>). If fonts ever move to an external stylesheet, extend this to
  // follow local <link rel=stylesheet> targets too, or it will false-red.
  const usesGoogle = /fonts\.(googleapis|gstatic)\.com/i.test(html);
  const faces = [...html.matchAll(/@font-face\s*{[^}]*}/gi)].map((x) => x[0]);
  const srcUrls = faces.flatMap((f) => [...f.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((x) => x[1]));
  const localUrls = srcUrls.filter((u) => !/^https?:/i.test(u) && !u.startsWith("data:"));
  const facesExist = localUrls.length > 0 && localUrls.every((u) => m.has(imgPath(u)));
  add("fonts-self-hosted", !usesGoogle && facesExist,
    usesGoogle ? "still links fonts.googleapis/gstatic" : (facesExist ? `${localUrls.length} local font file(s)` : "no @font-face → local file"));

  // C9 <html lang>
  add("html-lang", /<html[^>]+lang=["'][a-z-]+["']/i.test(html), "html lang attr");

  return out;
}

function parseRobots(txt) {
  const groups = [];
  let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) { cur = null; continue; }
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, field, val] = m;
    if (/^user-agent$/i.test(field)) {
      // A User-agent after rules have accrued starts a NEW record (RFC 9309);
      // consecutive User-agents with no rules between them share one record.
      // (Blank-line separators are optional in the wild — don't rely on them.)
      if (!cur || cur.rules.length > 0) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.trim());
    } else if (cur) {
      cur.rules.push({ field: field.toLowerCase(), val: val.trim() });
    }
  }
  return groups;
}
// does the group applicable to `ua` Disallow the site root?
function robotBlocksRoot(groups, ua) {
  const applicable = groups.filter((g) => g.agents.some((a) => a === "*" || a.toLowerCase() === ua.toLowerCase()));
  // specific UA group wins over *; if a specific group exists, only consider it
  const specific = applicable.filter((g) => g.agents.some((a) => a.toLowerCase() === ua.toLowerCase()));
  const eff = specific.length ? specific : applicable;
  return eff.some((g) => g.rules.some((r) => r.field === "disallow" && r.val === "/"));
}

// ── report ──
function report(title, results) {
  console.log(`\n${title}`);
  let fails = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    if (!r.pass) fails++;
  }
  console.log(`  ${fails ? "✗ " + fails + " FAIL" : "✓ all pass"} (${results.length} checks)`);
  return fails;
}

// ── self-test: positive control + one-property-broken negatives ──
const GOOD = (() => {
  const files = new Set(["/index.html", "/social-card.png", "/robots.txt", "/sitemap.xml", "/llms.txt", "/fonts/plex.woff2"]);
  const index = `<!doctype html><html lang="en"><head>
<link rel="canonical" href="${CANONICAL}">
<meta property="og:title" content="Agent Andon">
<meta property="og:description" content="status board">
<meta property="og:type" content="website">
<meta property="og:url" content="${CANONICAL}">
<meta property="og:image" content="${CANONICAL}social-card.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${CANONICAL}social-card.png">
<style>@font-face{font-family:Plex;src:url(/fonts/plex.woff2) format("woff2")}</style>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Agent Andon", applicationCategory: "DeveloperApplication", offers: { "@type": "Offer", price: "0" } })}</script>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A" } }] })}</script>
</head><body></body></html>`;
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${CANONICAL}sitemap.xml\n`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${CANONICAL}</loc></url></urlset>`;
  const llms = `# Agent Andon\n\n> status board for AI coding agents.\n\n## Docs\n- [README](https://github.com/tianshanghong/agent-andon)\n`;
  return { index, robots, sitemap, llms, has: (p) => files.has(p.startsWith("/") ? p : "/" + p) };
})();

function mutate(base, fn) {
  const m = { ...base };
  fn(m);
  return m;
}
function selftest() {
  let bad = 0;
  // positive control: the good site must pass ALL
  const goodFails = report("POSITIVE CONTROL (good site — must pass all):", checks(GOOD));
  if (goodFails) { console.log("  ✗✗ positive control FAILED — net has a false-negative"); bad++; }

  // positive control 2 — regression guard for the robots-record parser: groups with
  // NO blank-line separators (legal per RFC 9309), default Disallow:/ but every AI bot
  // carved out into its own Allow:/ group. The parser must keep those groups separate;
  // if it merges them, the AI bots inherit Disallow:/ and robots-allows-ai false-reds.
  const noBlankRobots = `User-agent: *\nDisallow: /\n` +
    AI_BOTS.map((ua) => `User-agent: ${ua}`).join("\n") +
    `\nAllow: /\n\nSitemap: ${CANONICAL}sitemap.xml`;
  const good2Fails = report("POSITIVE CONTROL 2 (robots groups w/o blank lines — must pass all):", checks({ ...GOOD, robots: noBlankRobots }));
  if (good2Fails) { console.log("  ✗✗ positive control 2 FAILED — robots parser merges adjacent records"); bad++; }

  // negatives: each breaks exactly one property; the targeted check MUST flip to fail
  const negs = [
    ["bad: robots blocks GPTBot", (m) => { m.robots = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${CANONICAL}sitemap.xml`; }, "robots-allows-ai"],
    ["bad: malformed JSON-LD", (m) => { m.index = m.index.replace(/("@type":"SoftwareApplication")/, '$1,,'); }, "jsonld-parses"],
    ["bad: og:image 404", (m) => { m.index = m.index.replace("social-card.png", "missing-card.png"); }, "og:image-exists"],
    ["bad: fonts via Google CDN", (m) => { m.index = m.index.replace("<head>", '<head>\n<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">'); }, "fonts-self-hosted"],
    ["bad: canonical removed", (m) => { m.index = m.index.replace(/<link rel="canonical"[^>]*>/, ""); }, "canonical"],
    ["bad: FAQPage dropped", (m) => { m.index = m.index.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"FAQPage[\s\S]*?<\/script>/, ""); }, "jsonld-FAQPage"],
    ["bad: sitemap missing home", (m) => { m.sitemap = m.sitemap.replace(`<loc>${CANONICAL}</loc>`, "<loc>https://agentandon.com/other</loc>"); }, "sitemap-has-home"],
  ];
  for (const [label, fn, target] of negs) {
    const res = checks(mutate(GOOD, fn));
    const t = res.find((r) => r.name === target);
    const otherFails = res.filter((r) => !r.pass && r.name !== target).map((r) => r.name);
    const ok = t && !t.pass;
    console.log(`\n${label}: target '${target}' → ${ok ? "✓ correctly FAILS" : "✗✗ did NOT fail (THEATER)"}` +
      (otherFails.length ? `  [also: ${otherFails.join(",")}]` : ""));
    if (!ok) bad++;
  }
  console.log(`\n${bad ? "✗ SELFTEST FAILED (" + bad + ")" : "✓ SELFTEST OK — every check can fail and the good control passes"}`);
  return bad ? 1 : 0;
}

// ── main ──
const arg = process.argv[2];
if (arg === "--selftest") process.exit(selftest());
else if (arg) {
  const fails = report(`SITE: ${arg}`, checks(modelFromDir(arg)));
  process.exit(fails ? 1 : 0);
} else {
  console.error("usage: seo-verify.mjs <site-dir> | --selftest");
  process.exit(2);
}
