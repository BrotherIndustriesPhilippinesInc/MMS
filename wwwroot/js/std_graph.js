let weeklyChart;

document.getElementById("get_attendance").addEventListener("click", () => {
    fetchWeeklyAbsentRate();
});

function fetchWeeklyAbsentRate() {
    const month = document.getElementById("monthfilter").value;
    const week  = document.getElementById("weekInput").value;
    const shift = document.getElementById("shiftfilter").value;
    const costCode = document.getElementById("costCodefilter").value;

    fetch("Controller/std_classGraph.php?action=get_graph", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ month, week, shift, costCode })
    })
    .then(res => res.json())
    .then(res => {
        if (!res.success) {
            alert("Failed to load data");
            return;
        }
        buildGroupedBarChart(res.data);
    });
}

function buildGroupedBarChart(data) {
    const grouped = {}; // { 2025: [0,0,...], 2024: [0,0,...] }
    data.forEach(row => {
        const dateObj = new Date(row.Date);
        const year = dateObj.getFullYear();
        const weekday = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        const weekDayIndex = weekday === 0 ? 7 : weekday; // convert Sunday to 7

        if (!grouped[year]) grouped[year] = Array(7).fill(0);
        grouped[year][weekDayIndex - 1] = row.AbsentRate;
    });

    const labels = ["1","2","3","4","5","6","7"];

    const colors = ["#dc3545", "#0d6efd", "#198754", "#ffc107", "#6f42c1"];
    const datasets = Object.keys(grouped).sort((a,b)=>b-a).map((year, idx) => ({
        label: ` ${year}`,
        data: grouped[year],
        backgroundColor: colors[idx % colors.length]
    }));

    if (weeklyChart) weeklyChart.destroy();

    weeklyChart = new Chart(document.getElementById("weeklyChart"), {
        type: "bar",
        data: {
            labels, // x-axis weekdays
            datasets
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.raw}%`
                    }
                }
            },
            scales: {
                x: {
                    stacked: false,
                    title: { display: true, text: "Week Day" },
                    // For clustering multiple years per weekday
                    ticks: { autoSkip: false }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: "Absent Rate (%)" }
                }
            }
        }
    });
}