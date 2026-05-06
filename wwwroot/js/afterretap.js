
let calendarDataretapretap = [];
let calendarMapretapretap = {};
let operatorValuesretap = {};
let currentSTDretap = {};
let currentDaysretap = [];

function buildCalendarMapretap() {
    calendarMapretapretap = {};

    calendarDataretap.forEach(c => {
        const y = Number(c.Year);
        const m = Number(c.Month);
        const d = Number(c.Day);

        calendarMapretapretap[`${y}-${m}-${d}`] = Number(c.Type);
    });
}

function loadCalendarAndRenderretap(retapdata) {

    const monthVal = $('#monthInput').val();
    const yearVal = $('#yearInput').val();

    $.ajax({
        url: 'Attendance/GetCalendar',
        method: 'GET',
        data: { month: monthVal, year: yearVal },
        dataType: 'json',
        success: function (response) {

            calendarDataretap = response || [];
            buildCalendarMapretap();
            renderLineCountTableretap(retapdata);

            fetchSTDretap();
        },
        error: function (xhr, status, error) {
            console.error("Calendar load error:", error);
        }
    });
}

function getDayStyleretap(year, month, dayNumber) {

    const type = calendarMapretapretap[`${year}-${month}-${dayNumber}`];
    let styles = [];

    const today = new Date();
    const isToday =
        today.getFullYear() === year &&
        today.getMonth() + 1 === month &&
        today.getDate() === dayNumber;

    if (isToday) {
        styles.push('background-color:#c8e6c9;font-weight:bold');
    }

    if (type !== undefined) {
        switch (type) {
            case -1: styles.push('background-color:#ffffff'); break;
            case 5: styles.push('background-color:#4caf50;color:white'); break;
            case 3: styles.push('background-color:#f44336;color:white'); break;
            case 4: styles.push('background-color:#2196f3;color:white'); break;
            case 0: styles.push('background-color:#ffeb3b'); break;
            default: styles.push('background-color:#ffffff');
        }
    } else {
        const dateObj = new Date(year, month - 1, dayNumber);
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            styles.push('background-color:#ffeb3b');
        }
    }

    return styles.join(';');
}

// ===============================
// RENDER MAIN TABLE
// ===============================
function renderLineCountTableretap(retap_data) {

    if (!retap_data || retap_data.length === 0) {
        $("#retap_tbody").html("<tr><td>No data found.</td></tr>");
        return;
    }

    const tableHead = document.getElementById("retap_table");
    const tableBody = document.getElementById("retap_tbody");

    tableHead.innerHTML = "";
    tableBody.innerHTML = "";

    operatorValues = {};
    currentSTD = {};

    const month = parseInt($('#monthInput').val(), 10);
    const year = parseInt($('#yearInput').val(), 10);

    const headerRow = document.createElement("tr");
    //headerRow.innerHTML = `<th class="text-start">Skill Group</th>`;
    headerRow.innerHTML = `<th class="text-start">Skill Group</th>`;

    const sample = retap_data[0];
    const dayColumns = Object.keys(sample).filter(
        c => c !== "Skill" && c !== "SkillGroup" && c !== "SkillCategory"
    );

    currentDaysretap = dayColumns;

    // HEADER
    dayColumns.forEach(day => {

        const dayNumber = parseInt(day, 10);
        const style = getDayStyleretap(year, month, dayNumber);

        headerRow.innerHTML += `
            <th class="text-center" style="${style}">
                ${day}
            </th>`;
    });

    tableHead.appendChild(headerRow);

    // BODY
    retap_data.forEach(row => {

        const tr = document.createElement("tr");
        const skillGroup = row.SkillCategory ?? "N/A";

        tr.innerHTML = `<td class="text-start">${skillGroup}</td>`;

        dayColumns.forEach(day => {

            const dayNumber = parseInt(day, 10);
            const val = Number(row[day] ?? 0);
            const style = getDayStyleretap(year, month, dayNumber);

            tr.innerHTML += `
                <td class="text-center" style="${style}">
                    ${val}
                </td>`;

            if (skillGroup.includes("Operator")) {
                operatorValues[day] = val;
            }
        });

        tableBody.appendChild(tr);
    });
}

