// Fetch public repo facts for the profile figures: stars and every commit date.
import { writeFile } from "node:fs/promises";

// `lane` is the river's row in the header, top to bottom; old repos share lanes with new ones.
// Projects with a `line` also get a row in the list under the header, in this order.
export const PROJECTS = [
  { repo: "markvis", name: "markvis", lane: 4, line: "Charts written as text in Markdown, with a table where they can't draw.", url: "https://markvis.js.org" },
  { repo: "vert", name: "Vert", lane: 3, line: "Drop a GPX file and get your run as 3D terrain and a poster.", url: "https://vert.geekplux.com" },
  { repo: "explorable", name: "Explorable", lane: 2, line: "Turns a paper or blog post into a short essay with figures you can drag.", url: "https://explorable.geekplux.com" },
  { repo: "reasontrail", name: "Reasontrail", lane: 0, line: "Draws a coding-agent session as a map of what it tried and why.", url: "https://reasontrail.geekplux.com" },
  { repo: "repo-rivers", name: "Repo Rivers", lane: 6, line: "A repository's history as rivers of modules and contributors.", url: "https://reporivers.geekplux.com" },
  { repo: "pagelapse", name: "Pagelapse", lane: 1, line: "Scrub through ten years of a web page in the Internet Archive.", url: "https://pagelapse.geekplux.com" },
  { repo: "spec2skill", name: "spec2skill", lane: 5, line: "Turns an OpenAPI spec or MCP server into an agent skill.", url: "https://spec2skill.geekplux.com" },
  { repo: ["worldlines", "artisms", "dialectica"], name: "Three atlases", lane: 7, line: "World history, art and philosophy as bilingual Mondrian timelines.", url: "https://worldlines.geekplux.com" },
  { repo: "timeline-sankey", name: "timeline-sankey", lane: 6, line: "Time ranges drawn as a Sankey, the idea behind Repo Rivers.", url: "https://timeline-sankey.vercel.app" },
  { repo: "cv_resume", name: "cv_resume", lane: 8, line: "A one-page LaTeX resume template.", url: "https://github.com/geekplux/cv_resume" },
  { repo: "hexo-theme-typing", name: "hexo-theme-typing", lane: 1 },
  { repo: "ar-ai-vis-demo", name: "AR + AI vis demo", lane: 2 },
  { repo: "d3-force-webgl-integration-demo", name: "d3-force on WebGL", lane: 5 },
];

const headers = { accept: "application/vnd.github+json", "user-agent": "geekplux-profile" };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/geekplux/${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return { body: await res.json(), next: (res.headers.get("link") ?? "").includes('rel="next"') };
}

async function commitDates(name) {
  const dates = [];
  for (let page = 1; ; page++) {
    const { body, next } = await gh(`${name}/commits?per_page=100&page=${page}`);
    for (const c of body) dates.push(c.commit.author.date.slice(0, 10));
    if (!next) return dates;
  }
}

const out = { generatedAt: new Date().toISOString(), projects: [] };
for (const p of PROJECTS) {
  const repos = [p.repo].flat();
  let stars = 0;
  const commits = [];
  for (const r of repos) {
    stars += (await gh(r)).body.stargazers_count;
    commits.push(...(await commitDates(r)));
  }
  out.projects.push({ ...p, repo: repos[0], stars, commits: commits.sort() });
}
// The run shapes are drawn and hosted by activities.geekplux.com; leave them out until that file is live.
export const SHAPES = "https://activities.geekplux.com/profile/shapes-light.svg";
out.shapes = await fetch(SHAPES, { method: "HEAD" }).then((r) => r.ok, () => false);

await writeFile(new URL("../data/github.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(out.projects.map((p) => `${p.name}: ${p.stars} stars, ${p.commits.length} commits since ${p.commits[0]}`).join("\n"));
