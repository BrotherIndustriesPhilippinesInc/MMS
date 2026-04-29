$(document).ready(function () {

    let attendanceChart = null;

    function buildAttendanceTable(data, calendarData) {

        const metricLabels = {
            'Register MP': 'Register MP',
            'Actual': 'Present (Actual)',
            'Absent': 'Absent',
            'MLCount': 'ML Count',
            'NWCount': 'NW Count (No Work)',
            'AbsentRate': 'Absent Rate'
        };

        let headerHTML = '<th rowspan="2">Metric / Day</th>';
        let subHeaderHTML = '';

        const today = new Date();
        const todayDay = today.getDate();
        const todayMonth = today.getMonth();
        const todayYear = today.getFullYear();

        const selectedMonth = parseInt($('#monthInput').val(), 10) - 1;
        const selectedYear = parseInt($('#yearInput').val(), 10);

        let todayColIndex = -1;
        const isCurrentMonth = (selectedMonth === todayMonth && selectedYear === todayYear);

        // ✅ CALENDAR MAP
        const calendarMap = {};
        if (calendarData && calendarData.length > 0) {
            calendarData.forEach(c => {
                const day = parseInt(c.day, 10);
                calendarMap[day] = c;
            });
        }

        // ✅ COLOR FUNCTION
        function getCalendarStyle(type) {
            switch (type) {
                case -1: return 'background-color:#ffffff';
                case 5: return 'background-color:#4caf50;color:white';
                case 3: return 'background-color:#f44336;color:white';
                case 4: return 'background-color:#2196f3;color:white';
                case 0: return 'background-color:#ffeb3b';
                default: return 'background-color:#ffffff';
            }
        }

        // ✅ ABSENT RATE CALC
        function computeAbsentRate(dayData) {
            let absent = parseFloat(dayData['Absent'] || 0);
            let ml = parseFloat(dayData['MLCount'] || 0);
            let register = parseFloat(dayData['Register MP'] || 0);

            if (register <= 0) return 0;

            return ((absent + ml) / register) * 100;
        }

        // ✅ FIND TODAY COLUMN
        if (isCurrentMonth) {

            data.forEach((dayData, index) => {
                const day = parseInt(dayData.MonthDay, 10);
                if (day === todayDay) {
                    todayColIndex = index;
                }
            });

            if (todayColIndex === -1) {
                todayColIndex = data.length - 1;
            }

            const actualColspan = todayColIndex + 1;
            const forecastColspan = data.length - actualColspan;

            headerHTML += `<th colspan="${actualColspan}" style="background-color:brown;color:white;text-align:center;">ACTUAL</th>`;

            if (forecastColspan > 0) {
                headerHTML += `<th colspan="${forecastColspan}" style="background-color:purple;color:white;text-align:center;">FORECASTED</th>`;
            }

        } else {
            headerHTML += `<th colspan="${data.length}" style="background-color:brown;color:white;text-align:center;">ACTUAL</th>`;
        }

        $('#headerRow').html(headerHTML);

        // ✅ SUB HEADER
        data.forEach((dayData) => {

            const day = parseInt(dayData.MonthDay, 10);
            const dateObj = new Date(selectedYear, selectedMonth, day);

            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayName = dayNames[dateObj.getDay()];

            let style = '';

            if (calendarMap[day]) {
                style = getCalendarStyle(calendarMap[day].type);
            }

            subHeaderHTML += `<th style="${style}">${dayName}<br>${day}</th>`;
        });

        $('#subHeaderRow').html(subHeaderHTML);

        // ✅ BODY
        let bodyHTML = '';

        for (const [key, label] of Object.entries(metricLabels)) {

            let row = `<tr><td class="fw-bold">${label}</td>`;

            data.forEach((dayData, index) => {

                let value = dayData[key];
                let styles = [];

                const day = parseInt(dayData.MonthDay, 10);
                const calendar = calendarMap[day];

                // 🎨 APPLY COLOR
                if (calendar) {
                    styles.push(getCalendarStyle(calendar.type));
                }

                // 🔥 ABSENT RATE LOGIC
                if (key === 'AbsentRate') {

                    let rate = 0;

                    // ❌ NOT working day → 0
                    if (calendar && calendar.type == -1) {

                        // ACTUAL
                        if (!isCurrentMonth || index <= todayColIndex) {
                            rate = computeAbsentRate(dayData);
                        }
                        // FORECAST
                        else {

                            let total = 0;
                            let count = 0;

                            for (let i = index - 1; i >= 0 && count < 10; i--) {

                                const prevDay = parseInt(data[i].MonthDay, 10);
                                const prevCal = calendarMap[prevDay];

                                if (prevCal && prevCal.type == -1) {
                                    total += computeAbsentRate(data[i]);
                                    count++;
                                }
                            }

                            if (count > 0) {
                                rate = total / count;
                            }
                        }
                    }

                    value = rate.toFixed(2) + '%';
                }
                else if (value == null) {
                    value = '0';
                }
                else if ($.isNumeric(value)) {
                    value = parseInt(value, 10);
                }

                // ✅ TODAY HIGHLIGHT (no override)
                if (isCurrentMonth && index === todayColIndex) {
                    styles.push('outline:2px solid #2e7d32;font-weight:bold');
                }

                row += `<td style="${styles.join(';')}">${value}</td>`;
            });

            row += '</tr>';
            bodyHTML += row;
        }

        $('#tableBody').html(bodyHTML);
        Swal.close();
    }

    // ✅ VIEW TOGGLE
    $('#viewToggle').on('change', function () {
        if ($(this).is(':checked')) {
            $('#graphView').removeClass('d-none');
            $('#attendanceTable').closest('.card').addClass('d-none');
        } else {
            $('#graphView').addClass('d-none');
            $('#attendanceTable').closest('.card').removeClass('d-none');
        }
    });

    // ✅ BUTTON
    $('#insertPivotBtn').on('click', function () {

        const monthVal = $('#monthInput').val();
        const yearVal = $('#yearInput').val();
        const shiftVal = $('#shiftInput').val();
        const costCodeVal = $('#costCodeInput').val();

        if (!monthVal || !yearVal || !shiftVal || !costCodeVal) {
            Swal.fire('Error', 'Please fill in all required fields.', 'error');
            return;
        }

        const $btn = $(this);
        $btn.prop('disabled', true).text('Processing...');

        $('#headerRow').html('');

        // 🔹 SHOW LOADING INSIDE TBODY
        $('#tableBody').html(`
        <tr>
            <td colspan="100%" class="text-center">
                <div class="spinner-border text-primary" role="status"></div>
                <div>Loading attendance...</div>
            </td>
        </tr>
    `);

        $.ajax({
            url: 'Attendance/GetCalendar',
            method: 'GET',
            data: { month: monthVal, year: yearVal },
            dataType: 'json',
            success: function (calendarData) {

                $.ajax({
                    url: 'Attendance/GetAttendanceCount',
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        month: monthVal,
                        year: yearVal,
                        shift: shiftVal,
                        costCode: costCodeVal
                    },
                    success: function (response) {

                        if (response.success && response.data.length > 0) {
                            buildAttendanceTable(response.data, calendarData);
                        } else {
                            $('#tableBody').html(`
                            <tr>
                                <td colspan="100%" class="text-center text-muted">
                                    No attendance data found.
                                </td>
                            </tr>
                        `);
                        }
                    },
                    error: function () {
                        $('#tableBody').html(`
                        <tr>
                            <td colspan="100%" class="text-center text-danger">
                                Error loading data.
                            </td>
                        </tr>
                    `);
                    },
                    complete: function () {
                        $btn.prop('disabled', false).text('Load');
                    }
                });

            },
            error: function () {
                $('#tableBody').html(`
                <tr>
                    <td colspan="100%" class="text-center text-danger">
                        Failed to fetch calendar data.
                    </td>
                </tr>
            `);
                $btn.prop('disabled', false).text('Load');
            }
        });

    });

});
// function buildAttendanceChart(data) {

