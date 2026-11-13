// Thanks for showing interest in how this works! This project is fairly early in development, so things are a bit of a
// mess on the backend. If you'd like to help tidy things up or suggest changes/new features, join my dev discord and
// head to the tracker-discussion channel: https://discord.gg/UrensGntpC

const craft_cost = {
    "\u2662": 35,
    "\u2662\u2662": 70,
    "\u2662\u2662\u2662": 150,
    "\u2662\u2662\u2662\u2662": 500,
    "\u2606": 400,
    "\u2606\u2606": 1250,
    "\u2606\u2606\u2606": 1500,
    "\u265b": 2500,
    "\u263c": 1000,
    "\u263c\u263c": 1350
}


/* ---------- small helpers ---------- */
function readPref(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
    } catch (err) {
        return fallback;
    }
}

function writePref(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.warn("Unable to save setting", key, err);
    }
}


/* ---------- linked cards: the same card printed in two sets (different numbers) ---------- */
let linkGroups = {}; // card id -> array of every id in its group (including itself)

function setLinks(groups) {
    linkGroups = {};
    (groups || []).forEach(group => {
        if (Array.isArray(group) && group.length > 1) {
            group.forEach(id => linkGroups[id] = group);
        }
    });
    try {
        const saved = readPref("cards", []);
        const expanded = expandLinks(saved);
        if (expanded.length !== saved.length) {
            writePref("cards", expanded);
        }
    } catch (err) {
        console.warn("Unable to apply card links", err);
    }
}

/** Adds every linked card of the ids given (owning one print counts as owning all prints). */
function expandLinks(ids) {
    const out = new Set(ids);
    ids.forEach(id => (linkGroups[id] || []).forEach(other => out.add(other)));
    return [...out];
}

/* ---------- theme ---------- */
function effectiveTheme() {
    const saved = readPref("theme", null);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
    document.documentElement.setAttribute("data-theme", effectiveTheme());
    const btn = document.getElementById("theme-toggle");
    if (btn) {
        btn.textContent = effectiveTheme() === "dark" ? "\u2600 Light" : "\u263e Dark";
    }
}

function toggleTheme() {
    writePref("theme", effectiveTheme() === "dark" ? "light" : "dark");
    applyTheme();
}

/* ---------- list-only view filters (rarity chips, hide owned) ---------- */
const RARITY_CHIPS = ["\u2662", "\u2662\u2662", "\u2662\u2662\u2662", "\u2662\u2662\u2662\u2662", "\u2606", "\u2606\u2606",
    "\u2606\u2606\u2606", "\u263c", "\u263c\u263c", "\u265b", "EX"];

/**
 * Applies the rarity chips and "hide owned" toggle. Only affects the card list, never the pack statistics.
 */
function passesViewFilter(card, local) {
    if (readPref("hide-owned", false) && local.indexOf(card["id"]) !== -1) {
        return false;
    }
    const wanted = readPref("rarity-filter", []);
    if (wanted.length === 0) {
        return true;
    }
    if (wanted.includes(card["rarity"])) {
        return true;
    }
    return wanted.includes("EX") && Array.isArray(card["tags"]) && card["tags"].includes("EX");
}

/* ---------- progress bars ---------- */
function progressBar(have, total) {
    const bar = document.createElement("div");
    bar.className = "progress";
    const fill = document.createElement("div");
    fill.style.width = (total > 0 ? Math.min(100, have / total * 100) : 0) + "%";
    if (total > 0 && have >= total) {
        fill.className = "complete";
    }
    bar.appendChild(fill);
    return bar;
}

const expansionCards = {}; // set name -> array of card ids, filled at startup for the tab progress bars
const expansionData = {};  // set name -> full set data (cards, packs), filled at startup
let expansionsReady = Promise.resolve();

function refreshTabProgress() {
    const local = new Set(readPref("cards", []));
    document.querySelectorAll(".expansionlink[data-name]").forEach(btn => {
        const ids = expansionCards[btn.dataset.name];
        if (!ids) return;
        const have = ids.filter(id => local.has(id)).length;
        const old = btn.querySelector(".progress");
        if (old) old.remove();
        btn.appendChild(progressBar(have, ids.length));
        btn.title = `${btn.dataset.name}: ${have} / ${ids.length}`;
    });
}

function loadAllExpansionCards(expansions) {
    return expansionsReady = Promise.all(expansions.filter(e => typeof e["location"] === "string").map(e =>
        fetch(e["location"]).then(r => r.ok ? r.json() : null).then(json => {
            if (json) {
                expansionData[e["name"]] = json;
                expansionCards[e["name"]] = json["cards"].filter(c => c["unreleased"] !== true).map(c => c["id"]);
            }
        }).catch(() => {})
    )).then(refreshTabProgress);
}

/* ---------- sync link (PC -> phone) ---------- */
/**
 * Compact text form of the owned list: "A1:1_10.12;B1:5" (ranges of card numbers per set).
 */
function encodeOwned(ids) {
    const bySet = {};
    ids.forEach(id => {
        const i = id.lastIndexOf(" ");
        if (i < 0) return;
        (bySet[id.slice(0, i)] ??= []).push(id.slice(i + 1));
    });
    return Object.entries(bySet).map(([set, nums]) => {
        const plain = nums.filter(n => /^\d{3}$/.test(n)).map(Number).sort((a, b) => a - b);
        const other = nums.filter(n => !/^\d{3}$/.test(n));
        const parts = [];
        for (let i = 0; i < plain.length;) {
            let j = i;
            while (j + 1 < plain.length && plain[j + 1] === plain[j] + 1) j++;
            parts.push(j > i + 1 ? `${plain[i]}_${plain[j]}` : plain.slice(i, j + 1).join("."));
            i = j + 1;
        }
        return `${set}:${parts.concat(other).join(".")}`;
    }).join(";");
}

