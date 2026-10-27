// Render the profile figures from data/github.json: the river header and one row per project,
// each in a light and a dark file, then README.md.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("data/github.json", root), "utf8"));
const font = async (f) => (await readFile(new URL(`fonts/garamond-${f}.woff2`, root))).toString("base64");
const FONTS = { 400: await font("400"), 500: await font("500") };

// Radix Colors: sand for ink, lines and rivers; blue only for markvis, which is also labelled.
const THEMES = {
  light: { ink: "#21201c", muted: "#63635e", line: "#cfceca", river: "#8d8d86", spine: "#0d74ce", spineText: "#0d74ce" },
  dark: { ink: "#eeeeec", muted: "#b5b3ad", line: "#3b3a37", river: "#7c7b74", spine: "#0090ff", spineText: "#70b8ff" },
};
const W = 840;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const num = (n) => n.toLocaleString("en-US");

// Four type sizes in all: 40 name, 20 lead and project names, 14 body, 12 axis and notes.
function svg(t, h, label, body, css = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<style>@font-face{font-family:G;font-weight:400;src:url(data:font/woff2;base64,${FONTS[400]}) format("woff2")}@font-face{font-family:G;font-weight:500;src:url(data:font/woff2;base64,${FONTS[500]}) format("woff2")}
text{font-family:G,"EB Garamond",Garamond,Georgia,serif;fill:${t.ink};font-kerning:normal;font-variant-numeric:oldstyle-nums proportional-nums}
.xl{font-size:40px;font-weight:500}.l{font-size:20px}.b{font-weight:500}.s{font-size:14px}.xs{font-size:12px}.m{fill:${t.muted}}
${css}</style>
${body}
</svg>
`;
}

// Time runs on two scales: years up to the lens, then the last two months enlarged.
const DAY = 864e5;
const T = (s) => Date.parse(s + "T00:00:00Z");
const now = new Date(data.generatedAt);
const NOW = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
const LENS = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
const firstYear = Number(data.projects.flatMap((p) => p.commits).sort()[0].slice(0, 4));
const START = Date.UTC(firstYear, 0, 1);

// Bins: quarters before the lens, weeks inside it; widths use commits per week in both.
const bins = [];
for (let a = START; a < LENS; ) {
  const d = new Date(a);
  const b = Math.min(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1), LENS);
  bins.push({ a, b });
  a = b;
}
for (let a = LENS; a < NOW; a += 7 * DAY) bins.push({ a, b: Math.min(a + 7 * DAY, NOW) });

const XB = 360, XL = 404, X1 = W - 104;
const x = (t) => (t < LENS ? ((t - START) / (LENS - START)) * XB : XL + ((t - LENS) / (NOW - LENS)) * (X1 - XL));
const TOP = 132, LANE = 34;
const lanes = Math.max(...data.projects.map((p) => p.lane)) + 1;
const laneY = (l) => TOP + 26 + l * LANE;
const AXIS = laneY(lanes - 1) + 20;
const K = 3.4, MIN = 1.2;
const width = (rate) => (rate > 0 ? Math.max(MIN, K * Math.log2(1 + rate)) : 0);

// Catmull-Rom through the points, as cubic Béziers, so the rivers bend instead of stepping.
function curve(pts) {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const streams = data.projects.map((p) => {
  const ds = p.commits.map(T);
  const rate = bins.map(({ a, b }) => (ds.filter((t) => t >= a && t < b).length / (b - a)) * 7 * DAY);
  return { ...p, rate, t0: ds[0], t1: ds.at(-1), y: laneY(p.lane) };
});

// Each river is one closed shape per side of the lens, tapering to a point where commits stop.
function bands(s) {
  const sides = [[], []];
  rate: for (const [i, { a, b }] of bins.entries()) {
    const near = s.rate[i] > 0 || s.rate[i - 1] > 0 || s.rate[i + 1] > 0;
    if (!near) continue rate;
    sides[a < LENS ? 0 : 1].push([x((a + b) / 2), width(s.rate[i]) / 2]);
  }
  return sides
    .filter((pts) => pts.some(([, h]) => h > 0))
    .map((pts) => {
      if (pts[0][1] > 0) pts.unshift([pts[0][0] - 6, 0]);
      if (pts.at(-1)[1] > 0) pts.push([pts.at(-1)[0] + 6, 0]);
      const top = pts.map(([px, h]) => [px, s.y - h]);
      const bottom = pts.map(([px, h]) => [px, s.y + h]).reverse();
      return curve(top) + "L" + curve(bottom).slice(1) + "Z";
    });
}

function header(t) {
  const colour = (s) => (s.repo === "markvis" ? t.spine : t.river);
  // A hairline for each repo's whole life, dashed where it crosses the gap into the lens.
  const life = streams
    .map((s) => {
      const line = (a, b, dash = "") => `<line x1="${a.toFixed(1)}" x2="${b.toFixed(1)}" y1="${s.y}" y2="${s.y}" stroke="${colour(s)}" stroke-width="1"${dash}/>`;
      const parts = [];
      if (s.t0 < LENS) parts.push(line(x(s.t0), x(Math.min(s.t1, LENS - 1))));
      if (s.t0 < LENS && s.t1 >= LENS) parts.push(line(XB, XL, ' stroke-dasharray="2 3"'));
      if (s.t1 >= LENS) parts.push(line(x(Math.max(s.t0, LENS)), x(s.t1)));
      return parts.join("");
    })
    .join("");
  const rivers = streams.map((s) => bands(s).map((d) => `<path d="${d}" fill="${colour(s)}"/>`).join("")).join("");
  const labels = streams
    .map((s) => {
      const fill = s.repo === "markvis" ? ` style="fill:${t.spineText}"` : "";
      return s.t1 >= LENS
        ? `<text class="s" x="${X1 + 10}" y="${s.y + 4.5}"${fill}>${esc(s.name)}</text>`
        : `<text class="s" x="${x(s.t0).toFixed(1)}" y="${s.y - 9}"${fill}>${esc(s.name)}</text>`;
    })
    .join("");
  const ticks = [];
  for (let y = firstYear + 1; Date.UTC(y, 0, 1) < LENS; y += 3) ticks.push([Date.UTC(y, 0, 1), y]);
  for (let m = new Date(LENS); m.getTime() < NOW; m.setUTCMonth(m.getUTCMonth() + 1)) {
    ticks.push([m.getTime(), m.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })]);
  }
  const axis = ticks.map(([tm, l]) => `<text class="xs m" x="${x(tm).toFixed(1)}" y="${AXIS + 18}">${l}</text>`).join("");
  const H = AXIS + 50;
  const spans = streams.filter((s) => s.t1 >= LENS && s.t0 >= LENS).length;
  const body = `
<text class="xl" x="-1" y="40">Sean G.</text>
<text class="l m" x="0" y="74">I make data legible: charts, maps, essays you can drag,</text>
<text class="l m" x="0" y="100">and lately tools that let coding agents show their work.</text>
<g clip-path="url(#reveal)">${life}${rivers}</g>
<line x1="${XB + 22}" x2="${XB + 22}" y1="${TOP}" y2="${AXIS}" stroke="${t.line}" stroke-width=".5"/>
<line x1="0" x2="${X1}" y1="${AXIS + 0.25}" y2="${AXIS + 0.25}" stroke="${t.line}" stroke-width=".5"/>
<g class="lab">${labels}</g>
${axis}
<text class="xs m" x="${XL}" y="${TOP - 4}">The last two months, enlarged</text>
<text class="xs m" x="0" y="${H - 6}">Each river is a public repository. Its width is commits per week, on a log scale.</text>
<defs><clipPath id="reveal"><rect width="${W}" height="${H}"/></clipPath></defs>`;
  const label = `Sean G. I make data legible: charts, maps, essays you can drag, and lately tools that let coding agents show their work. A chart of his public repositories since ${firstYear} as rivers: markvis runs from 2017 to now, and in the last two months ${spans} new projects begin.`;
  return svg(t, H, label, body,
    `#reveal rect{animation:grow 2.4s cubic-bezier(.16,1,.3,1) .2s both}@keyframes grow{from{transform:scaleX(0)}}
.lab{animation:in .25s ease-out 2.2s both}@keyframes in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){#reveal rect,.lab{animation:none}}`);
}

