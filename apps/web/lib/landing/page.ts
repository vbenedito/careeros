/**
 * The public landing page (LAND-01..08, ADR-0009): one static HTML document with its CSS inline
 * and no JavaScript. Interactions are native checkboxes and radios styled with CSS; motion is
 * CSS only and stops under prefers-reduced-motion.
 */
import { DESCRIPTION, FAQ, RULES, SAMPLE_MONTH, SAMPLE_WEEK, STEPS, TITLE } from "./content";

export interface LandingOptions {
  /** Origin of the site, e.g. https://careeros-taupe.vercel.app (canonical, OG, JSON-LD). */
  siteUrl: string;
  /** Chrome Web Store listing (LAND-05). */
  installUrl: string;
  repositoryUrl: string;
}

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const duration = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export const LANDING_CSS = `
:root{--bg:oklch(0.17 0.005 265);--panel:oklch(0.21 0.015 265);--band:oklch(0.2 0.01 265);--raise:oklch(0.23 0.02 265);--line:oklch(0.32 0.02 265);--line2:oklch(0.36 0.02 265);--fg:oklch(0.97 0 0);--muted:oklch(0.72 0 0);--primary:oklch(0.72 0.14 265);--on-primary:oklch(0.17 0 0);--ok:oklch(0.75 0.15 150);--warn:oklch(0.8 0.14 75);--idle:oklch(0.5 0.01 265);--sel:oklch(0.32 0.06 265);color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
a{color:var(--primary)}a:hover{color:oklch(0.82 0.1 265)}
a:focus-visible,summary:focus-visible,.sr:focus-visible+.chip{outline:2px solid var(--primary);outline-offset:3px;border-radius:8px}
.wrap{max-width:1152px;margin:0 auto;padding:0 24px}
.top{border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:16px;padding-bottom:16px}
.brand{font-weight:700;font-size:18px;letter-spacing:-.02em;color:var(--fg);text-decoration:none}
.nav{display:flex;align-items:center;gap:24px;font-size:14px;flex-wrap:wrap}
.nav a{color:var(--muted);text-decoration:none}
.btn{display:inline-flex;align-items:center;min-height:48px;padding:0 22px;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none}
.btn-primary{background:var(--primary);color:var(--on-primary)}.btn-primary:hover{color:var(--on-primary);background:oklch(0.78 0.12 265)}
.btn-ghost{border:1px solid var(--line2);color:var(--fg);font-weight:500}.btn-ghost:hover{color:var(--fg);border-color:var(--primary)}
.btn-sm{min-height:44px;padding:0 16px;font-size:14px}
.split{display:flex;flex-wrap:wrap;align-items:center;gap:56px;padding-top:96px;padding-bottom:96px}
.split.rev{flex-wrap:wrap-reverse}
.copy{flex:1 1 340px;display:flex;flex-direction:column;gap:16px}
.copy p,.lede{margin:0;font-size:17px;color:var(--muted);max-width:34em}
.card{flex:1 1 480px;min-width:0;padding:28px;border-radius:16px;border:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;gap:18px}
h1{margin:0;font-size:clamp(42px,5.4vw,64px);line-height:1.02;letter-spacing:-.04em;font-weight:750}
h2{margin:0;font-size:clamp(32px,4vw,44px);line-height:1.08;letter-spacing:-.03em;font-weight:700}
h3{margin:0}
.band{background:var(--band);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.hero{padding-top:80px}
.hero .copy{gap:24px;flex-basis:420px}
.hero .lede{font-size:18px}
.ctas{display:flex;gap:12px;flex-wrap:wrap}
.small{margin:0;font-size:13px;color:var(--muted)}
.demo{flex:1 1 460px;min-width:0;border-radius:16px;border:1px solid var(--line);background:var(--panel);overflow:hidden}
.tabs{display:flex;gap:4px;padding:10px 10px 0;border-bottom:1px solid var(--line);font-size:13px;overflow:hidden}
.tabs span{padding:8px 14px;border-radius:8px 8px 0 0;white-space:nowrap;color:var(--muted)}
.demo-body{padding:24px;display:flex;flex-direction:column;gap:20px}
.status{position:relative;height:24px;font-size:15px;font-weight:600}
.status span{position:absolute;inset:0;display:flex;align-items:center;gap:8px}
.dot{width:8px;height:8px;border-radius:4px;background:var(--ok);flex:none}.dot.idle{background:var(--idle)}.dot.warn{background:var(--warn)}
.between{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.label{font-size:14px;color:var(--muted)}
.big{font-size:44px;font-weight:750;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.track{height:8px;border-radius:4px;background:oklch(0.27 0.015 265)}.track div{height:8px;border-radius:4px;width:64%;background:var(--primary)}
.record{border-radius:10px;background:var(--bg);border:1px solid var(--line);padding:14px 16px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:var(--muted)}
.record b{color:var(--fg);font-weight:400}
.problem{max-width:820px;margin:0 auto;padding:96px 24px;display:flex;flex-direction:column;gap:20px;text-align:center;align-items:center}
.problem p{margin:0;font-size:19px;color:var(--muted);max-width:36em}
.chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--line2);cursor:pointer;font-size:15px;user-select:none}
.sr{position:absolute;opacity:0;width:1px;height:1px}
.sr:checked+.chip{background:var(--sel);border-color:var(--primary)}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.rows{flex-basis:100%;display:flex;flex-direction:column;gap:8px;padding-top:8px;font-size:15px}
.row{display:flex;justify-content:space-between}
.row .on{display:none;color:var(--ok)}.row .off{color:var(--muted)}
#c-lc:checked~.rows .r-lc .on,#c-nc:checked~.rows .r-nc .on,#c-py:checked~.rows .r-py .on,#c-yt:checked~.rows .r-yt .on{display:inline}
#c-lc:checked~.rows .r-lc .off,#c-nc:checked~.rows .r-nc .off,#c-py:checked~.rows .r-py .off,#c-yt:checked~.rows .r-yt .off{display:none}
.away .paused{display:none;color:var(--warn)}#away:checked~.away .paused{display:flex}#away:checked~.away .live{display:none}
.away .live,.away .paused{align-items:center;gap:8px;font-weight:600}.away .live{display:flex}
.away{display:flex;flex-direction:column;gap:14px}
.lists{flex:1 1 480px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;align-content:start}
.list{padding:24px;border-radius:14px;border:1px solid var(--line)}
.list h3{margin-bottom:12px;font-size:16px}.list.yes h3{color:var(--ok)}.list.no h3{color:var(--warn)}
.list ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:15px}
.card p{margin:0}
.chart{display:flex;flex-direction:column;gap:16px}
.bars{align-items:flex-end;gap:12px;height:180px;display:flex}
.bars .col{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end}
.bars .col i{display:block;width:100%;border-radius:6px 6px 2px 2px;background:oklch(0.72 0.14 265 / .45)}.bars .col.top i{background:var(--primary)}
.bars .col span{font-size:12px;color:var(--muted)}
.mbars{display:none;align-items:flex-end;gap:4px;height:180px}.mbars i{display:block;flex:1 1 0;border-radius:3px 3px 1px 1px;background:oklch(0.72 0.14 265 / .6)}
.total{font-size:26px;font-weight:750;letter-spacing:-.02em}.total .m{display:none}
#v-month:checked~.chart .mbars{display:flex}#v-month:checked~.chart .bars{display:none}
#v-month:checked~.chart .total .m{display:inline}#v-month:checked~.chart .total .w{display:none}
#v-week:focus-visible~.chart label[for=v-week],#v-month:focus-visible~.chart label[for=v-month],#pause:focus-visible+.wrap label[for=pause]{outline:2px solid var(--primary);outline-offset:3px}
#v-week:checked~.chart label[for=v-week],#v-month:checked~.chart label[for=v-month]{background:var(--sel);border-color:var(--primary)}
.section{padding-top:96px;padding-bottom:96px;display:flex;flex-direction:column;gap:40px}
.pipe{position:relative}
.pipe .line{position:absolute;left:10%;right:10%;top:27px;height:2px;background:var(--line)}
.pipe .line span{position:absolute;top:-3px;width:8px;height:8px;border-radius:4px;background:var(--primary);box-shadow:0 0 12px var(--primary)}
.pipe ol{position:relative;margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}
.pipe li{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
.pipe .n{width:56px;height:56px;border-radius:28px;background:var(--raise);border:1px solid var(--line2);display:inline-flex;align-items:center;justify-content:center;font-weight:700}
.pipe h3{font-size:17px;font-weight:650}.pipe p{margin:0;font-size:14px;color:var(--muted)}
.rules{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.rules div{padding:24px;background:var(--bg);display:flex;flex-direction:column;gap:6px}
.rules dt{font-size:32px;font-weight:750;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.rules dd{margin:0;font-size:15px;color:var(--muted)}
.faq{max-width:760px;margin:0 auto;padding:0 24px 96px;display:flex;flex-direction:column;gap:16px}
.faq h2{margin-bottom:8px}
details{border-bottom:1px solid var(--line);padding-bottom:14px}
summary{cursor:pointer;font-size:17px;font-weight:600;padding:10px 0}
details p{margin:6px 0 0;font-size:15px;color:var(--muted)}
.final{padding:64px 32px;border-radius:20px;border:1px solid oklch(0.36 0.04 265);background:oklch(0.23 0.04 265);display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;margin-bottom:96px}
.foot{border-top:1px solid var(--line)}
.foot .wrap{display:flex;flex-wrap:wrap;gap:16px 24px;justify-content:space-between;font-size:14px;color:var(--muted);padding-top:24px;padding-bottom:24px}
.foot nav{display:flex;gap:24px;flex-wrap:wrap}.foot a{color:inherit}
@property --m{syntax:"<integer>";inherits:false;initial-value:0}
.clock,.tick{counter-reset:m var(--m)}.clock::after,.tick::after{content:counter(m) "m"}
@media (prefers-reduced-motion:no-preference){
.clock,.tick{animation:clock 12s linear infinite}
@keyframes clock{0%{--m:0}38%{--m:32}62%{--m:32}100%{--m:50}}
#away:checked~.away .tick{animation-play-state:paused}
.track div{animation:bar 12s linear infinite}
@keyframes bar{0%{width:0}38%{width:64%}62%{width:64%}100%{width:100%}}
.t1{animation:t1 12s step-end infinite}.t2{animation:t2 12s step-end infinite}.t3{animation:t3 12s step-end infinite}
@keyframes t1{0%{background:var(--sel);color:var(--fg)}38%{background:transparent;color:var(--muted)}}
@keyframes t2{0%{background:transparent;color:var(--muted)}38%{background:var(--sel);color:var(--fg)}62%{background:transparent;color:var(--muted)}}
@keyframes t3{0%{background:transparent;color:var(--muted)}62%{background:var(--sel);color:var(--fg)}}
.s1{animation:s1 12s step-end infinite}.s2{animation:s2 12s step-end infinite}.s3{animation:s3 12s step-end infinite}
@keyframes s1{0%{opacity:1}38%{opacity:0}}
@keyframes s2{0%{opacity:0}38%{opacity:1}62%{opacity:0}}
@keyframes s3{0%{opacity:0}62%{opacity:1}}
.rec{animation:rec 12s ease-out infinite}
@keyframes rec{0%,38%{opacity:0;transform:translateY(6px)}42%,100%{opacity:1;transform:none}}
.pipe .line span{animation:pulse 4s linear infinite}
@keyframes pulse{from{left:0}to{left:100%}}
@supports (animation-timeline:view()){.bars .col i{transform-origin:bottom;animation:grow linear both;animation-timeline:view();animation-range:entry 10% cover 40%}}
@keyframes grow{from{transform:scaleY(.05)}to{transform:scaleY(1)}}
}
#pause:checked~main *,#pause:checked~main *::after{animation-play-state:paused!important}
.pausebar{display:flex;justify-content:flex-end;padding-top:12px}.pausebar .chip{font-size:13px;min-height:36px}
@media (prefers-reduced-motion:reduce){.pausebar{display:none}}
@media (prefers-reduced-motion:reduce){.t1{background:var(--sel);color:var(--fg)}.s2,.s3{opacity:0}.clock,.tick{--m:32}}
`;