function decodeOwned(text) {
    const ids = [];
    text.split(";").forEach(chunk => {
        const i = chunk.lastIndexOf(":");
        if (i < 0) return;
        const set = chunk.slice(0, i);
        chunk.slice(i + 1).split(".").filter(Boolean).forEach(part => {
            const m = /^(\d+)_(\d+)$/.exec(part);
            if (m) {
                for (let n = Number(m[1]); n <= Number(m[2]); n++) ids.push(`${set} ${String(n).padStart(3, "0")}`);
            } else if (/^\d+$/.test(part)) {
                ids.push(`${set} ${part.padStart(3, "0")}`);
            } else {
                ids.push(`${set} ${part}`);
            }
        });
    });
    return ids;
}

function syncLink() {
    return location.origin + location.pathname + "#sync=" + encodeURIComponent(encodeOwned(readPref("cards", [])));
}

function copySyncLink() {
    const link = syncLink();
    const info = document.getElementById("info");
    const done = () => { if (info) info.textContent = `Sync link copied (${readPref("cards", []).length} cards). Open it on your other device.`; };
    const out = document.getElementById("sync-link");
    if (out) out.value = link;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done).catch(() => { if (out) out.select(); });
    } else if (out) {
        out.select();
    }
}

/**
 * If the page was opened from a sync link, offer to import it (never silently).
 */
function handleSyncHash() {
    if (!location.hash.startsWith("#sync=")) return;
    let ids;
    try {
        ids = normalizeCardIds(decodeOwned(decodeURIComponent(location.hash.slice(6))));
    } catch (err) {
        return;
    }
    history.replaceState(null, "", location.pathname + location.search);
    const current = readPref("cards", []);
    if (confirm(`Import ${ids.length} cards from this sync link?\n\nThis REPLACES the ${current.length} cards currently saved in this browser.`)) {
        writePref("cards", ids);
        location.reload();
    }
}


/* ---------- "Best to open": which set is worth opening packs for right now ---------- */
/**
 * For one set, the chance of a new card from each pack (cards you already own excluded).
 */
function packChances(data, owned) {
    const pools = poolCounts(data);
    const slots = {};
    data["packs"].forEach(p => slots[p["name"]] = [0, 0, 0, 0, 0]);
    let missing = 0;
    data["cards"].forEach(card => {
        if (!isCountedCard(card) || owned.has(card["id"])) return;
        missing++;
        cardPacks(card, data).forEach(name => {
            const rates = data["packs"].find(p => p["name"] === name)?.["rarities"]?.[card["rarity"]];
            const pool = pools[name]?.[card["rarity"]];
            if (rates && pool) {
                for (let i = 0; i < 5; i++) slots[name][i] += rates[i] / pool;
            }
        });
    });
    return {
        missing,
        packs: data["packs"].map(p => ({
            name: p["name"],
            hasRates: Object.keys(p["rarities"] ?? {}).length > 0,
            chance: chanceFromSlots(slots[p["name"]])
        }))
    };
}

function showBestToOpen() {
    document.querySelectorAll(".expansionlink, #best-tab").forEach(b => b.classList.remove("selected-tab"));
    document.getElementById("best-tab")?.classList.add("selected-tab");
    const body = document.getElementById("expansion-bodies");
    body.innerHTML = "<p>Loading...</p>";
    expansionsReady.then(() => {
        const owned = new Set(readPref("cards", []));
        const rows = [];
        const noRates = [];
        Object.entries(expansionData).forEach(([name, data]) => {
            if (/^(P-|SP)/i.test(data["cards"][0]?.["id"] ?? "")) return; // promo sets have no pull odds
            const r = packChances(data, owned);
            const withRates = r.packs.filter(p => p.hasRates);
            if (withRates.length === 0) {
                if (r.missing > 0) noRates.push(name);
                return;
            }
            if (r.missing === 0) return; // completed
            const best = Math.max(...withRates.map(p => p.chance));
            const winners = withRates.filter(p => p.chance >= best - 1e-9);
            rows.push({
                name, best, missing: r.missing,
                pack: winners.length === withRates.length ? (withRates.length > 1 ? "Any pack" : withRates[0].name) : winners.map(p => p.name).join(" / "),
                ten: 1 - Math.pow(1 - best, 10)
            });
        });
        rows.sort((a, b) => b.best - a.best);

        body.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "best-wrap";
        const intro = document.createElement("p");
        intro.textContent = "Sets ranked by the chance that a single pack of the best pack in that set gives you at least one card you don't own yet. Completed sets are hidden.";
        wrap.appendChild(intro);
        const table = document.createElement("table");
        table.className = "best-table";
        const head = table.insertRow();
        ["#", "Set", "Best pack", "New card (1 pack)", "New card (10 packs)", "Missing"].forEach(h => head.insertCell().textContent = h);
        rows.forEach((r, i) => {
            const row = table.insertRow();
            row.className = "best-row " + (i % 2 === 0 ? "even-row" : "odd-row");
            row.style.cursor = "pointer";
            row.title = "Open this set";
            row.insertCell().textContent = String(i + 1);
            row.insertCell().textContent = r.name;
            row.insertCell().textContent = r.pack;
            row.insertCell().textContent = (r.best * 100).toFixed(2) + "%";
            row.insertCell().textContent = (r.ten * 100).toFixed(2) + "%";
            row.insertCell().textContent = String(r.missing);
            row.onclick = () => {
                const btn = document.querySelector(`.expansionlink[data-name="${CSS.escape(r.name)}"]`);
                if (btn) {
                    showSeries(btn.dataset.series);
                    btn.click();
                }
            };
        });
        wrap.appendChild(table);
        if (noRates.length) {
            const note = document.createElement("p");
            note.textContent = "No pull rates available yet (not ranked): " + noRates.join(", ");
            wrap.appendChild(note);
        }
        body.appendChild(wrap);
    });
}

/**
 * Generates HTML data for the expansion tabs at the top of the screen
 * @param expansionMetadata
 */
function seriesOf(expansionMetadata) {
    const id = expansionMetadata["id"];
    if (/^(P-|SP)/i.test(id)) return "Promos";
    const m = /^([A-Z])/i.exec(id);
    return m ? `${m[1].toUpperCase()} Series` : "Other";
}