//         const labels = [];
//         const registerMP = [];
//         const present = [];
//         const lacking = [];
//         const mlCount = [];
//         const nwCount = [];

//         data.forEach(d => {
//             labels.push(d.MonthDay);
//             registerMP.push(d["Register MP"]);
//             present.push(d.Actual);
//             lacking.push(d.Lacking);
//             mlCount.push(d.MLCount);
//             nwCount.push(d.NWCount);
//         });

//         const ctx = document.getElementById('attendanceChart').getContext('2d');

//         if (attendanceChart) attendanceChart.destroy();

//         attendanceChart = new Chart(ctx, {
//             data: {
//                 labels: labels,
//                 datasets: [
//                     {
//                         type: 'bar',
//                         label: 'Register MP',
//                         data: registerMP,
//                         backgroundColor: '#6c757d',
//                         stack: 'stack1'
//                     },
//                     {
//                         type: 'bar',
//                         label: 'Present (Actual)',
//                         data: present,
//                         backgroundColor: '#198754',
//                         stack: 'stack1'
//                     },
//                     {
//                         type: 'bar',
//                         label: 'Lacking',
//                         data: lacking,
//                         backgroundColor: '#dc3545',
//                         stack: 'stack1'
//                     },
//                     {
//                         type: 'bar',
//                         label: 'ML Count',
//                         data: mlCount,
//                         backgroundColor: '#0d6efd',
//                         stack: 'stack1'
//                     },
//                     {
//                         type: 'bar',
//                         label: 'NW Count (No Work)',
//                         data: nwCount,
//                         backgroundColor: '#ffc107',
//                         stack: 'stack1'
//                     }
//                 ]
//             },
//             options: {
//                 responsive: true,
//                 interaction: { mode: 'index', intersect: false },
//                 scales: {
//                     x: { stacked: true },
//                     y: {
//                         stacked: true,
//                         title: { display: true, text: 'Manpower Count' }
//                     }
//                 },
//                 plugins: { legend: { position: 'top' } }
//             }
//         });
//     }

    $('#viewToggle').on('change', function () {
        if ($(this).is(':checked')) {
            $('#graphView').removeClass('d-none');
            $('#attendanceTable').closest('.card').addClass('d-none');
        } else {
            $('#graphView').addClass('d-none');
            $('#attendanceTable').closest('.card').removeClass('d-none');
        }
    });


