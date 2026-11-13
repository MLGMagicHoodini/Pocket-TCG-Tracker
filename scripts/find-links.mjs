// Lists cards of one set that have the same name + rarity + type in other sets: candidates for links.json.
// A "link" means: the same card printed in two sets (different numbers). The app then treats owning one as owning both.
// Reprints with DIFFERENT art are different cards in-game, so review the list before adding anything.
//
// Usage: node scripts/find-links.mjs B4b
import { readFileSync } from "node:fs";

const D = "{HASH}";
const target = process.argv[2];
if (!target) { console.error("Usage: node scripts/find-links.mjs <set id, e.g. B4b>"); process.exit(1); }

const expansions = JSON.parse(readFileSync(`${D}/expansions.json`, "utf8"));
let links = [];
try { links = JSON.parse(readFileSync(`${D}/links.json`, "utf8")); } catch {}
const linked = new Set(links.flat());

const all = expansions.flatMap((e) => JSON.parse(readFileSync(e.location, "utf8")).cards.map((c) => ({ ...c, set: e.id })));
const key = (c) => `${c.name}|${c.rarity}|${c.type}`;
const index = new Map();
for (const c of all) if (c.set !== target) (index.get(key(c)) ?? index.set(key(c), []).get(key(c))).push(c);

let found = 0;
for (const c of all.filter((x) => x.set === target)) {
  const matches = index.get(key(c)) ?? [];
  if (!matches.length || linked.has(c.id)) continue;
  found++;
  console.log(`${c.id} ${c.name} (${c.rarity}, ${c.type})  ~  ${matches.map((m) => m.id).join(", ")}`);
  console.log(`    ${JSON.stringify([matches[0].id, c.id])}`);
}
console.log(`\n${found} candidate(s). Copy the lines you confirm into ${D}/links.json (inside the outer [ ]).`);