/**
 * Shows only the set tabs of one series (the series bar stays on top)
 * @param series Name of the series to show
 */
function showSeries(series) {
    document.querySelectorAll(".expansionlink[data-series]").forEach(btn => {
        btn.style.display = btn.dataset.series === series ? "" : "none";
    });
    document.querySelectorAll(".serieslink").forEach(btn => {
        btn.classList.toggle("selected-series", btn.dataset.series === series);
    });
    localStorage.setItem("last-series", series);
}

function generateTabs(expansionMetadata) {
    const button = document.createElement("button");
    button.dataset.series = seriesOf(expansionMetadata);
    button.dataset.name = expansionMetadata["name"];
    const buttonLabel = document.createElement("a");
    buttonLabel.textContent = expansionMetadata["name"];
    buttonLabel.classList.add("desktop-only");
    button.appendChild(buttonLabel);
    const mobileLabel = document.createElement("a");
    mobileLabel.textContent = expansionMetadata["id"];
    mobileLabel.classList.add("mobile-only");
    button.appendChild(mobileLabel);
    button.classList.add("w3-bar-item");
    button.classList.add("w3-button");
    button.classList.add("expansionlink");
    if (localStorage.getItem("last-expansion") === expansionMetadata["name"]) {
        button.classList.add("selected-tab");
    }
    button.onclick = (ev) => {
        localStorage.setItem("filter", "");
        loadExpansion(ev, expansionMetadata);
    }

    const element = document.getElementById("expansion-buttons");
    element.appendChild(button);
}

/**
 * Toggles whether hidden missions are shown
 * @param event
 */
function toggleHiddenMissions(event) {
    localStorage.setItem("hidden-missions", event.currentTarget.checked);
}

/**
 * Toggles whether hidden missions are shown
 * @param event
 */
function toggleHiddenCards(event) {
    localStorage.setItem("hidden-cards", event.currentTarget.checked);
}

/**
 * Event fired when a card checkbox is toggled
 * @param ownedBox The checkbox object
 * @param expansionMetadata An object representing expansion metadata
 */
function onCardOwnershipChange(ownedBox, expansionMetadata) {
    let local = JSON.parse(localStorage.getItem("cards"));
    const group = linkGroups[ownedBox.id] || [ownedBox.id]; // linked prints of the same card change together
    group.forEach(id => {
        const at = local.indexOf(id);
        if (ownedBox.checked && at === -1) {
            local.push(id);
        } else if (!ownedBox.checked && at !== -1) {
            local.splice(at, 1);
        }
    });
    localStorage.setItem("cards", JSON.stringify(local));
    generateExpansionDetails(expansionMetadata);
    refreshTabProgress();
}

/**
 * Checks whether a card fits a supplied filter.
 * @param card the card to check
 * @param expansionMetadata Info about the expansion for this card
 * @returns {*|boolean}
 */
function checkFilter(card, expansionMetadata) {
    if (expansionMetadata['name'] !== localStorage.getItem("last-expansion")) {
        return true;
    }
    if (card["unreleased"] === true && localStorage.getItem("hidden-cards") === "false") {
        return false;
    }
    try {
        let filter = JSON.parse(localStorage.getItem("filter"));
        return (filter.length === 0 || filter.includes(card["id"]));
    } catch (err) {
        let filterString = localStorage.getItem("filter").toLowerCase();
        if (filterString === null) {
            return true;
        }
        let invert = filterString.startsWith("!");
        if (invert) {
            filterString = filterString.substring(1);
        }
        let ret = false;
        if (filterString.startsWith("tag:")) {
            filterString = filterString.substring(4).toLowerCase().replace(" ", "_");
            if (filterString === "secret") {
                let id = parseInt(card["id"].slice(-3));
                ret = id > expansionMetadata["standard"];
            } else {
                for (const tag of card["tags"]) {
                    if (tag.toLowerCase().replace(" ", "_") === filterString) {
                        ret = true;
                        break;
                    }
                }
            }
        } else {
            ret = card['name'].toLowerCase().includes(filterString);
        }
        if (invert) {
            return !ret;
        } else {
            return ret;
        }
    }
}

function createCardRows(json, expansionMeta, expansionList, counter, local) {
    json['cards'].forEach((card) => {
        expansionMeta['rarities'][card['rarity']] += 1
        if (checkFilter(card, expansionMeta) && passesViewFilter(card, local)) {
            let row = expansionList.insertRow();
            row.classList = [].concat(card["pack"])[0].replaceAll(" ", "-").toLowerCase() + "-pack"
            if (counter % 2 === 0) {
                row.classList.add("even-row");
            } else {
                row.classList.add("odd-row");
            }
            let ownedCol = row.insertCell();
            ownedCol.classList = "cardbox";
            let ownedBox = document.createElement("input");
            ownedBox.type = "checkbox";
            ownedBox.classList = "cardbox";
            ownedBox.id = card["id"];
            if (local.indexOf(ownedBox.id) !== -1) {
                ownedBox.checked = true;
            }
            ownedBox.onchange = (ev) => onCardOwnershipChange(ownedBox, expansionMeta);
            ownedCol.appendChild(ownedBox)
            let idCol = row.insertCell();
            idCol.textContent = card["id"] + "\xa0";
            idCol.classList = "card-id";
            const typeCell = row.insertCell();
            typeCell.classList = "cardbox";
            const typeImage = document.createElement("img");
            typeImage.src = "{HASH}/images/icons/" + card["type"] + ".png";
            typeImage.classList = "cardbox"
            typeCell.appendChild(typeImage);
            row.insertCell().textContent = card["name"];
            row.insertCell().textContent = [].concat(card["pack"]).join(" + ");
            row.insertCell().textContent = card["rarity"];
            counter++;
        }
    })
}

