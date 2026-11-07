// Builds the static site into ./dist, replacing the {HASH} placeholder with a cache-busting id.
// Usage: node scripts/build.mjs   (HASH env var or GITHUB_SHA is used, otherwise "dev")
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const hash = (process.env.HASH || process.env.GITHUB_SHA || "dev").slice(0, 7);
const textExt = /\.(html|js|json|css)$/;

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("{HASH}", join("dist", hash), { recursive: true });
cpSync("index.html", "dist/index.html");

function rewrite(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) rewrite(p);
    else if (textExt.test(name)) {
      const src = readFileSync(p, "utf8");
      if (src.includes("{HASH}")) writeFileSync(p, src.replaceAll("{HASH}", hash));
    }
  }
}
rewrite("dist");
writeFileSync("dist/.nojekyll", "");
console.log(`Built dist/ with build id "${hash}"`);
