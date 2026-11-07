function updateData(data, i, local, id, errorBox) {
    let checkbox = document.getElementById(id);
    if (checkbox !== null) {
        if (data[i] === "TRUE") {
            if (local.indexOf(id) === -1) {
                local.push(id);
            }
            checkbox.checked = true;
        } else {
            if (local.indexOf(id) !== -1) {
                local.splice(local.indexOf(id), 1);
            }
            checkbox.checked = false;
        }
    } else {
        if (id !== "P-A 008") {
            errorBox.textContent = "An error occurred while loading data. Check the console for details.";
            console.log("Unable to locate card with ID " + id);
        }
    }
}


function importGeneticApex(data, local, errorBox, infoBox) {
    errorBox.textContent = "";
    for (let i = 1; i < data.length; i++) {
        let id = "A1 " + String(i).padStart(3, "0");
        updateData(data, i, local, id, errorBox);
    }
    if (errorBox.textContent === "") {
        infoBox.textContent = "Imported Genetic Apex data successfully.";
    }

    localStorage.setItem("cards", JSON.stringify(local));
}

function importPromoA(data, local, errorBox, infoBox) {
    errorBox.textContent = "";
    for (let i = 1; i < data.length; i++) {
        let id = "P-A " + String(i).padStart(3, "0");
        updateData(data, i, local, id, errorBox);
    }
    if (errorBox.textContent === "") {
        infoBox.textContent = "Imported Promo A data successfully.";
    }

    localStorage.setItem("cards", JSON.stringify(local));
}

function importMaxwell() {
    let local = JSON.parse(localStorage.getItem("cards"));

    console.log("Importing maxwell's spreadsheet");
    let expansion = document.getElementById("maxwell-expansion").value;
    console.log("    " + expansion);
    let data = document.getElementById("maxwell-data").value.split(/\r?\n/);
    let errorBox = document.getElementById("error");
    let infoBox = document.getElementById("info");
    if (expansion === "genetic-apex") {
        if (data.length === 287) {
            importGeneticApex(data, local, errorBox, infoBox);
        } else {
            errorBox.textContent = "Invalid data detected, we expected 287 lines, but got " + data.length + ". Make sure your copied data is from the pack you selected.";
            infoBox.textContent = "";
        }
    }
    if (expansion === "promo-a") {
        if (data.length === 25) {
            importPromoA(data, local, errorBox, infoBox);
        } else {
            errorBox.textContent = "Invalid data detected, we expected 25 lines, but got " + data.length + ". Make sure your copied data is from the pack you selected.";
            infoBox.textContent = "";
        }
    }
}