function createCollapseDiv(parent, sectionToCollapse, rowText, extraCollapse = () => {
}, extraExpand = () => {
}) {
    let expansionCollapse = document.createElement("div");
    expansionCollapse.classList = "mobile-only col-6 collapseBar";
    let expansionCollapseArrow = document.createElement("a");
    expansionCollapseArrow.textContent = "V";
    expansionCollapse.onclick = (e) => {
        if (expansionCollapseArrow.textContent === "V") {
            expansionCollapseArrow.textContent = ">";
            document.getElementById(sectionToCollapse).style.display = "none";
            extraCollapse();
        } else {
            expansionCollapseArrow.textContent = "V";
            document.getElementById(sectionToCollapse).style.display = "table";
            extraExpand();
        }
    };
    expansionCollapse.appendChild(expansionCollapseArrow);
    expansionCollapse.appendChild(document.createTextNode(rowText))
    parent.appendChild(expansionCollapse);
}

/**
 * Generates the card list on the left side of expansion pages.
 * @param expansionMeta
 */
function generateExpansionList(expansionMeta) {

    let expansionDiv = document.getElementById(expansionMeta["name"]);
    let checkName = expansionMeta["name"].replaceAll(" ", "-").toLowerCase() + "-expansion-table";

    if (document.getElementById(checkName) !== null) {
        expansionDiv.removeChild(document.getElementById(checkName));
    }
    createCollapseDiv(expansionDiv, checkName, "Cards");

    const expansionList = document.createElement("table");
    expansionList.classList = "expansion-table col-6";
    expansionList.id = checkName;
    const headerRow = expansionList.insertRow();
    let resetCell = headerRow.insertCell();
    resetCell.title = "Click to reset filters";
    resetCell.onclick = (ev) => {
        localStorage.setItem("filter", JSON.stringify([]));
        writePref("rarity-filter", []);
        writePref("hide-owned", false);
        generateExpansionBodies(expansionMeta);
    }
    resetCell.textContent = "\u2715";
    resetCell.style.cursor = "pointer";
    resetCell.title = "Click to reset all filters";
    headerRow.insertCell().textContent = "ID";
    headerRow.insertCell().textContent = "";
    headerRow.insertCell().textContent = "Name";
    headerRow.insertCell().textContent = "Pack";
    headerRow.insertCell().textContent = "Rarity";

    let local = JSON.parse(localStorage.getItem("cards"));
    if (typeof (expansionMeta["location"]) === "object") {
        expansionMeta["location"].forEach(expansion => {
            let counter = 0;
            fetch(expansion["location"]).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error white fetching \`` + expansionMeta["location"] + `\`! Status: ${response.status}`);
                }
                return response.json();
            }).then(json => {
                json["rarities"] = {
                    "\u2662": 0,
                    "\u2662\u2662": 0,
                    "\u2662\u2662\u2662": 0,
                    "\u2662\u2662\u2662\u2662": 0,
                    "\u2606": 0,
                    "\u2606\u2606": 0,
                    "\u2606\u2606\u2606": 0,
                    "\u265b": 0,
                    "\u263c": 0,
                    "\u263c\u263c": 0,
                    "-": 0
                }
                createCardRows(json, expansionMeta, expansionList, counter, local);
            }).catch(error => {
                console.error("Unable to fetch data:", error);
            })
        })
    } else {
        fetch(expansionMeta["location"]).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error white fetching \`` + expansionMeta["location"] + `\`! Status: ${response.status}`);
            }
            return response.json();
        }).then(json => {
            let counter = 0;
            expansionMeta["rarities"] = {
                "\u2662": 0,
                "\u2662\u2662": 0,
                "\u2662\u2662\u2662": 0,
                "\u2662\u2662\u2662\u2662": 0,
                "\u2606": 0,
                "\u2606\u2606": 0,
                "\u2606\u2606\u2606": 0,
                "\u265b": 0,
                "\u263c": 0,
                "\u263c\u263c": 0,
                "-": 0
            }
            createCardRows(json, expansionMeta, expansionList, counter, local);
        }).catch(error => {
            console.error("Unable to fetch data:", error);
        })
    }

    expansionDiv.appendChild(expansionList);
}

/**
 * Collects data about each pack in an expansion
 * @param expansionData Expansion data
 * @param info The object collected data is stored in
 * @param expansionMeta
 */
/**
 * Names of the packs a card can be pulled from. `pack` is "All" (every pack of the set), a pack name,
 * or an array of pack names (card that appears in several, but not all, packs).
 */
function cardPacks(card, expansionData) {
    const pack = card["pack"];
    if (pack === "All") {
        return expansionData["packs"].map(p => p["name"]);
    }
    return Array.isArray(pack) ? pack : [pack];
}

/** Cards that count towards pull odds (unreleased cards only when the setting shows them). */
function isCountedCard(card) {
    return !(card["unreleased"] === true && localStorage.getItem("hidden-cards") === "false");
}

/**
 * For every pack: how many cards of each rarity can drop from it. A card's chance in a pack is
 * (slot rate of its rarity) / (number of cards of that rarity in THAT pack's pool).
 */
function poolCounts(expansionData) {
    const counts = {};
    expansionData["packs"].forEach(p => counts[p["name"]] = {});
    expansionData["cards"].forEach(card => {
        if (!isCountedCard(card)) return;
        cardPacks(card, expansionData).forEach(name => {
            if (name in counts) {
                counts[name][card["rarity"]] = (counts[name][card["rarity"]] ?? 0) + 1;
            }
        });
    });
    return counts;
}

/**
 * Chance of at least one new card from a single pack, given the per-slot new-card probabilities.
 */
function chanceFromSlots(slots) {
    return 1 - [0, 1, 2, 3, 4].reduce((acc, i) => acc * (1 - slots[i]), 1);
}