export function renderLanding({ siteUrl, installUrl, repositoryUrl }: LandingOptions): string {
  const site = new URL(siteUrl).origin;
  const max = Math.max(...SAMPLE_WEEK);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const week = SAMPLE_WEEK.map(
    (m, i) =>
      `<div class="col${m === max ? " top" : ""}"><i style="height:${Math.round((m / max) * 150)}px"></i><span>${days[i]}</span></div>`,
  ).join("");
  const mmax = Math.max(...SAMPLE_MONTH);
  const month = SAMPLE_MONTH.map(
    (m) => `<i style="height:${Math.max(2, Math.round((m / mmax) * 170))}px"></i>`,
  ).join("");
  const steps = STEPS.map(
    (s, i) => `<li><span class="n">${i + 1}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>`,
  ).join("");
  const rules = RULES.map((r) => `<div><dt>${esc(r.v)}</dt><dd>${esc(r.d)}</dd></div>`).join("");
  const faq = FAQ.map(
    (f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
  ).join("");
  const siteRow = (cls: string, name: string) =>
    `<div class="row ${cls}"><span>${name}</span><span class="on">counts</span><span class="off">ignored</span></div>`;
  const jsonLd = JSON.stringify([
    { "@context": "https://schema.org", "@type": "WebSite", name: "CareerOS", url: `${site}/` },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "CareerOS",
      url: `${site}/`,
      sameAs: [repositoryUrl],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "CareerOS",
      applicationCategory: "BrowserApplication",
      operatingSystem: "Chrome (desktop)",
      description: DESCRIPTION,
      url: `${site}/`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ]).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESCRIPTION)}">