// One row per project: name and what it does on the left; stars, or its address, on the right.
function row(t, p, last) {
  const right = p.stars >= 10 ? `<text class="s" x="${W}" y="27" text-anchor="end">${num(p.stars)} stars</text>` : `<text class="s m" x="${W}" y="27" text-anchor="end">${esc(new URL(p.url).host)}</text>`;
  const body = `
<text class="l b" x="0" y="28">${esc(p.name)}</text>
<text class="s m" x="0" y="50">${esc(p.line)}</text>
${right}
${last ? "" : `<line x1="0" x2="${W}" y1="67.75" y2="67.75" stroke="${t.line}" stroke-width=".5"/>`}`;
  const extra = p.stars >= 10 ? `, ${num(p.stars)} stars` : "";
  return svg(t, 68, `${p.name}: ${p.line}${extra}`, body);
}

const listed = data.projects.filter((p) => p.line);

// README.md: each figure in a <picture>, so GitHub picks the light or dark file, linked to its project.
function readme() {
  const pic = (name, alt, href, base = "assets") =>
    `<a href="${href}"><picture><source media="(prefers-color-scheme: dark)" srcset="${base}/${name}-dark.svg"><img src="${base}/${name}-light.svg" width="${W}" alt="${esc(alt)}"></picture></a>`;
  const lines = [pic("header", "Sean G. I make data legible. A chart of his public repositories as rivers over time.", "https://geekplux.com"), "", "<br>", ""];
  for (const p of listed) lines.push(pic(p.repo, `${p.name}: ${p.line}`, p.url));
  lines.push("", "<br>", "");
  if (data.shapes) {
    lines.push(pic("shapes", "Every run and hike since 2020, each route drawn as its own small shape.", "https://activities.geekplux.com", "https://activities.geekplux.com/profile"), "");
  }
  lines.push(
    "Off the keyboard: bouldering (up to V9), tennis (I can rally; I can't serve yet), ukulele, and a ten-hole harmonica.",
    "",
    "[geekplux.com](https://geekplux.com) &ensp; [X](https://x.com/geekplux) &ensp; [ping@geekplux.com](mailto:ping@geekplux.com)",
    "",
  );
  return lines.join("\n");
}

const dir = new URL("assets/", root);
await mkdir(dir, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  await writeFile(new URL(`header-${name}.svg`, dir), header(t));
  for (const [i, p] of listed.entries()) await writeFile(new URL(`${p.repo}-${name}.svg`, dir), row(t, p, i === listed.length - 1));
}
await writeFile(new URL("README.md", root), readme());
console.log(`rendered the header and ${listed.length} rows, light and dark`);