function collectPackData(expansionData, info, expansionMeta) {
    let local = JSON.parse(localStorage.getItem("cards"));
    const pools = poolCounts(expansionData);
    expansionData['packs'].forEach((pack) => {
        info[pack['name']] = {cards: [], have: [], rarity: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}, data: pack};
    })
    if (!('total' in info)) {
        info['total'] = {cards: [], have: [], rarity: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}};
        info['any'] = {cards: [], have: [], rarity: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}};
    }
    expansionData['cards'].forEach((card) => {
        if (checkFilter(card, expansionMeta)) {
            const owned = local.indexOf(card['id']) !== -1;
            info['total']['cards'].push(card['id']);
            if (owned) {
                info['total']['have'].push(card['id']);
            }
            if (card['pack'] === "All") {
                info['any']['cards'].push(card['id']);
                if (owned) {
                    info['any']['have'].push(card['id']);
                }
            }
            cardPacks(card, expansionData).forEach((name) => {
                if (!(name in info)) return; // e.g. "Mission" cards are not in any pack
                info[name]['cards'].push(card['id']);
                if (owned) {
                    info[name]['have'].push(card['id']);
                } else {
                    const chance = info[name]['data']['rarities'][card['rarity']];
                    const pool = pools[name][card['rarity']];
                    if (chance !== undefined && pool) {
                        for (let i = 0; i < 5; i++) {
                            info[name]['rarity'][i] += chance[i] / pool;
                        }
                    }
                }
            })
        }
    })
}

/**
 * Adds an "owned / total" cell to a row. The percentage is available as a tooltip.
 * @param row Table row to add the cell to
 * @param stats Object with `have` and `cards` arrays
 */
function ownedCell(row, stats) {
    const have = stats['have'].length;
    const total = stats['cards'].length;
    const cell = row.insertCell();
    cell.textContent = `${have} / ${total}`;
    cell.title = total > 0 ? `${(have / total * 100).toFixed(1)}% owned` : "";
    cell.appendChild(progressBar(have, total));
}

/**
 * Generates HTML for the pack overview on the top right of expansion pages.
 * @param expansionData Overall expansion data
 * @param info Data for each pack in the expansion
 * @param detailsDiv The div to add this block to
 */
function generateExpansionOverview(expansionData, info, detailsDiv) {
    createCollapseDiv(detailsDiv, "pack-summary", "Pack Summary");

    let packSummary = document.createElement("table");
    packSummary.classList = "summary-table col-6";
    packSummary.id = "pack-summary";
    let headerRow = packSummary.insertRow();
    headerRow.insertCell().textContent = "";
    headerRow.insertCell().textContent = "# Owned";
    headerRow.insertCell().textContent = "# Missing";
    if (Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
        headerRow.insertCell().textContent = "% Chance of New Card";
        headerRow.insertCell().textContent = "% Chance 10-pack";
    }

    let allRow = packSummary.insertRow();
    allRow.classList = "even-row all-pack";
    allRow.insertCell().textContent = "Total";
    ownedCell(allRow, info['total']);
    allRow.insertCell().textContent = String(info['total']['cards'].length - info['total']['have'].length);
    if (Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
        allRow.insertCell().textContent = "N/A";
        allRow.insertCell().textContent = "N/A";
    }

    if (info['any']['cards'].length > 0) {
        let anyRow = packSummary.insertRow();
        anyRow.classList = "odd-row all-pack";
        anyRow.insertCell().textContent = "Any Packs";
        ownedCell(anyRow, info['any']);
        anyRow.insertCell().textContent = String(info['any']['cards'].length - info['any']['have'].length);
        if (Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
            anyRow.insertCell().textContent = "N/A";
            anyRow.insertCell().textContent = "N/A";
        }
    }

    // Which pack gives the best chance of a new card? (only meaningful with pull rates and several packs)
    const chanceOf = (name) => chanceFromSlots(info[name]['rarity']);
    let bestPack = null;
    if (expansionData['packs'].length > 1 && Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
        const ranked = expansionData['packs'].map(p => [p['name'], chanceOf(p['name'])]).sort((a, b) => b[1] - a[1]);
        if (ranked[0][1] > ranked[1][1] + 1e-9 && info[ranked[0][0]]['cards'].length > info[ranked[0][0]]['have'].length) {
            bestPack = ranked[0][0];
        }
    }

    expansionData['packs'].forEach((pack) => {
        let row = packSummary.insertRow();
        row.classList = "even-row " + pack["name"].replaceAll(" ", "-").toLowerCase() + "-pack";
        const nameCell = row.insertCell();
        nameCell.textContent = pack["name"] + (pack["name"] === bestPack ? " \u2605" : "");
        if (pack["name"] === bestPack) {
            nameCell.title = "Best pack to open: highest chance of a new card";
            row.classList.add("best-pack");
        }
        ownedCell(row, info[pack['name']]);
        row.insertCell().textContent = String(info[pack['name']]['cards'].length - info[pack['name']]['have'].length);
        if (Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
            let chance = 1 - ((1 - info[pack['name']]['rarity'][0]) * (1 - info[pack['name']]['rarity'][1]) * (1 - info[pack['name']]['rarity'][2]) * (1 - info[pack['name']]['rarity'][3]) * (1 - info[pack['name']]['rarity'][4]));
            row.insertCell().textContent = String(chance * 100).substring(0, 5) + "%";
            row.insertCell().textContent = String((1 - Math.pow(1 - chance, 10)) * 100).substring(0, 5) + "%";
        }
    })
    detailsDiv.appendChild(packSummary);
}

/**
 * Render a specific mission
 * @param event
 * @param missionName A string name for a mission to load.
 */
