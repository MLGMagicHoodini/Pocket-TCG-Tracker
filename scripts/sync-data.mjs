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
// GitHub main is usually newer than the npm package, so try it first; jsDelivr is the fallback.
const SOURCES = [
  "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/",
  "https://cdn.jsdelivr.net/npm/pokemon-tcg-pocket-database@latest/dist/",
];

async function load(name) {
  if (fromDir) return JSON.parse(readFileSync(`${fromDir}/${name}`, "utf8"));
  const errors = [];
  for (const base of SOURCES) {
    try {
      const res = await fetch(base + name);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      console.log(`loaded ${name} from ${base}`);
      return json;
    } catch (e) { errors.push(`${base + name}: ${e.message}`); }
  }
  throw new Error("Could not download " + name + "\n  " + errors.join("\n  "));
}

/** Converts the dataset's rarity label to the symbols used by this app. Returns null if unknown. */
// The dataset uses letter codes for newer sets (verified against the rarity counts of existing sets)
const CODES = { C: "\u2662", U: "\u2662\u2662", R: "\u2662\u2662\u2662", RR: "\u2662\u2662\u2662\u2662",
  AR: "\u2606", SR: "\u2606\u2606", SAR: "\u2606\u2606", IM: "\u2606\u2606\u2606", UR: "\u265b",
  S: "\u263c", SSR: "\u263c\u263c" };