// $(document).ready(function () {
//     loadAbsentRate();
// });<script>
// $(document).ready(function () {
    
// });

function loadAbsentRateSmall() {
    $.ajax({
        url: "Controller/std_class.php?action=get_absentrate", // adjust path
        method: "GET",
        dataType: "json",
        success: function (res) {
            if (!res.success) {
                console.error(res.error);
                return;
            }
            renderAbsentRateCardsSmall(res.data);
        },
        error: function (xhr) {
            console.error(xhr.responseText);
        }
    });
}

function renderAbsentRateCardsSmall(data) {
    const container = $("#absentRateContainerSmall");
    container.empty();

    if (!data || data.length === 0) {
        container.append(`<div class="col-12 text-center">No data available</div>`);
        return;
    }

    data.forEach(row => {
        const rate = parseFloat(row.AbsentRate || 0).toFixed(2);
        const progressWidth = Math.min(rate, 100);

        const card = `
        <div class="col-xl-3 col-lg-4 col-md-6 col-sm-12 mb-2">
            <div class="card text-dark bg-light small-card">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong>${row.GroupSection}</strong>
                        <span class="small">${rate}%</span>
                    </div>
                    <div class="progress mb-1" style="height:6px;">
                        <div class="progress-bar bg-info" role="progressbar"
                             style="width:${progressWidth}%"
                             aria-valuenow="${progressWidth}" aria-valuemin="0" aria-valuemax="100">
                        </div>
                    </div>
                    <div class="small text-muted">
                        Reg: ${row.RegisterMP} | Pres: ${row.Present} | Abs: ${row.Absent}
                    </div>
                </div>
            </div>
        </div>`;
        
        container.append(card);
    });
}

