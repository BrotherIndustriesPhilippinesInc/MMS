let savedForecasts = [];

$(document).ready(function () {

    let attendanceChart = null;

    let cachedAttendanceData = [];
    let cachedCalendarData = [];

    function getSelectedFilter() {
        if ($('#direct_filter').is(':checked')) return 'DIRECT';
        if ($('#kit_filter').is(':checked')) return 'KIT';
        if ($('#mso_filter').is(':checked')) return 'MSO';
        return 'ALL';
    }




    function buildAttendanceTable(data, calendarData) {

        const filter = getSelectedFilter();
        let metricLabels = {};

        if (filter === 'DIRECT') {
            metricLabels = {
                'Registered_Direct': 'Register MP (Direct)',
                'Direct_Actual': 'Present (Direct)',
                'Direct_AB_Count': 'Absent (Direct)',
                'Direct_ML_Count': 'ML Count (Direct)',
                'Direct_NW_Count': 'NW Count (Direct)'
            };
        }
        else {

            metricLabels = {
                'Register MP': 'Register MP',
                'Actual': 'Present (Actual)',
                'Absent': 'Absent',
                'RS_Count': 'RS (Resigned)',
                'ML_Count': 'ML Count',
                'NW_Count': 'NW Count (No Work)',
                'AbsentRate': 'Absent Rate'
              
            };
        }

    
        //let headerHTML = '<th rowspan="2">Metric / Day</th>';
        let headerHTML = `
                <th rowspan="2"
                    style="
                        position:sticky;
                        left:0;
                        z-index:10;
                        background:#f8f9fa;
                        min-width:180px;
                    ">
                    Metric / Day
                </th>`;
        let subHeaderHTML = '';

        const today = new Date();
        const todayDay = today.getDate();
        const todayMonth = today.getMonth();
        const todayYear = today.getFullYear();

        const selectedMonth = parseInt($('#monthInput').val(), 10) - 1;
        const selectedYear = parseInt($('#yearInput').val(), 10);

        const forecastMatrix = [
            {
                forecastStart: new Date(selectedYear, 5, 9),
                forecastEnd: new Date(selectedYear, 5, 11),
                historyStart: new Date(selectedYear, 4, 11),
                historyEnd: new Date(selectedYear, 4, 22)
            },
            {
                forecastStart: new Date(selectedYear, 5, 15),
                forecastEnd: new Date(selectedYear, 5, 19),
                historyStart: new Date(selectedYear, 4, 18),
                historyEnd: new Date(selectedYear, 4, 29)
            },
            {
                forecastStart: new Date(selectedYear, 5, 22),
                forecastEnd: new Date(selectedYear, 5, 26),
                historyStart: new Date(selectedYear, 4, 25),
                historyEnd: new Date(selectedYear, 5, 5)
            },
            {
                forecastStart: new Date(selectedYear, 5, 29),
                forecastEnd: new Date(selectedYear, 6, 3),
                historyStart: new Date(selectedYear, 5, 1),
                historyEnd: new Date(selectedYear, 5, 12)
            },
            {
                forecastStart: new Date(selectedYear, 6, 6),  
                forecastEnd: new Date(selectedYear, 6, 10),   
                historyStart: new Date(selectedYear, 5, 8),     
                historyEnd: new Date(selectedYear, 5, 19)     
            },
            {
                forecastStart: new Date(selectedYear, 6, 13),  
                forecastEnd: new Date(selectedYear, 6, 17),  
                historyStart: new Date(selectedYear, 5, 15),
                historyEnd: new Date(selectedYear, 5, 26)
            }

         
        ];

        let todayColIndex = -1;
        const isCurrentMonth = (selectedMonth === todayMonth && selectedYear === todayYear);

        const calendarMap = {};

        calendarData.forEach(c => {

            const key =
                c.Month + "_" + parseInt(c.day, 10);

            calendarMap[key] = c;
        });

          function saveForecast(month, day, value, metric) {

            $.post('Attendance/SaveForecast', {
                year: selectedYear,
                month: month,
                day: day,
                metricName: metric,
                forecastValue: value
            });
        }

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

        function computeAbsentRate(dayData) {
            let absent = parseFloat(dayData['Absent'] || 0);
            let ml = parseFloat(dayData['ML_Count'] || 0);
            let register = parseFloat(dayData['Register MP'] || 0);

            if (register <= 0) return 0;

            return ((absent + ml) / register) * 100;
        }

        // FIND TODAY COLUMN
        if (isCurrentMonth) {

            data.forEach((dayData, index) => {

                const day = parseInt(dayData.MonthDay, 10);
                const month = parseInt(dayData.Month, 10) - 1;

                if (
                    day === todayDay &&
                    month === todayMonth
                ) {
                    todayColIndex = index;
                }
            });

            if (todayColIndex === -1) {
                todayColIndex = data.length - 1;
            }

            const actualColspan = todayColIndex + 1;
            const forecastColspan = data.length - actualColspan;

            headerHTML += `
        <th colspan="${actualColspan}"
            style="background-color:brown;color:white;text-align:center;">
            ACTUAL
        </th>`;

            if (forecastColspan > 0) {
                headerHTML += `
            <th colspan="${forecastColspan}"
                style="background-color:purple;color:white;text-align:center;">
                FORECASTED
            </th>`;
            }
        } else {
            headerHTML += `<th colspan="${data.length}" style="background-color:brown;color:white;text-align:center;">ACTUAL</th>`;
        }



          function computeForecastMetric(metricName) {

            const history = [];

            for (let i = todayColIndex; i >= 0; i--) {

                const dayData = data[i];

                const day = parseInt(dayData.MonthDay, 10);

                const calendarKey =
                    dayData.Month + "_" + day;

                const calendar =
                    calendarMap[calendarKey];

                if (!calendar)
                    continue;

                // Only use normal working days
                if (calendar.type !== -1)
                    continue;

                const value =
                    parseFloat(dayData[metricName] || 0);

                history.push(value);

                if (history.length >= 10)
                    break;
            }

            if (history.length === 0)
                return 0;

            return history.reduce((a, b) => a + b, 0) /
                history.length;
        }
        function getForecastValue(metricName, forecastDate) {

            const matrix = forecastMatrix.find(m =>
                forecastDate >= m.forecastStart &&
                forecastDate <= m.forecastEnd
            );

            if (!matrix)
                return 0;

            const values = [];

            data.forEach(dayData => {

                const dataDate = new Date(
                    selectedYear,
                    parseInt(dayData.Month) - 1,
                    parseInt(dayData.MonthDay)
                );

                if (
                    dataDate >= matrix.historyStart &&
                    dataDate <= matrix.historyEnd
                ) {

                    const day =
                        parseInt(dayData.MonthDay, 10);

                    const calendarKey =
                        dayData.Month + "_" + day;

                    const calendar =
                        calendarMap[calendarKey];

                    // Only include normal working days
                    if (!calendar)
                        return;

                    if (calendar.type !== -1)
                        return;

                    const value =
                        parseFloat(dayData[metricName] || 0);

                    values.push(value);
                }
            });

            if (values.length === 0)
                return 0;

            return values.reduce((a, b) => a + b, 0)
                / values.length;
        }

        function getForecastAbsentRate(forecastDate) {

            const forecastAbsent =
                getForecastValue(
                    'Absent',
                    forecastDate
                );

            const forecastML =
                getForecastValue(
                    'ML_Count',
                    forecastDate
                );

            const forecastRegister =
                getForecastValue(
                    'Register MP',
                    forecastDate
                );

            if (
                forecastRegister <= 0
            ) {
                return null;
            }

            return (
                (
                    forecastAbsent +
                    forecastML
                ) /
                forecastRegister
            ) * 100;
        }

        //const forecastAbsentRate =
        //    getForecastValue();
        //const forecastAbsentRate = 0;


        const forecastPresent =
            computeForecastMetric('Actual');

        const forecastAbsent =
            computeForecastMetric('Absent');

        const forecastRS =
            computeForecastMetric('RS_Count');

        $('#headerRow').html(headerHTML);

        data.forEach((dayData) => {

            const day = parseInt(dayData.MonthDay, 10);

            const actualMonth =
                parseInt(dayData.Month, 10) - 1;

            const dateObj =
                new Date(
                    selectedYear,
                    actualMonth,
                    day
                );

            const dayNames =
                ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            const dayName =
                dayNames[dateObj.getDay()];

            const displayLabel =
                dayData.DisplayDay || day;

            let style = '';

            const calendarKey =
                dayData.Month + "_" + day;

            if (calendarMap[calendarKey]) {
                style =
                    getCalendarStyle(
                        calendarMap[calendarKey].type
                    );
            }

            subHeaderHTML += `
        <th style="${style}">
            ${displayLabel}
            <br>
            ${dayName}
        </th>
    `;
        });

        $('#subHeaderRow').html(subHeaderHTML);

        // BODY
        let bodyHTML = '';


        for (const [key, label] of Object.entries(metricLabels)) {

            //let row = `<tr><td class="fw-bold">${label}</td>`;
            //let row = `<tr><td class="fw-bold metric-column">${label}</td>`;
            let row = `<tr><td class="fw-bold metric-column metric-label" data-metric="${key}">${label}</td>`;

            data.forEach((dayData, index) => {
                const todayRegisterMP =
                    todayColIndex >= 0
                        ? parseFloat(
                            data[todayColIndex]['Register MP'] || 0
                        )
                        : 0;

                if (key === 'ForecastedAbsentRate') {

                    let value = '';

                    if (isCurrentMonth && index > todayColIndex) {

                        //value =
                        //    forecastAbsentRate.toFixed(2) + '%';
                        value =
                            forecastAbsentRate >= 100
                                ? '-'
                                : forecastAbsentRate.toFixed(2) + '%';

                    } else {

                        value = '-';
                    }

                    row += `<td>${value}</td>`;
                    return;
                }

                //let value = dayData[key];
                let value = dayData[key];

                if (isCurrentMonth && index > todayColIndex) {

                    const forecastDate = new Date(
                        selectedYear,
                        parseInt(dayData.Month) - 1,
                        parseInt(dayData.MonthDay)
                    );

                    const savedForecast = savedForecasts.find(x =>
                        parseInt(x.Month) === parseInt(dayData.Month) &&
                        parseInt(x.Day) === parseInt(dayData.MonthDay)
                    );

                    if (savedForecast) {

    //const forecastRate =
    //    parseFloat(savedForecast.ForecastRate);

    //const forecastRate = parseFloat(savedForecast.ForecastedData);

    //const forecastAbsent =
    //    (forecastRate / 100) * todayRegisterMP;

                        //value = Math.round(todayRegisterMP - forecastAbsent);
    const forecastRate = parseFloat(savedForecast.ForecastRate);

    const forecastAbsent = Math.round(todayRegisterMP * (forecastRate / 100));

    value = todayRegisterMP - forecastAbsent;
    }

                    if (key === 'Actual') {

                        //if (savedForecast) {

                        //    value =
                        //        parseInt(savedForecast.ForecastedData);
                        //}

                            if (savedForecast) {

                                const forecastRate = parseFloat(savedForecast.ForecastRate);

                                const forecastAbsent = Math.round(
                                    todayRegisterMP * (forecastRate / 100)
                                );

                                value = todayRegisterMP - forecastAbsent;
                            }
                        else {

                            const forecastRate =
                                getForecastAbsentRate(
                                    forecastDate
                                );

                            const forecastAbsent =
                                forecastRate == null
                                    ? 0
                                    : ((forecastRate / 100) * todayRegisterMP);

                            value =
                                Math.round(
                                    todayRegisterMP - forecastAbsent
                                );

                            saveForecast(
                                parseInt(dayData.Month),
                                parseInt(dayData.MonthDay),
                                forecastRate,
                                'AbsentRate'    
                            );

                         
                        }
                    }
                 
                    else if (key === 'Absent') {

                        const forecastRate =
                            getForecastAbsentRate(
                                forecastDate
                            );

                        value =
                            forecastRate == null
                                ? 0
                                : Math.round(
                                    (forecastRate / 100) *
                                    todayRegisterMP
                                );
                    }
                
                    else if (key === 'RS_Count') {

                        value = Math.round(
                            getForecastValue(
                                'RS_Count',
                                forecastDate
                            )
                        );

                    }
                }
                let styles = [];
                const day = parseInt(dayData.MonthDay, 10);

                const calendarKey =
                    dayData.Month + "_" + day;

                const calendar =
                    calendarMap[calendarKey];

                if (calendar) {
                    styles.push(getCalendarStyle(calendar.type));
                }
                if (key === 'AbsentRate') {

                    let rate =
                        computeAbsentRate(dayData);

                    value =
                        rate >= 100
                            ? '-'
                            : rate.toFixed(2) + '%';
                }
                else if (value == null) {
                    value = '0';
                }
                else if ($.isNumeric(value)) {
                    value = parseInt(value, 10);
                }

                if (isCurrentMonth && index === todayColIndex) {
                    styles.push('outline:2px solid #2e7d32;font-weight:bold');
                }

                // ✅ ABSENT BREAKDOWN (FIXED FOR DIRECT)
                if (key === 'Absent' || key === 'Direct_AB_Count') {

                    const ab = (filter === 'DIRECT')
                        ? parseInt(dayData['Direct_AB_Count'] || 0)
                        : parseInt(dayData['AB_Count'] || 0);

                    const sl = parseInt(dayData['SL_Count'] || 0);
                    const vl = parseInt(dayData['VL_Count'] || 0);

                    row += `
                        <td style="${styles.join(';')}">
                            <div class="absent-cell text-danger" style="cursor:pointer;font-weight:bold;">
                                ${value}
                            </div>

                            <div class="absent-breakdown d-none mt-1" style="font-size:11px;">
                                AB: ${ab} <br>
                                SL: ${sl} <br>
                                VL: ${vl}
                            </div>
                        </td>
                    `;
                } else {
                    row += `<td style="${styles.join(';')}">${value}</td>`;
                }

            });

            row += '</tr>';
            bodyHTML += row;
        }

        let forecastRow =
            `<tr>
                <td class="fw-bold text-primary">
                    Forecasted Absent Rate
                </td>`;

        data.forEach((dayData, index) => {

            let value = '';


            if (index > todayColIndex) {

            

                //value =
                //    forecastAbsentRate.toFixed(2) + '%';
                const forecastDate =
                    new Date(
                        selectedYear,
                        parseInt(dayData.Month) - 1,
                        parseInt(dayData.MonthDay)
                    );

                //const forecastRate =
                //    getForecastAbsentRate(
                //        forecastDate
                //    );
                const savedForecast = savedForecasts.find(x =>
                    parseInt(x.Month) === parseInt(dayData.Month) &&
                    parseInt(x.Day) === parseInt(dayData.MonthDay)
                );

                const forecastRate = savedForecast
                    ? parseFloat(savedForecast.ForecastRate)
                    : getForecastAbsentRate(forecastDate);

                value =
                    forecastRate == null
                        ? ''
                        : forecastRate >= 100
                            ? '-'
                            : forecastRate.toFixed(2) + '%';
            }

            forecastRow += `
        <td style="font-weight:bold;color:#6a1b9a;">
            ${value}
        </td>`;
        });

        forecastRow += '</tr>';

        bodyHTML += forecastRow;

        let forecastPresentRow = `
<tr>
    <td class="fw-bold text-success">
        Forecasted Present
    </td>`;

        data.forEach((dayData, index) => {

            let value = '';

            if (index > todayColIndex) {

                //value =
                //    Math.round(forecastPresent);
                const forecastDate =
                    new Date(
                        selectedYear,
                        parseInt(dayData.Month) - 1,
                        parseInt(dayData.MonthDay)
                    );

                value =
                    Math.round(
                        getForecastValue(
                            'Actual',
                            forecastDate
                        )
                    );
            }

            forecastPresentRow += `
        <td style="font-weight:bold;color:green;">
            ${value}
        </td>`;
        });

        forecastPresentRow += '</tr>';



        //bodyHTML += forecastPresentRow;

        let forecastAbsentRow = `
<tr>
    <td class="fw-bold text-danger">
        Forecasted Absent
    </td>`;

        data.forEach((dayData, index) => {

            let value = '';

            if (index > todayColIndex) {
                const forecastDate =
                    new Date(
                        selectedYear,
                        parseInt(dayData.Month) - 1,
                        parseInt(dayData.MonthDay)
                    );

                value =
                    Math.round(
                        getForecastValue(
                            'Absent',
                            forecastDate
                        )
                    );
            }

            forecastAbsentRow += `
        <td style="font-weight:bold;color:red;">
            ${value}
        </td>`;
        });

        forecastAbsentRow += '</tr>';

        //bodyHTML += forecastAbsentRow;

        let forecastRSRow = `
            <tr>
                <td class="fw-bold text-warning">
                    Forecasted RS
                </td>`;

        data.forEach((dayData, index) => {

            let value = '';

            if (index > todayColIndex) {

                const forecastDate =
                    new Date(
                        selectedYear,
                        parseInt(dayData.Month) - 1,
                        parseInt(dayData.MonthDay)
                    );

                value =
                    Math.round(
                        getForecastValue(
                            'RS_Count',
                            forecastDate
                        )
                    );
            }

            forecastRSRow += `
        <td style="font-weight:bold;color:#ff9800;">
            ${value}
        </td>`;
        });

        forecastRSRow += '</tr>';


        $('#tableBody').html(bodyHTML);
        Swal.close();
    }
    $(document).off('click', '.absent-cell').on('click', '.absent-cell', function () {
        $(this).siblings('.absent-breakdown').toggleClass('d-none');
    });

    $(document).off('click', '.metric-label').on('click', '.metric-label', function () {

        const metric =
            $(this).data('metric');

        if (
            metric !== 'Absent' &&
            metric !== 'Direct_AB_Count'
        ) {
            return;
        }

        const hasHidden =
            $('.absent-breakdown.d-none').length > 0;

        if (hasHidden) {
            $('.absent-breakdown').removeClass('d-none');
        } else {
            $('.absent-breakdown').addClass('d-none');
        }

    });

    $('.filter-container input[type="checkbox"]').on('change', function () {

        $('.filter-container input').not(this).prop('checked', false);

        if (cachedAttendanceData.length > 0) {
            buildAttendanceTable(cachedAttendanceData, cachedCalendarData);
        }
    });

    $('#insertPivotBtn').on('click', function () {

        const yearVal = $('#yearInput').val();
        const shiftVal = $('#shiftInput').val();
        const costCodeVal = $('#costCodeInput').val();

        if (!yearVal || !shiftVal || !costCodeVal) {
            Swal.fire('Error', 'Please fill in all required fields.', 'error');
            return;
        }


        $.ajax({
            url: 'Attendance/GetForecast',
            type: 'GET',
            data: {
                year: yearVal
            },
            async: false,
            success: function (res) {
                savedForecasts = res;
            }
        });

        const $btn = $(this);

        $btn.prop('disabled', true).text('Processing...');

        $('#headerRow').html('');

        $('#tableBody').html(`
        <tr>
            <td colspan="100%" class="text-center">
                <div class="spinner-border text-primary"></div>
                <div>Loading attendance...</div>
            </td>
        </tr>
    `);

        const monthsToLoad = [5, 6, 7, 8]; 

        let allAttendanceData = [];
        let allCalendarData = [];
        let completedRequests = 0;
        let totalRequests = monthsToLoad.length * 2;

        monthsToLoad.forEach(function (month) {

            // CALENDAR
            $.ajax({
                url: 'Attendance/GetCalendar',
                method: 'GET',
                data: {
                    month: month,
                    year: yearVal
                },
                dataType: 'json',
                success: function (calendarData) {

                    calendarData.forEach(c => {
                        c.Month = month;
                    });

                    allCalendarData =
                        allCalendarData.concat(calendarData);
                },
                complete: function () {

                    completedRequests++;

                    if (completedRequests === totalRequests) {
                        finishLoading();
                    }
                }
            });

            $.ajax({
                url: 'Attendance/GetAttendanceCount',
                method: 'POST',
                dataType: 'json',
                data: {
                    month: month,
                    year: yearVal,
                    shift: shiftVal,
                    costCode: costCodeVal
                },
                success: function (attendanceRes) {

                    if (attendanceRes.success &&
                        attendanceRes.data &&
                        attendanceRes.data.length > 0) {

                        attendanceRes.data.forEach(row => {

                            row.Month = month;

                            const monthName =
                                new Date(yearVal, month - 1, 1)
                                    .toLocaleString('default', {
                                        month: 'short'
                                    });

                            row.DisplayDay =
                                monthName + '-' + row.MonthDay;
                        });

                        allAttendanceData =
                            allAttendanceData.concat(
                                attendanceRes.data
                            );
                    }
                },
                complete: function () {

                    completedRequests++;

                    if (completedRequests === totalRequests) {
                        finishLoading();
                    }
                }
            });

        });

      

        function finishLoading() {

            allAttendanceData.sort(function (a, b) {

                if (a.Month !== b.Month) {
                    return a.Month - b.Month;
                }

                return parseInt(a.MonthDay) -
                    parseInt(b.MonthDay);
            });

            cachedAttendanceData = allAttendanceData;
            cachedCalendarData = allCalendarData;

            buildAttendanceTable(
                cachedAttendanceData,
                cachedCalendarData
            );

            $btn.prop('disabled', false).text('Load');
        }

    });


    $("#btnSaveForecast").click(function () {

        const dateFrom = $("#date_from").val();
        const dateTo = $("#date_to").val();
        const percent = $("#forecast_percent").val();

        if (!dateFrom || !dateTo || percent === "") {

            Swal.fire(
                "Validation",
                "Please complete all fields.",
                "warning"
            );

            return;
        }

        $.ajax({

            url: "Attendance/SaveForecastRange",
            type: "POST",

            data: {

                dateFrom: dateFrom,
                dateTo: dateTo,
                forecastRate: percent
            },

            success: function (res) {

                if (!res.success) {

                    Swal.fire(
                        "Error",
                        res.message,
                        "error"
                    );

                    return;
                }

                //-----------------------------------
                // Update local forecast collection
                //-----------------------------------

                const start = new Date(dateFrom);
                const end = new Date(dateTo);

                for (
                    let d = new Date(start);
                    d <= end;
                    d.setDate(d.getDate() + 1)
                ) {

                    const month = d.getMonth() + 1;
                    const day = d.getDate();

                    let existing = savedForecasts.find(x =>

                        parseInt(x.Month) === month &&
                        parseInt(x.Day) === day
                    );

                    if (existing) {

                        //existing.ForecastedData = percent;
                        //existing.ForecastedData = parseFloat(percent);
                        existing.ForecastRate = parseFloat(percent);
                    }
                    else {

                        savedForecasts.push({ Month: month, Day: day, ForecastRate: parseFloat(percent) });
                    }
                }

                // redraw table only
                buildAttendanceTable(
                    cachedAttendanceData,
                    cachedCalendarData
                );

                bootstrap.Modal
                    .getInstance(document.getElementById("forcastinput"))
                    .hide();

                Swal.fire(
                    "Saved!",
                    "Forecast updated.",
                    "success"
                );

            }

        });

    });

});
