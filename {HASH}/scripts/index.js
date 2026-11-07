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

/**
 * Generates HTML data for the expansion tabs at the top of the screen
 * @param expansionMetadata
 */
function generateTabs(expansionMetadata) {
    const button = document.createElement("button");
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
    if (ownedBox.checked) {
        if (local.indexOf(ownedBox.id) === -1) {
            local.push(ownedBox.id);
        }
    } else {
        if (local.indexOf(ownedBox.id) !== -1) {
            local.splice(local.indexOf(ownedBox.id), 1);
        }
    }
    localStorage.setItem("cards", JSON.stringify(local));
    generateExpansionDetails(expansionMetadata);
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
        if (checkFilter(card, expansionMeta)) {
            let row = expansionList.insertRow();
            row.classList = card["pack"].replaceAll(" ", "-").toLowerCase() + "-pack"
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
            row.insertCell().textContent = card["pack"];
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
        generateExpansionBodies(expansionMeta);
    }
    let resetIcon = document.createElement("i");
    resetIcon.className = "fa-solid fa-filter-circle-xmark";
    resetCell.appendChild(resetIcon);
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
function collectPackData(expansionData, info, expansionMeta) {
    let local = JSON.parse(localStorage.getItem("cards"));
    expansionData['packs'].forEach((pack) => {
        info[pack['name']] = {cards: [], have: [], rarity: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}, data: pack};
    })
    if (!('total' in info)) {
        info['total'] = {cards: [], have: [], rarity: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}};
        info['any'] = {cards: [], have: [], rarity: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}};
    }
    expansionData['cards'].forEach((card) => {
        if (checkFilter(card, expansionMeta)) {
            info['total']['cards'].push(card['id']);
            if (local.indexOf(card['id']) !== -1) {
                info['total']['have'].push(card['id']);
            }

            if (card['pack'] in info) {
                info[card['pack']]['cards'].push(card['id']);
                if (local.indexOf(card['id']) !== -1) {
                    info[card['pack']]['have'].push(card['id']);
                } else {
                    let chance = info[card['pack']]['data']['rarities'][card['rarity']];
                    if (chance !== undefined) {
                        for (let i = 0; i < 5; i++) {
                            info[card['pack']]['rarity'][i] += chance[i] / expansionMeta['rarities'][card['rarity']];
                        }
                    }
                }
            }
            if (card['pack'] === "All") {
                info['any']['cards'].push(card['id']);
                if (local.indexOf(card['id']) !== -1) {
                    info['any']['have'].push(card['id']);
                }
                expansionData['packs'].forEach((pack) => {
                    info[pack['name']]['cards'].push(card['id']);
                    if (local.indexOf(card['id']) !== -1) {
                        info[pack['name']]['have'].push(card['id']);
                    } else {
                        let chance = info[pack['name']]['data']['rarities'][card['rarity']];
                        if (chance !== undefined) {
                            for (let i = 0; i < 5; i++) {
                                info[pack['name']]['rarity'][i] += chance[i] / expansionMeta['rarities'][card['rarity']];
                            }
                        }
                    }
                })
            }
        }
    })
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
    headerRow.insertCell().textContent = "% Owned";
    headerRow.insertCell().textContent = "# Missing";
    if (Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
        headerRow.insertCell().textContent = "% Chance of New Card";
        headerRow.insertCell().textContent = "% Chance 10-pack";
    }

    let allRow = packSummary.insertRow();
    allRow.classList = "even-row all-pack";
    allRow.insertCell().textContent = "Total";
    allRow.insertCell().textContent = String(info['total']['have'].length / info['total']['cards'].length * 100).substring(0, 5) + "%";
    allRow.insertCell().textContent = String(info['total']['cards'].length - info['total']['have'].length);
    if (Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
        allRow.insertCell().textContent = "N/A";
        allRow.insertCell().textContent = "N/A";
    }

    if (info['any']['cards'].length > 0) {
        let anyRow = packSummary.insertRow();
        anyRow.classList = "odd-row all-pack";
        anyRow.insertCell().textContent = "Any Packs";
        anyRow.insertCell().textContent = String(info['any']['have'].length / info['any']['cards'].length * 100).substring(0, 5) + "%";
        anyRow.insertCell().textContent = String(info['any']['cards'].length - info['any']['have'].length);
        if (Object.keys(info[expansionData['packs'][0]['name']]['data']['rarities']).length > 0) {
            anyRow.insertCell().textContent = "N/A";
            anyRow.insertCell().textContent = "N/A";
        }
    }

    expansionData['packs'].forEach((pack) => {
        let row = packSummary.insertRow();
        row.classList = "even-row " + pack["name"].replaceAll(" ", "-").toLowerCase() + "-pack";
        row.insertCell().textContent = pack["name"];
        row.insertCell().textContent = String(info[pack['name']]['have'].length / info[pack['name']]['cards'].length * 100).substring(0, 5) + "%";
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
    const buttonLabel = document.createElement("i");
    buttonLabel.className = "fa-solid " + label;
    button.appendChild(buttonLabel);
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
    return [...new Set(ids.map(id => id.replace(/^(\S+) 0(\d{3})$/, "$1 $2")))];
}

function load() {
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

    fetch('{HASH}/expansions.json').then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error white fetching \`expansions.json\`! Status: ${response.status}`);
        }
        return response.json();
    }).then(json => {
        generateSpecialTab(element, "Settings", "fa-gear", json);
        //generateSpecialTab(element, "Overview", "fa-star", json);
        json.forEach(expansion => {
            generateTabs(expansion);
            if (localStorage.getItem("last-expansion") === expansion["name"]) {
                generateExpansionBodies(expansion);
            }
        })
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
            localStorage.setItem("cards", JSON.stringify(parsed));

            parsed.forEach((id) => {
                let checkbox = document.getElementById(id);
                if (checkbox !== null) {
                    checkbox.checked = true;
                }
            })

            document.getElementById("error").textContent = "";
            document.getElementById("info").textContent = "Loaded data successfully.";
        }
        reader.readAsText(file);
    } catch (err) {
        document.getElementById("info").textContent = "";
        document.getElementById("error").textContent = err.message;
    }
}