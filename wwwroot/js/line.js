
let calendarData = [];
let calendarMap  = {};
let operatorValues = {};
let currentSTD = {};
let currentDays = [];

function buildCalendarMap() {
    calendarMap = {};

    calendarData.forEach(c => {
        const y = Number(c.Year);
        const m = Number(c.Month);
        const d = Number(c.Day);

        calendarMap[`${y}-${m}-${d}`] = Number(c.Type);
    });
}

function loadCalendarAndRender(lineData) {

    const monthVal = $('#monthInput').val();
    const yearVal  = $('#yearInput').val();

    $.ajax({
        url: 'Attendance/GetCalendar',
        method: 'GET',
        data: { month: monthVal, year: yearVal },
        dataType: 'json',
        success: function(response) {

            calendarData = response || [];
            buildCalendarMap();
            renderLineCountTable(lineData);

            fetchSTD();
        },
        error: function(xhr, status, error) {
            console.error("Calendar load error:", error);
        }
    });
}

// ===============================
// DAY STYLE COLORING
// ===============================
function getDayStyle(year, month, dayNumber) {

    const type = calendarMap[`${year}-${month}-${dayNumber}`];
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
            case 5:  styles.push('background-color:#4caf50;color:white'); break;
            case 3:  styles.push('background-color:#f44336;color:white'); break;
            case 4:  styles.push('background-color:#2196f3;color:white'); break;
            case 0:  styles.push('background-color:#ffeb3b'); break;
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
function renderLineCountTable(data) {

    if (!data || data.length === 0) {
        $("#pivotTableBody").html("<tr><td>No data found.</td></tr>");
        return;
    }

    const tableHead = document.getElementById("pivotTable");
    const tableBody = document.getElementById("pivotTableBody");

    tableHead.innerHTML = "";
    tableBody.innerHTML = "";

    operatorValues = {};
    currentSTD = {};

    const month = parseInt($('#monthInput').val(), 10);
    const year  = parseInt($('#yearInput').val(), 10);

    const headerRow = document.createElement("tr");
    //headerRow.innerHTML = `<th class="text-start">Skill Group</th>`;
    headerRow.innerHTML = `<th class="text-start">Skill Group</th>`;

    const sample = data[0];
    //const dayColumns = Object.keys(sample).filter(
    //    c => c !== "Skill" && c !== "SkillGroup"
    //);

    const dayColumns = Object.keys(sample).filter(
        c => c !== "Skill" && c !== "SkillGroup" && c !== "SkillCategory"
    );

    currentDays = dayColumns;

    // HEADER
    dayColumns.forEach(day => {

        const dayNumber = parseInt(day, 10);
        const style = getDayStyle(year, month, dayNumber);

        headerRow.innerHTML += `
            <th class="text-center" style="${style}">
                ${day}
            </th>`;
    });

    tableHead.appendChild(headerRow);

    // BODY
    data.forEach(row => {

        const tr = document.createElement("tr");
        //const skillGroup = row.SkillCategory ?? "N/A";
        const skillGroup = row.SkillCategory ?? "N/A";

        tr.innerHTML = `<td class="text-start">${skillGroup}</td>`;

        dayColumns.forEach(day => {

            const dayNumber = parseInt(day, 10);
            const val = Number(row[day] ?? 0);
            const style = getDayStyle(year, month, dayNumber);

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


// APPLY STD ROW
function applySTDToTable(stdData) {

    $("#pivotTableBody tr.std-row").remove();
    $("#pivotTableBody tr.lack-row").remove();

    currentSTD = stdData.values || {};

    let stdRow = `
        <tr class="std-row">
            <td class="text-start fw-bold text-success">
                STD
            </td>`;

    currentDays.forEach(day => {
        stdRow += `
            <td class="text-center fw-bold bg-light">
                ${currentSTD[day] ?? 0}
            </td>`;
    });

    stdRow += `</tr>`;
    $("#pivotTableBody").append(stdRow);

    applyLackingRow();
}

// ===============================
// APPLY LACKING / EXCESS ROW
// ===============================
function applyLackingRow() {

    let lackRow = `
        <tr class="lack-row">
            <td class="text-start fw-bold">
                Lacking / Excess
            </td>`;

    currentDays.forEach(day => {

        const actual = operatorValues[day] ?? 0;
        const std    = currentSTD[day] ?? 0;
        const diff   = actual - std;

        lackRow += `
            <td class="text-center fw-bold ${diff < 0 ? 'text-danger' : 'text-success'}">
                ${diff}
            </td>`;
    });

    lackRow += `</tr>`;
    $("#pivotTableBody").append(lackRow);
}

// ===============================
// FETCH STD FROM SERVER
// ===============================
function fetchSTD() {

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
            applySTDToTable(res.data);
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

    fetch("LineCount/UploadSTD", {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(res => {

        if (!res.success) {
            Swal.fire("Error", res.message, "error");
            return;
        }

        applySTDToTable(res.data);

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
    $("#pivotTableBody").html(`
        <tr>
            <td colspan="31" class="text-center">
                <div class="spinner-border text-primary" role="status"></div>
                <div>Loading line count...</div>
            </td>
        </tr>
    `);

    $.ajax({
        url: "LineCount/LineCount",
        method: "POST",
        dataType: "json",
        data: {
            month: $("#monthInput").val(),
            year: $("#yearInput").val(),
            shift: $("#shiftInput").val(),
            costCode: $("#costCodeInput").val()
        },
        success: function (res) {

            if (res.success && res.data1.length > 0) {
                loadCalendarAndRender(res.data1);
            } else {
                $("#pivotTableBody").html(`
                    <tr>
                        <td colspan="31" class="text-center text-muted">
                            No data found.
                        </td>
                    </tr>
                `);
            }
        },
        error: function (xhr, status, error) {
            $("#pivotTableBody").html(`
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