// ===============================
// APPLY STD ROW
// ===============================
function applySTDToTableretap(stdData_retap) {

    $("#retap_tbody tr.std-row").remove();
    $("#retap_tbody tr.lack-row").remove();

    currentSTD = stdData_retap.values || {};

    let stdRow = `
        <tr class="std-row">
            <td class="text-start fw-bold text-success">
                STD
            </td>`;

    currentDaysretap.forEach(day => {
        stdRow += `
            <td class="text-center fw-bold bg-light">
                ${currentSTD[day] ?? 0}
            </td>`;
    });

    stdRow += `</tr>`;
    $("#retap_tbody").append(stdRow);

    applyLackingRowretap();
}

// ===============================
// APPLY LACKING / EXCESS ROW
// ===============================
function applyLackingRowretap() {

    let lackRow = `
        <tr class="lack-row">
            <td class="text-start fw-bold">
                Lacking / Excess
            </td>`;

    currentDaysretap.forEach(day => {

        const actual = operatorValues[day] ?? 0;
        const std = currentSTD[day] ?? 0;
        const diff = actual - std;

        lackRow += `
            <td class="text-center fw-bold ${diff < 0 ? 'text-danger' : 'text-success'}">
                ${diff}
            </td>`;
    });

    lackRow += `</tr>`;
    $("#retap_tbody").append(lackRow);
}

// ===============================
// FETCH STD FROM SERVER
// ===============================
function fetchSTDretap() {

    fetch("LineCount/GetSTD", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            month: $("#monthInput").val(),
            year: $("#yearInput").val(),
            section: $("#costCodeInput").val(),
            shift: $("#shiftInput").val()
        })
    })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                applySTDToTableretap(res.data);
            }
        })
        .catch(err => console.error("STD Fetch Error:", err));
}

//===============================
//STD FILE UPLOAD
// ===============================
$("#stdFile").on("change", function () {

    const file = this.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("month", $("#monthInput").val());
    formData.append("year", $("#yearInput").val());
    formData.append("section", $("#costCodeInput").val());
    formData.append("shift", $("#shiftInput").val());

    fetch("LineCount/GetSTD", {
        method: "POST",
        body: formData
    })
        .then(res => res.json())
        .then(res => {

            if (!res.success) {
                Swal.fire("Error", res.message, "error");
                return;
            }

            applySTDToTableretap(res.data);

            Swal.fire({
                icon: "success",
                title: "STD Uploaded",
                text: `${res.data.std_type} applied successfully`,
                timer: 1500,
                showConfirmButton: false
            });
        })
        .catch(err => {
            Swal.fire("Error", "Upload failed", "error");
            console.error(err);
        });
});

// ===============================
// MAIN LOAD BUTTON
// ===============================
$("#insertPivotBtn").on("click", function () {

    const $btn = $(this);
    $btn.prop("disabled", true).text("Processing...");

    // 🔹 Show loading inside tbody
    $("#retap_tbody").html(`
        <tr>
            <td colspan="31" class="text-center">
                <div class="spinner-border text-primary" role="status"></div>
                <div>Loading RETAP data...</div>
            </td>
        </tr>
    `);

    $.ajax({
        url: "Retap/RetapData",
        method: "POST",
        dataType: "json",
        data: {
            month: $("#monthInput").val(),
            year: $("#yearInput").val(),
            shift: $("#shiftInput").val(),
            costCode: $("#costCodeInput").val()
        },
        success: function (res) {

            if (res.success && res.retap_data.length > 0) {
                loadCalendarAndRenderretap(res.retap_data);
            } else {
                $("#retap_tbody").html(`
                    <tr>
                        <td colspan="31" class="text-center text-muted">
                            No data found.
                        </td>
                    </tr>
                `);
            }
        },
        error: function (xhr, status, error) {

            $("#retap_tbody").html(`
                <tr>
                    <td colspan="31" class="text-center text-danger">
                        Error loading data.
                    </td>
                </tr>
            `);

            Swal.fire("Error", `${status} - ${error}`, "error");
        },
        complete: function () {
            $btn.prop("disabled", false).text("Load");
        }
    });
});