function loadMission(event, missionName) {
    var i, missioncontent, missionlinks;
    missioncontent = document.getElementsByClassName("missioncontent");
    for (i = 0; i < missioncontent.length; i++) {
        missioncontent[i].style.display = "none";
    }

    // Get all elements with class="missionlinks" and remove the class "active"
    missionlinks = document.getElementsByClassName("missionlinks");
    for (i = 0; i < missionlinks.length; i++) {
        missionlinks[i].className = missionlinks[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the link that opened the tab
    document.getElementById(missionName).style.display = "block";
    event.currentTarget.className += " active";

    localStorage.setItem("last-mission", missionName);
}

/**
 * Calculate the crafting cost for a card
 * @param expansionData The expansion data for this card
 * @param id The card ID to calculate cost for
 * @returns {number}
 */
function getCardCost(expansionData, id) {
    let value = 99999;
    expansionData['cards'].forEach(card => {
        if (card['id'] === id) {
            value = craft_cost[card['rarity']];
        }
    })
    return value;
}

/**
 * Generate HTML for mission data, including tabs and full details
 * @param expansionData Full data for an expansion
 * @param info Data for available packs on the current expansion
 * @param detailsDiv
 * @param expansionMeta
 */
function generateMissions(expansionData, info, detailsDiv, expansionMeta) {
    //todo overview
    if (expansionData["missions"].length === 0) {
        return
    }

    createCollapseDiv(detailsDiv, "mission-tab", "Missions", () => {
        let contents = document.getElementsByClassName("missioncontent");
        for (let i = 0; i < contents.length; i++) {
            contents[i].style.display = "none";
        }
        let links = document.getElementsByClassName("missionlinks");
        for (let i = 0; i < links.length; i++) {
            links[i].className = links[i].className.replace(" active", "");
        }
    })

    let local = JSON.parse(localStorage.getItem("cards"));
    let missionTabs = document.createElement("div");
    missionTabs.classList = "missiontab col-3";
    missionTabs.id = "mission-tab";
    detailsDiv.appendChild(missionTabs);

    expansionData['missions'].forEach((mission) => {
        if (!Array.isArray(mission['requirements'])) {
            return; // skip empty placeholder missions
        }
        if (JSON.parse(localStorage.getItem("hidden-missions")) === true || mission['hidden'] === undefined || mission['hidden'] === null || mission['hidden'] === false) {
            let missionTab = document.createElement("button");
            missionTab.classList.add("missionlinks");
            missionTab.textContent = mission['name'];
            missionTab.onclick = (ev) => {
                loadMission(ev, mission["name"]);
            }
            missionTabs.appendChild(missionTab);

            let missionContent = document.createElement("div");
            missionContent.classList = "missioncontent col-3";
            missionContent.id = mission['name'];

            if (localStorage.getItem("last-mission") === mission['name']) {
                missionContent.style = "display:block";
            } else {
                missionContent.style = "display:none";
            }

            let missionDetails = document.createElement("div");
            let filterButton = document.createElement("button");
            filterButton.textContent = "Show missing requirements";
            filterButton.onclick = (ev) => {
                let filter = [];
                mission['requirements'].forEach(requirement => {
                    let present = false;
                    requirement['ids'].forEach(id => {
                        if (local.includes(id)) {
                            present = true;
                        }
                    })
                    if (!present) {
                        filter = filter.concat(requirement['ids']);
                    }
                })
                localStorage.setItem("filter", JSON.stringify(filter));
                generateExpansionBodies(expansionMeta);
            }
            missionDetails.appendChild(filterButton);

            let fullFilterButton = document.createElement("button");
            fullFilterButton.textContent = "Show all cards";
            fullFilterButton.onclick = (ev) => {
                let filter = [];
                mission['requirements'].forEach(requirement => {
                    filter = filter.concat(requirement['ids']);
                })
                localStorage.setItem("filter", JSON.stringify(filter));
                generateExpansionBodies(expansionMeta);
            }
            missionDetails.appendChild(fullFilterButton);

            let missionCost = document.createElement("div");
            missionDetails.classList = "missioncost";
            missionDetails.appendChild(missionCost);

            const requirementsTable = document.createElement("table");
            let header = requirementsTable.insertRow();
            let dispCell = header.insertCell();
            dispCell.colSpan = 2;
            dispCell.textContent = "Required Card";
            header.insertCell().textContent = "Cost";

            let counter = 0;
            let complete = true;
            let sum = 0;
            mission['requirements'].forEach((requirement) => {
                let row = requirementsTable.insertRow();
                row.classList = "all-pack";
                if (counter % 2 === 0) {
                    row.classList.add("even-row");
                } else {
                    row.classList.add("odd-row");
                }
                row.onclick = (ev) => {
                    let filter = [];
                    filter = filter.concat(requirement['ids']);
                    localStorage.setItem("filter", JSON.stringify(filter));
                    generateExpansionBodies(expansionMeta);
                }
                let checkCell = row.insertCell();
                let held = document.createElement("input");
                held.type = "checkbox";
                held.disabled = true;
                let cheapest = null;
                let cost = 99999;
                requirement["ids"].forEach((id) => {
                    let COST = getCardCost(expansionData, id);
                    if (local.indexOf(id) !== -1) {
                        held.checked = true;
                        cost = 0;
                        cheapest = null;
                    } else if (COST < cost) {
                        cost = COST;
                        cheapest = id;
                    }

                })
                if (complete && !held.checked) {
                    complete = false;
                }
                checkCell.appendChild(held);
                row.insertCell().textContent = requirement["display"];
                let costCell = row.insertCell();
                costCell.className = "requirementCost";
                if (cost === 99999) {
                    costCell.textContent = "Not Craftable";
                } else {
                    costCell.textContent = cost;
                    sum += cost;
                }

                counter++;
            })
            missionDetails.appendChild(document.createTextNode("Total cost to craft mission: " + String(sum)));
            if (complete) {
                missionTab.classList.add("complete-mission");
            }


            missionDetails.appendChild(requirementsTable);
            missionContent.appendChild(missionDetails);

            detailsDiv.appendChild(missionContent);
        }
    })
}

/**
 * Generate HTML for each expansion page
 * @param expansionMeta
 * @param detailsDiv
 */
function generatePackDetails(expansionMeta, detailsDiv) {
    if (typeof (expansionMeta["location"]) === "object") {
        //todo overview
        let info = {};
        expansionMeta["location"].forEach(location => {
            fetch(location["location"]).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error white fetching \`` + expansionMeta["location"] + `\`! Status: ${response.status}`);
                }
                return response.json();
            }).then(json => {
                collectPackData(json, info, expansionMeta);
                //todo generateMissions(json, info, detailsDiv, expansionMeta);

            }).catch(error => {
                console.error("Unable to fetch data:", error);
            })
        })
    } else {
        fetch(expansionMeta["location"]).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error white fetching \`` + expansionMeta["location"] + `\`! Status: ${response.status}`);
            }
            return response.json();
        }).then(json => {
            let info = {};

            collectPackData(json, info, expansionMeta);
            generateExpansionOverview(json, info, detailsDiv);
            generateMissions(json, info, detailsDiv, expansionMeta);

        }).catch(error => {
            console.error("Unable to fetch data:", error);
        })
    }
}

