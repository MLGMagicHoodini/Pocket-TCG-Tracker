// Sanity-checks the data files. Exits non-zero on errors so CI fails before a bad deploy.
import { readFileSync } from "node:fs";
const D = "{HASH}";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const expansions = read(`${D}/expansions.json`);
const errors = [], warnings = [];
const allIds = new Set();
const pending = []; // mission refs checked after every set is loaded (missions may reference other sets)
const RARITY = ["♢","♢♢","♢♢♢","♢♢♢♢","☆","☆☆","☆☆☆","♛","☼","☼☼","-"];

for (const meta of expansions) {
  const file = meta.location;
  let data;
  try { data = read(file); } catch (e) { errors.push(`${meta.name}: cannot read ${file}`); continue; }
  const ids = new Set();
  const packNames = new Set(data.packs.map(p => p.name));
  for (const c of data.cards) {
    if (ids.has(c.id)) errors.push(`${meta.name}: duplicate card ${c.id}`);
    ids.add(c.id); allIds.add(c.id);
    if (!c.id.startsWith(meta.id + " ")) warnings.push(`${meta.name}: ${c.id} does not start with "${meta.id} "`);
    if (!RARITY.includes(c.rarity)) errors.push(`${meta.name}: ${c.id} unknown rarity ${JSON.stringify(c.rarity)}`);
    if (c.pack !== "All" && !packNames.has(c.pack)) warnings.push(`${meta.name}: ${c.id} pack "${c.pack}" not in packs list`);
  }
  for (const m of data.missions) {
    if (!Array.isArray(m.requirements)) { warnings.push(`${meta.name}: empty/invalid mission entry ${JSON.stringify(m)} (ignored by the app)`); continue; }
    for (const r of m.requirements) for (const id of r.ids)
    pending.push({ meta, ids, m, r, id });
  }
}
for (const { meta, ids, m, r, id } of pending) {
  if (!allIds.has(id)) errors.push(`${meta.name}: mission "${m.name}" / "${r.display}" references unknown card ${id}`);
  else if (!ids.has(id)) warnings.push(`${meta.name}: mission "${m.name}" uses card ${id} from another set (craft cost shows "Not Craftable")`);
}
for (const m of read(`${D}/global.json`).missions) for (const r of m.requirements) for (const id of r.ids)
  if (!allIds.has(id)) warnings.push(`global: "${m.name}" / "${r.display}" references unknown card ${id}`);

warnings.forEach(w => console.warn("warn:", w));
errors.forEach(e => console.error("ERROR:", e));
console.log(`${expansions.length} expansions, ${allIds.size} cards, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
