let awolChart;

function loadAwolRateChart(monthVal, yearVal, shiftVal, costCodeVal) {
    fetch('controller/awolrate.php?action=get_awolRate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
              month: monthVal,
              year: yearVal,
              shift: shiftVal,
              costCode: costCodeVal
        })
    })
    .then(res => res.json())
    .then(res => {
        if (!res.success) return;
        renderAwolChart(res.data1);
    });
}
function renderAwolChart(data) {

    /* ===============================
       Normalize dates safely
       =============================== */
    const parsedData = data.map(d => {
        const dateStr = d.DayMonth.date ?? d.DayMonth;
        const dateObj = new Date(dateStr);

        return {
            day: dateObj.getDate(),
            status: d.Status.toUpperCase(),
            count: Number(d.HeadCount)
        };
    });

    const days = [...new Set(parsedData.map(d => d.day))].sort((a,b)=>a-b);

    const inactive = [];
    const awol = [];
    const resigned = [];
    const rate = [];

    days.forEach(day => {

        const getCount = status =>
            parsedData.find(d => d.day === day && d.status === status)?.count ?? 0;

        const i = getCount('INACTIVE');
        const a = getCount('AWOL');
        const r = getCount('RESIGNED');

        inactive.push(i);
        awol.push(a);
        resigned.push(r);

        const total = i + a + r;
        rate.push(total ? ((a + r) / total * 100).toFixed(2) : 0);
    });

    if (awolChart) awolChart.destroy();

    awolChart = new Chart(document.getElementById('awolRateChart'), {
        type: 'bar',
        data: {
            labels: days.map(d => `${d}`),
            datasets: [
                {
                    label: 'Inactive',
                    data: inactive,
                    backgroundColor: '#7cb342'
                },
                {
                    label: 'AWOL',
                    data: awol,
                    backgroundColor: '#ff7043'
                },
                {
                    label: 'Resigned',
                    data: resigned,
                    backgroundColor: '#6a1b3f'
                },
                {
                    label: 'AWOL/Resigned Rate',
                    type: 'line',
                    data: rate,
                    borderColor: '#1e88e5',
                    yAxisID: 'y1',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' },
                datalabels: {
                    color: 'red',
                    anchor: 'end',
                    align: 'top',
                    formatter: v => v > 0 ? v : ''
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Headcount' }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Rate (%)' }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}
