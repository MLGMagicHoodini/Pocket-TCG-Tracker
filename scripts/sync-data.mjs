// Pulls card data from the open-source dataset https://github.com/flibustier/pokemon-tcg-pocket-database (MIT)
// and merges it into {HASH}/expansions/*.json + expansions.json.
//
//  * New sets are created automatically (cards, pack names, standard count).
//  * Existing sets only get cards that are missing; hand-written fields (missions, pack pull rates,
//    card tags, anything already present) are NEVER overwritten.
//
// Usage:  node scripts/sync-data.mjs                 (downloads from the jsDelivr CDN)
//         node scripts/sync-data.mjs --from ./dir    (reads cards.extra.json + sets.json from a local dir)
//         node scripts/sync-data.mjs --dry           (print what would change, write nothing)
import { readFileSync, writeFileSync } from "node:fs";

const D = "{HASH}";
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const fromDir = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const CDN = "https://cdn.jsdelivr.net/npm/pokemon-tcg-pocket-database@latest/dist/";

async function load(name) {
  if (fromDir) return JSON.parse(readFileSync(`${fromDir}/${name}`, "utf8"));
  const res = await fetch(CDN + name);
  if (!res.ok) throw new Error(`Failed to download ${CDN + name}: HTTP ${res.status}`);
  return res.json();
}

/** Converts the dataset's rarity label to the symbols used by this app. Returns null if unknown. */
function mapRarity(label) {
  const s = String(label ?? "").trim();
  if (/crown|♛/i.test(s)) return "♛";
  const count = (re) => (s.match(re) || []).length;
  const diamonds = count(/[◊♢◇]/g), stars = count(/[☆★]/g), shiny = count(/[✵☼]/g);
  if (diamonds && diamonds <= 4 && !stars && !shiny) return "♢".repeat(diamonds);
  if (stars && stars <= 3 && !diamonds && !shiny) return "☆".repeat(stars);
  if (shiny && shiny <= 2) return "☼".repeat(shiny);
  return null;
}

const TYPES = { grass: "Grass", fire: "Fire", water: "Water", lightning: "Lightning", electric: "Lightning",
  psychic: "Psychic", fighting: "Fighting", darkness: "Darkness", dark: "Darkness", metal: "Metal",
  steel: "Metal", dragon: "Dragon", colorless: "Colorless", fairy: "Fairy", item: "Item",
  supporter: "Supporter", tool: "Pokémon Tool", "pokémon tool": "Pokémon Tool", "pokemon tool": "Pokémon Tool" };
const mapType = (c) => TYPES[String(c.element ?? c.type ?? "").toLowerCase()] ?? "Colorless";

const cards = await load("cards.extra.json").catch(() => load("cards.json"));
const sets = await load("sets.json");
const setList = Array.isArray(sets) ? sets : Object.values(sets).flat(); // may be grouped by series
const expansions = JSON.parse(readFileSync(`${D}/expansions.json`, "utf8"));

const problems = [];
let added = 0, createdSets = 0;

for (const set of setList) {
  const code = set.code ?? set.id;
  const setCards = cards.filter((c) => c.set === code);
  if (!setCards.length) continue;

  const packNames = (set.packs ?? []).map((p) => (typeof p === "string" ? p : p.name?.en ?? p.name));
  let meta = expansions.find((e) => e.id === code);
  const file = meta ? meta.location.replace("{HASH}", D) : `${D}/expansions/${code.toLowerCase()}.json`;
  let data;
  if (meta) data = JSON.parse(readFileSync(file, "utf8"));
  else {
    createdSets++;
    const name = typeof set.name === "string" ? set.name : set.name?.en ?? code;
    meta = { name, id: code, location: `{HASH}/expansions/${code.toLowerCase()}.json`, standard: set.count ?? setCards.length };
    expansions.push(meta);
    data = { missions: [], packs: packNames.map((name) => ({ name, rarities: {} })), cards: [] };
    console.log(`+ new set ${code} "${name}" (${setCards.length} cards, packs: ${packNames.join(", ") || "none"})`);
  }

  const have = new Set(data.cards.map((c) => c.id));
  for (const c of setCards) {
    const id = `${code} ${String(c.number).padStart(3, "0")}`;
    if (have.has(id)) continue;
    const rarity = mapRarity(c.rarity);
    if (!rarity) { problems.push(`${id} ${c.name}: unknown rarity ${JSON.stringify(c.rarity)}`); continue; }
    const inPacks = c.packs ?? [];
    let pack = "All";
    if (inPacks.length === 1 && packNames.length > 1) pack = inPacks[0];
    else if (inPacks.length > 1 && inPacks.length < packNames.length) {
      pack = inPacks[0];
      problems.push(`${id} ${c.name}: in packs [${inPacks}] but only one can be stored; used "${pack}"`);
    }
    data.cards.push({ id, name: c.name, pack, rarity, tags: /\bex\b/i.test(c.name) ? ["EX"] : [], type: mapType(c) });
    added++;
  }
  data.cards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (!dry) writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
if (!dry) writeFileSync(`${D}/expansions.json`, "[\n" + expansions.map((e) => "  " + JSON.stringify(e)).join(",\n") + "\n]\n");

problems.forEach((p) => console.warn("warn:", p));
console.log(`${dry ? "[dry run] " : ""}${createdSets} new sets, ${added} new cards, ${problems.length} warnings`);
