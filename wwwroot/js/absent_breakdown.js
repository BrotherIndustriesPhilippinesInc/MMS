
function loadAbsentBreakdown(month, year, shift, costCode) {

    fetch('controller/absentbreakdown.php?action=get_absentBreakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            month, year, shift, costCode
        })
    })
    .then(res => res.json())
    .then(res => {
        if (!res.success) {
            console.error(res);
            return;
        }
        renderAbsentPivot(res.data1);
    })
    .catch(err => console.error(err));
}
function renderAbsentPivot(data) {

    const headerRow = document.getElementById('absentheaderRow');
    const tbody = document.getElementById('absenttableBody');

    headerRow.innerHTML = '';
    tbody.innerHTML = '';

    /* ----------------------------
       1. Extract DAY safely
    ---------------------------- */
    const getDay = (dateVal) => {
        if (!dateVal) return null;

        // SQL Server format: "2025-12-01 00:00:00.000"
        if (typeof dateVal === 'string') {
            return parseInt(dateVal.substring(8, 10), 10);
        }

        // sqlsrv sometimes returns object
        if (typeof dateVal === 'object' && dateVal.date) {
            return parseInt(dateVal.date.substring(8, 10), 10);
        }

        return null;
    };

    /* ----------------------------
       2. Collect unique days
    ---------------------------- */
    const days = [...new Set(
        data.map(d => getDay(d.DateSet)).filter(d => !isNaN(d))
    )].sort((a, b) => a - b);


    const leaveTypes = [...new Set(data.map(d => d.LeaveType))];

    const map = {};
    data.forEach(d => {
        const day = getDay(d.DateSet);
        if (day === null) return;

        if (!map[d.LeaveType]) map[d.LeaveType] = {};
        map[d.LeaveType][day] = d.HeadCount;
    });

    headerRow.innerHTML = `<th>Leave Type</th>`;
    days.forEach(day => {
        headerRow.innerHTML += `<th class="text-center">${day}</th>`;
    });


    leaveTypes.forEach(type => {
        let row = `<tr><td><strong>${type}</strong></td>`;
        days.forEach(day => {
            row += `<td class="text-center">${map[type]?.[day] ?? 0}</td>`;
        });
        row += `</tr>`;
        tbody.innerHTML += row;
    });
}