function generateExpansionDetails(expansionMeta) {
    let expansionDiv = document.getElementById(expansionMeta["name"]);
    if (document.getElementById(expansionMeta["name"].replaceAll(" ", "-").toLowerCase() + "-expansion-details") !== null) {
        expansionDiv.removeChild(document.getElementById(expansionMeta["name"].replaceAll(" ", "-").toLowerCase() + "-expansion-details"));
    }

    const detailsDiv = document.createElement("div");
    detailsDiv.classList.add("expansion-details");
    detailsDiv.id = expansionMeta["name"].replaceAll(" ", "-").toLowerCase() + "-expansion-details";

    generatePackDetails(expansionMeta, detailsDiv);
    expansionDiv.appendChild(detailsDiv);
}

function filterByName(name) {
    localStorage.setItem("filter", name);
}

function generateExpansionSearch(expansionMeta) {
    let expansionDiv = document.getElementsByClassName("expansion-body")[0];
    let checkName = "expansion-search";
    if (document.getElementById(checkName) !== null) {
        expansionDiv.removeChild(document.getElementById(checkName));
    }

    let filterDiv = document.createElement("div");
    filterDiv.classList = "expansion-filter";
    filterDiv.id = checkName;
    let filterForm = document.createElement("form");
    let filterLabel = document.createElement("label");
    filterLabel.for = "filter";
    filterLabel.textContent = "Filter by name: ";
    filterForm.appendChild(filterLabel);
    let filterText = document.createElement("input");
    filterText.type = "text";
    filterText.id = "filter";
    filterText.className = "filter-input";
    let fil = localStorage.getItem("filter");
    if (fil !== null && !fil.startsWith("[") && localStorage.getItem("last-expansion") === expansionMeta["name"]) {
        filterText.value = fil;
    }
    filterText.onchange = (e) => {
        filterByName(e.target.value);
    }
    filterForm.appendChild(filterText);
    filterDiv.appendChild(filterForm);

    // Rarity chips + hide owned (these only change the card list, not the pack statistics)
    const chips = document.createElement("div");
    chips.className = "filter-chips";
    const selected = readPref("rarity-filter", []);
    RARITY_CHIPS.forEach(r => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (selected.includes(r) ? " chip-on" : "");
        chip.textContent = r;
        chip.onclick = () => {
            const now = readPref("rarity-filter", []);
            writePref("rarity-filter", now.includes(r) ? now.filter(x => x !== r) : now.concat(r));
            generateExpansionBodies(expansionMeta);
        };
        chips.appendChild(chip);
    });
    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "chip" + (readPref("hide-owned", false) ? " chip-on" : "");
    hide.textContent = "Hide owned";
    hide.onclick = () => {
        writePref("hide-owned", !readPref("hide-owned", false));
        generateExpansionBodies(expansionMeta);
    };
    chips.appendChild(hide);
    filterDiv.appendChild(chips);
    expansionDiv.appendChild(filterDiv);
}

/**
 * Iterate available expansions and create page data for each
 * @param expansionMetadata
 */
function generateExpansionBodies(expansionMetadata) {
    let expansionBodies = document.getElementById("expansion-bodies");
    expansionBodies.innerHTML = "";

    const expansionDiv = document.createElement("div");
    expansionDiv.className = "expansion-body";
    expansionDiv.id = expansionMetadata["name"];
    expansionDiv.style = "display:block";
    expansionBodies.appendChild(expansionDiv);

    generateExpansionSearch(expansionMetadata);
    generateExpansionList(expansionMetadata);

    generateExpansionDetails(expansionMetadata);
}

function generateSpecialTab(element, name, label, packMeta) {
    const button = document.createElement("button");
    // Plain text label: the FontAwesome kit is locked to specific domains, so icons vanished on new hosts
    button.textContent = (label || "") + " " + name;
    button.classList.add("w3-bar-item");
    button.classList.add("w3-button");
    button.classList.add("expansionlink");
    if (localStorage.getItem("last-expansion") === name || localStorage.getItem("last-expansion") === null) {
        button.classList.add("selected-tab");
    }
    button.onclick = (ev) => {
        loadExpansion(ev, {"name": name, "location": packMeta, "standard": 0});
    }
    element.appendChild(button);
}

/**
 * Older data had card ids like "B2 0012" (typo). Normalise those to "B2 012" in saved data.
 * @param ids array of card ids
 */
function normalizeCardIds(ids) {
    return expandLinks([...new Set(ids.map(id => id.replace(/^(\S+) 0(\d{3})$/, "$1 $2")))]);
}