function mapRarity(label) {
  const s = String(label ?? "").trim();
  if (CODES[s]) return CODES[s];
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
console.log(`dataset has ${setList.length} sets: ${setList.map((x) => x.code ?? x.id).join(", ")}`);
// Pull rates are optional: if they can't be loaded, new sets simply get no odds columns.
const pullRates = await load("pullRates.json").catch((e) => { console.warn("warn: no pull rates:", e.message); return {}; });

/**
 * Builds the app's per-slot rarity table ({symbol: [slot1..slot5]}, fractions) from the dataset's
 * "Regular Pack" (the app ignores the 0.05% rare/god packs). Returns null if it doesn't fit 5 slots.
 */
function buildRates(datasetCode) {
  const pack = pullRates[datasetCode]?.["Regular Pack"];
  if (!pack?.slots) return null;
  const keys = Object.keys(pack.slots).sort((a, b) => Number(a) - Number(b));
  if (keys.length !== 5) { problems.push(`${datasetCode}: Regular Pack has ${keys.length} slots, expected 5; no rates added`); return null; }
  const out = {};
  keys.forEach((k, i) => {
    for (const [code, pct] of Object.entries(pack.slots[k])) {
      const sym = CODES[code];
      if (!sym) { if (!unknownRateCodes.has(code)) { unknownRateCodes.add(code); problems.push(`${datasetCode}: unknown rate code "${code}" ignored`); } continue; }
      out[sym] ??= [0, 0, 0, 0, 0];
      out[sym][i] = Math.round((out[sym][i] + pct / 100) * 1e6) / 1e6;
    }
  });
  return out;
}
const unknownRateCodes = new Set();

const expansions = JSON.parse(readFileSync(`${D}/expansions.json`, "utf8"));

// Dataset set codes that differ from the ids used in this app
const SET_ALIASES = { "PROMO-A": "P-A", "PROMO-B": "P-B", "PROMO-C": "P-C" };
// Promo sets use "-" as rarity in this app (they have no rarity/pull-rate system)
const NO_RARITY_SETS = new Set(["P-A", "P-B", "P-C", "SP1"]);
/** "Vol. 3" / "B Series Vol. 3" -> "Volume 3" (naming used by the existing data) */
const normalizePack = (n) => String(n).replace(/^.*?\bVol\.?\s*(\d+)$/i, "Volume $1");

const problems = [];
let added = 0, createdSets = 0;

for (const set of setList) {
  const datasetCode = set.code ?? set.id;
  const code = SET_ALIASES[datasetCode] ?? datasetCode;
  const setCards = cards.filter((c) => c.set === datasetCode);
  if (!setCards.length) continue;

  const packNames = (set.packs ?? []).map((p) => normalizePack(typeof p === "string" ? p : p.name?.en ?? p.name));
  let meta = expansions.find((e) => e.id === code);
  const file = meta ? meta.location.replace("{HASH}", D) : `${D}/expansions/${code.toLowerCase()}.json`;
  let data, isNew = false;
  if (meta) data = JSON.parse(readFileSync(file, "utf8"));
  else {
    isNew = true;
    const name = typeof set.name === "string" ? set.name : set.name?.en ?? code;
    meta = { name, id: code, location: `{HASH}/expansions/${code.toLowerCase()}.json`, standard: setCards.length };
    data = { missions: [], packs: packNames.map((name) => ({ name, rarities: {} })), cards: [] };
  }

  const have = new Set(data.cards.map((c) => c.id));
  const before = data.cards.length;
  const newCards = [], newPacks = [];
  for (const c of setCards) {
    const id = `${code} ${String(c.number).padStart(3, "0")}`;
    if (have.has(id)) continue;
    const rarity = NO_RARITY_SETS.has(code) ? "-" : mapRarity(c.rarity);
    if (!rarity) { problems.push(`${id} ${c.name}: unknown rarity ${JSON.stringify(c.rarity)}`); continue; }
    const inPacks = (c.packs ?? []).map(normalizePack);
    let pack = "All";
    if (inPacks.length === 1 && packNames.length > 1) pack = inPacks[0];
    else if (inPacks.length > 1 && inPacks.length < packNames.length) {
      pack = inPacks[0];
      problems.push(`${id} ${c.name}: in packs [${inPacks}] but only one can be stored; used "${pack}"`);
    }
    for (const pn of inPacks) if (!data.packs.some((p) => p.name === pn)) { newPacks.push(pn); data.packs.push({ name: pn, rarities: {} }); }
    const card = { id, name: c.name, pack, rarity, tags: /\bex\b/i.test(c.name) ? ["EX"] : [], type: mapType(c) };
    newCards.push(card);
    data.cards.push(card);
    added++;
  }
  // Only touch files that actually gained cards, so existing hand-formatted data stays untouched
  // Fill in pull rates for packs that have none (never overwrites existing rates)
  const emptyPacks = data.packs.filter((p) => !p.rarities || Object.keys(p.rarities).length === 0);
  const rates = emptyPacks.length && !NO_RARITY_SETS.has(code) ? buildRates(datasetCode) : null;
  const ratesAdded = !!rates;
  if (rates) emptyPacks.forEach((p) => (p.rarities = structuredClone(rates)));
  if (data.cards.length === before && !ratesAdded) continue; // nothing new (also never register an empty new set)
  if (isNew) {
    if (!NO_RARITY_SETS.has(code)) {
      // "standard" = highest card number that is a diamond rarity (everything above is a secret/alt-art card)
      const nums = data.cards.filter((c) => /^\u2662+$/.test(c.rarity)).map((c) => parseInt(c.id.slice(-3), 10));
      if (nums.length) meta.standard = Math.max(...nums);
    }
    createdSets++;
    expansions.push(meta);
    console.log(`+ new set ${code} "${meta.name}" (${data.cards.length} cards, packs: ${packNames.join(", ") || "none"})`);
  } else console.log(`~ ${code}: +${data.cards.length - before} cards`);
  if (dry) continue;
  newCards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const cardLine = (c) => "    " + JSON.stringify(c).replace(/":/g, '": ').replace(/,"/g, ', "');
  let text = isNew ? null : readFileSync(file, "utf8");
  const packsEnd = '\n  ],\n  "cards": [';
  if (!ratesAdded && text && text.includes(packsEnd) && text.trimEnd().endsWith("\n  ]\n}")) {
    // Insert text in place so the existing hand-formatted file keeps its layout (small git diffs)
    if (newPacks.length)
      text = text.replace(packsEnd, newPacks.map((n) => `,\n    {"name": ${JSON.stringify(n)}, "rarities": {}}`).join("") + packsEnd);
    const end = text.lastIndexOf("\n  ]\n}");
    text = text.slice(0, end) + newCards.map((c) => ",\n" + cardLine(c)).join("") + text.slice(end);
    writeFileSync(file, text);
  } else {
    data.cards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
}
if (!dry && createdSets > 0) writeFileSync(`${D}/expansions.json`, "[\n" + expansions.map((e) => "  " + JSON.stringify(e)).join(",\n") + "\n]\n");

problems.forEach((p) => console.warn("warn:", p));
console.log(`${dry ? "[dry run] " : ""}${createdSets} new sets, ${added} new cards, ${problems.length} warnings`);