<link rel="canonical" href="${esc(site)}/">
<meta name="theme-color" content="#16171c">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:url" content="${esc(site)}/">
<meta property="og:image" content="${esc(site)}/opengraph-image">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="CareerOS: see where your study time really goes">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd}</script>
<style>${LANDING_CSS}</style>
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="/">CareerOS</a>
<nav class="nav" aria-label="Main"><a href="#how">How it works</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a><a class="btn btn-ghost btn-sm" href="/sign-in">Sign in</a></nav>
</div></header>
<input type="checkbox" id="pause" class="sr"><div class="wrap pausebar"><label for="pause" class="chip">Pause animations</label></div>
<main>
<section class="wrap split hero">
<div class="copy">
<h1>See where your study time really goes</h1>
<p class="lede">A study time tracker for interview prep. It counts automatically on the sites you choose, like LeetCode and NeetCode, pauses when you step away, and ignores everything else.</p>
<div class="ctas"><a class="btn btn-primary" href="/sign-in">Get started — it's free</a><a class="btn btn-ghost" href="${esc(installUrl)}">Add to Chrome</a></div>
<p class="small">Sign in with Google or GitHub. Chrome on desktop.</p>
</div>
<div class="demo" role="img" aria-label="Demo: the timer counts on leetcode.com, stops on youtube.com, and resumes on neetcode.io. Only the site and the start and end times are saved.">
<div class="tabs" aria-hidden="true"><span class="t1">leetcode.com</span><span class="t2">youtube.com</span><span class="t3">neetcode.io</span></div>
<div class="demo-body" aria-hidden="true">
<div class="status"><span class="s1"><i class="dot"></i>Counting · study site</span><span class="s2"><i class="dot idle"></i>Not a study site · nothing recorded</span><span class="s3"><i class="dot"></i>Counting · study site</span></div>
<div class="between"><span class="label">Today</span><span class="big clock"></span></div>
<div class="track"><div></div></div>
<div class="record"><b>Saved when you leave a study site</b><div class="rec">{ "domain": "leetcode.com",<br>&#160;&#160;"started_at": "09:14:02", "ended_at": "09:46:10" }</div></div>
</div>
</div>
</section>

<section class="band"><div class="problem">
<h2>How many hours did you study last week?</h2>
<p>Interview prep is spread across LeetCode, NeetCode, docs and videos. Timers get forgotten, screen-time apps mix study with everything else, and a guess is all that's left. You can't plan what you can't measure.</p>
</div></section>

<section class="wrap split">
<div class="copy"><h2>Stop starting timers</h2><p>CareerOS counts only while a study site is the tab in front of you and you're active. Step away and it pauses on its own after 60 seconds, then picks up when you're back.</p></div>
<div class="card">
<input type="checkbox" id="away" class="sr"><label for="away" class="chip">Step away from the keyboard</label>
<div class="away">
<div class="live"><i class="dot"></i>Counting on leetcode.com</div>
<div class="paused"><i class="dot warn"></i>Paused: no input for 60 seconds</div>
<div class="between"><span class="label">Session</span><span class="big tick"></span></div>
</div>
<p class="small">Watching a video? A study tab playing sound keeps counting for up to 15 minutes without input.</p>
</div>
</section>

<section class="wrap split rev">
<div class="card">
<p class="label">Pick your study sites</p>
<div class="chips">
<input type="checkbox" id="c-lc" class="sr" checked><label for="c-lc" class="chip">leetcode.com</label>
<input type="checkbox" id="c-nc" class="sr" checked><label for="c-nc" class="chip">neetcode.io</label>
<input type="checkbox" id="c-py" class="sr"><label for="c-py" class="chip">docs.python.org</label>
<input type="checkbox" id="c-yt" class="sr"><label for="c-yt" class="chip">youtube.com</label>
<div class="rows">${siteRow("r-lc", "leetcode.com")}${siteRow("r-nc", "neetcode.io")}${siteRow("r-py", "docs.python.org")}${siteRow("r-yt", "youtube.com")}</div>
</div>
</div>
<div class="copy"><h2>Stop counting the scroll as study</h2><p>You decide what study means: up to 50 sites, subdomains included. Everything else is ignored, so your hours are your real study hours.</p></div>
</section>

<section id="privacy" class="band"><div class="wrap split">
<div class="copy"><h2>Don't trade your privacy for a number</h2><p>The extension reads the active tab's address only to get the site name. For your study it keeps one small record: the site and when you started and stopped. The address, the page and every other site are never stored or sent.</p><a href="/privacy">Read the privacy policy</a></div>
<div class="lists">
<div class="list yes"><h3>Stored</h3><ul><li>Sites you choose</li><li>Start and end times</li><li>A random device id</li><li>Your account: email and sign-in provider</li></ul></div>
<div class="list no"><h3>Never</h3><ul><li>Full addresses or searches</li><li>Page titles or content</li><li>Keystrokes or screenshots</li><li>Other sites, incognito</li><li>Analytics or ad trackers</li></ul></div>
</div>
</div></section>

<section class="wrap split">
<div class="copy"><h2>See the week you really had</h2><p>Your study hours per day and per platform, across every computer you use. Look back week by week or month by month and plan the next one on facts.</p></div>
<div class="card">
<input type="radio" name="view" id="v-week" class="sr" checked><input type="radio" name="view" id="v-month" class="sr">
<div class="chart">
<div class="between"><div class="chips"><label for="v-week" class="chip">Week</label><label for="v-month" class="chip">Month</label></div><span class="total"><span class="w">${duration(sum(SAMPLE_WEEK))}</span><span class="m">${duration(sum(SAMPLE_MONTH))}</span></span></div>
<div class="bars" role="img" aria-label="Sample week: ${duration(sum(SAMPLE_WEEK))} of study, most on Thursday">${week}</div>
<div class="mbars" role="img" aria-label="Sample month: ${duration(sum(SAMPLE_MONTH))} of study">${month}</div>
</div>
</div>
</section>

<section id="how" class="band"><div class="wrap section">
<h2>How the study time tracker works</h2>
<div class="pipe"><div class="line" aria-hidden="true"><span></span></div><ol>${steps}</ol></div>
</div></section>

<section class="wrap section"><h2>The rules, exactly</h2><dl class="rules">${rules}</dl></section>

<section id="faq" class="faq"><h2>Questions</h2>${faq}</section>

<section class="wrap"><div class="final">
<h2>Start measuring this week's study</h2>
<div class="ctas"><a class="btn btn-primary" href="/sign-in">Get started — it's free</a><a class="btn btn-ghost" href="${esc(installUrl)}">Add to Chrome</a></div>
</div></section>
</main>
<footer class="foot"><div class="wrap"><span>© 2026 CareerOS</span><nav aria-label="Footer"><a href="/privacy">Privacy</a><a href="${esc(repositoryUrl)}">GitHub</a><a href="/sign-in">Sign in</a></nav></div></footer>
</body>
</html>
`;
}