function load() {
    applyTheme();
    handleSyncHash();
    if (localStorage.getItem("cards") === null) {
        localStorage.setItem("cards", JSON.stringify([]));
    }
    try {
        localStorage.setItem("cards", JSON.stringify(normalizeCardIds(JSON.parse(localStorage.getItem("cards")))));
    } catch (err) {
        console.warn("Unable to normalise saved cards", err);
    }
    if (localStorage.getItem("filter") === null) {
        localStorage.setItem("filter", JSON.stringify([]));
    }
    if (localStorage.getItem("hidden-missions") === null) {
        localStorage.setItem("hidden-missions", false);
    }
    if (localStorage.getItem("hidden-cards") === null) {
        localStorage.setItem("hidden-cards", true);
    }

    const element = document.getElementById("expansion-buttons");

    fetch('{HASH}/links.json').then(r => r.ok ? r.json() : []).catch(() => []).then(groups => {
        setLinks(groups);
        return fetch('{HASH}/expansions.json');
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error white fetching \`expansions.json\`! Status: ${response.status}`);
        }
        return response.json();
    }).then(json => {
        generateSpecialTab(element, "Settings", "\u2699", json);
        //generateSpecialTab(element, "Overview", "\u2605", json);
        // Series bar (A / B / C / Promos) on one row, the sets of the selected series on the next
        const seriesNames = [...new Set(json.map(seriesOf))].sort((a, b) => (a === "Promos") - (b === "Promos") || a.localeCompare(b));
        seriesNames.forEach(name => {
            const sbtn = document.createElement("button");
            sbtn.textContent = name;
            sbtn.dataset.series = name;
            sbtn.className = "w3-bar-item w3-button serieslink";
            sbtn.onclick = () => showSeries(name);
            element.appendChild(sbtn);
        });
        const bestBtn = document.createElement("button");
        bestBtn.id = "best-tab";
        bestBtn.textContent = "\u2605 Best to open";
        bestBtn.className = "w3-bar-item w3-button";
        bestBtn.onclick = showBestToOpen;
        element.appendChild(bestBtn);
        const themeBtn = document.createElement("button");
        themeBtn.id = "theme-toggle";
        themeBtn.className = "w3-bar-item w3-button";
        themeBtn.style.float = "right";
        themeBtn.onclick = toggleTheme;
        element.appendChild(themeBtn);
        applyTheme();
        const rowBreak = document.createElement("div");
        rowBreak.className = "series-break";
        element.appendChild(rowBreak);
        json.forEach(expansion => {
            generateTabs(expansion);
            if (localStorage.getItem("last-expansion") === expansion["name"]) {
                generateExpansionBodies(expansion);
            }
        })
        loadAllExpansionCards(json);
        const last = json.find(e => e["name"] === localStorage.getItem("last-expansion"));
        showSeries(last ? seriesOf(last) : seriesNames.filter(n => n !== "Promos").pop() ?? seriesNames[0]);
        if (localStorage.getItem("last-expansion") === "Overview") {
            generateExpansionBodies({"name": "Overview", "location": json, "standard": 0});
        }
    }).catch(error => {
        console.error("Unable to fetch data:", error);
    })
}

function generateSettingsBody() {
    let expansionBodies = document.getElementById("expansion-bodies");
    fetch("{HASH}/pages/settings.html")
        .then(response => response.text())
        .then(html => {
            expansionBodies.innerHTML = html;
            document.getElementById("hidden-missions").checked = JSON.parse(localStorage.getItem("hidden-missions"));
            document.getElementById("hidden-cards").checked = JSON.parse(localStorage.getItem("hidden-cards"));
        })
        .catch(error => {
            console.warn(error)
        })
}

/**
 * Render a specific expansion
 * @param event
 * @param expansionMetadata
 */
function loadExpansion(event, expansionMetadata) {
    let i, expansionlinks;
    expansionlinks = document.getElementsByClassName("expansionlink");
    for (i = 0; i < expansionlinks.length; i++) {
        try {
            expansionlinks[i].className = expansionlinks[i].className.replace(" selected-tab", "");
        } catch (error) {
            //todo look into and fix actual cause of this
        }
    }
    if (expansionMetadata["name"] === "Settings") {
        generateSettingsBody();
    } else {
        localStorage.setItem("last-expansion", expansionMetadata["name"]);
        generateExpansionBodies(expansionMetadata);
    }
    event.currentTarget.className += " selected-tab";
    localStorage.setItem("last-mission", null);
    localStorage.setItem("filter", "[]");
}

/**
 * Render a specific settings page
 * @param event
 * @param settingName The settings tab to render
 */
function loadSetting(event, settingName) {
    var i, x, settinglinks;
    x = document.getElementsByClassName("setting-body");
    settinglinks = document.getElementsByClassName("settinglink");
    for (i = 0; i < x.length; i++) {
        x[i].style.display = "none";
        settinglinks[i].className = settinglinks[i].className.replace(" selected-tab", "");
    }
    document.getElementById(settingName).style.display = "block";
    event.currentTarget.className += " selected-tab";

    const fileInput = document.getElementById("file-input");
    fileInput.removeEventListener("change", loadCards, false);
    fileInput.addEventListener("change", loadCards, false);
}

/**
 * Save card data to clipboard
 */
function saveCards() {
    document.getElementById("error").textContent = "";
    document.getElementById("info").textContent = "Saved data to file.";

    const blob = new Blob([localStorage.getItem("cards")], {type: 'text/plain'});
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pocket-tracker.sav";
    a.click();
}

/**
 * Load save data from settings page
 */
function loadCards(e) {
    try {

        let file = e.target.files[0];
        if (!file) {
            document.getElementById("info").textContent = "";
            document.getElementById("error").textContent = "No save file selected";
            return;
        }

        let reader = new FileReader();
        reader.onload = function (e) {
            let cards = e.target.result;

            // Parse to make sure there's no obvious errors
            let parsed = normalizeCardIds(JSON.parse(cards));
            const current = readPref("cards", []).length;
            if (!confirm(`Load ${parsed.length} cards from this file?\n\nThis REPLACES the ${current} cards currently saved in this browser.`)) {
                document.getElementById("info").textContent = "";
                document.getElementById("error").textContent = "Import cancelled.";
                e.target.value = "";
                return;
            }
            localStorage.setItem("cards", JSON.stringify(parsed));

            parsed.forEach((id) => {
                let checkbox = document.getElementById(id);
                if (checkbox !== null) {
                    checkbox.checked = true;
                }
            })

            document.getElementById("error").textContent = "";
            document.getElementById("info").textContent = "Loaded data successfully.";
            refreshTabProgress();
        }
        reader.readAsText(file);
    } catch (err) {
        document.getElementById("info").textContent = "";
        document.getElementById("error").textContent = err.message;
    }
}