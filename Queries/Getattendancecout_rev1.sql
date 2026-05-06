DECLARE 
    @Month              INT             = 5,
    @Year               INT             = 2026,
    @Section            NVARCHAR(50)    = 'TN',
    @Agency             NVARCHAR(50)    = '',
    @Searchvalue        NVARCHAR(50)    = '',
    @schedule           NVARCHAR(50)    = 'Day'

   -- @Month INT = @month1,
   -- @Year INT = @year1,
   -- @Agency NVARCHAR(50) = @agency1,
   -- @schedule  NVARCHAR(20) = @shift1,
   -- @schedule           NVARCHAR(50)    = 'Day',
   -- @Line BIGINT = @line1,
   -- @Searchvalue        NVARCHAR(50)    = '',
   --@section NVARCHAR(50) = 'TN';

DECLARE @EmpList dbo.TVP_RP_AttendanceSummary_Employees_V2

BEGIN
    SET NOCOUNT ON;

    INSERT INTO @EmpList
    EXEC [dbo].[RP_AttendanceSummary_Employees]
        @Month = @Month,
        @Year = @Year,
        @Section = @Section,
        @Agency = @Agency

    -- CLEAN TEMP TABLES
    DROP TABLE IF EXISTS #DaysMonth, #EmpList, #PA_RP_AttendanceSummary_TITO,
    #PA_TEMP_TITO, #TimeinOutRecord, #PresentAbsent,
    #RestDay, #RegDay, #FinalEmp, #LEAVE_FILING, #ForPivot

    -- DATE GENERATION
    ;WITH N(N) AS (SELECT 1 FROM (VALUES(1),(1),(1),(1),(1),(1)) M(N)),
    tally(N) AS (SELECT ROW_NUMBER() OVER(ORDER BY N.N) FROM N,N a)
    SELECT DATEFROMPARTS(@year,@month,N) DayOfMonth
    INTO #DaysMonth
    FROM tally
    WHERE N <= DAY(EOMONTH(DATEFROMPARTS(@year,@month,1)))

    DECLARE @StartofMonth DATE = (SELECT MIN(DayOfMonth) FROM #DaysMonth)
    DECLARE @EndofMonth DATE = (SELECT MAX(DayOfMonth) FROM #DaysMonth)
    DECLARE @EndOfMonthDate_Next DATETIME = DATEADD(DAY,1,@EndofMonth)

    -- EMP LIST
    SELECT  
        MEL.Prio,
        MEL.EmpNo,
        MEL.RFID,
        MEL.EmployeeName,
        MEL.Schedule,  
        MEL.ScheduleID,  
        MEL.Position,  
        MEL.EmployeeCurrentCostCode AS CostCode,
        MEL.Date_Resigned,
        MEL.Date_Hired,
        MEL.DateResigned_Status,
        MEL.Status as M_Status
    INTO #EmpList
    FROM @EmpList MEL


    --select * from #EmpList where EmpNo = 'BIPH2025-23628'
    CREATE NONCLUSTERED INDEX #EmpList_EmpNo ON #EmpList(EmpNo)

    -- LEAVE
    SELECT *
    INTO #LEAVE_FILING
    FROM V_AF_Leavefiling
    WHERE EmpNo IN (SELECT EmpNo FROM #EmpList)
    AND (
        DateFrom >= @StartofMonth AND DateFrom < @EndOfMonthDate_Next OR
        DateTo >= @StartofMonth AND DateTo < @EndOfMonthDate_Next
    )

    -- TITO
    CREATE TABLE #PA_RP_AttendanceSummary_TITO (
        ID BIGINT,
        EmpNo NVARCHAR(50),
        RFID NVARCHAR(50),
        ScheduleID INT,
        TimeIn NVARCHAR(20),
        TimeOut NVARCHAR(20),
        Daynum INT,
        Monthnum INT,
        Yearnum INT,
        DateLog DATE,
        EmpPrio INT
    )

    INSERT INTO #PA_RP_AttendanceSummary_TITO
    EXEC dbo.RP_AttendanceSummary_TiTo
        @Month,@Year,@Section,@Agency,@Searchvalue,@EmpList

    -- 🔥 USE SCHEDULE FROM #EmpList
    SELECT 
        TITO.*, 
        CASE 
            WHEN UPPER(EL.Schedule) LIKE '%NIGHT%' THEN 1 
            ELSE 0 
        END AS IsNightShift
    INTO #PA_TEMP_TITO
    FROM #PA_RP_AttendanceSummary_TITO TITO
    LEFT JOIN #EmpList EL 
        ON EL.EmpNo = TITO.EmpNo

    -- TIME RECORD
    SELECT *
    INTO #TimeinOutRecord
    FROM #PA_TEMP_TITO

    -- 🔥 PRESENT / ABSENT
    DECLARE @CURRENT_DATETIME DATETIME = GETDATE();

    SELECT 
        TIO.EmpNo,
        TIO.ScheduleID,

        CASE 
            WHEN TIO.TimeIn IS NULL 
                 AND TIO.TimeOut IS NULL
                 AND TIO.IsNightShift = 1
                 AND @CURRENT_DATETIME < DATEADD(HOUR, 18, 
                        CAST(CONCAT(TIO.Yearnum,'-',TIO.Monthnum,'-',TIO.Daynum) AS DATETIME))
            THEN 'NS'

            WHEN TIO.TimeIn IS NULL 
                 AND TIO.TimeOut IS NULL 
            THEN 'AB'

            ELSE CONCAT(
                    'P(',
                    CASE 
                        WHEN TIO.IsNightShift = 1 THEN 'N' 
                        ELSE 'D' 
                    END,
                    ')'
                 )
        END AS Result,

        CAST(CONCAT(TIO.Yearnum,'-',TIO.Monthnum,'-',TIO.Daynum) AS DATE) AS Date

    INTO #PresentAbsent
    FROM #TimeinOutRecord TIO;

    -- FINAL EMP x DAYS
    SELECT e.*, d.DayOfMonth
    INTO #FinalEmp
    FROM #EmpList e
    CROSS JOIN #DaysMonth d

    -- PIVOT BASE
    --SELECT 
    --    e.EmpNo,
    --    DAY(e.DayOfMonth) AS PerDay,
    --    ISNULL(pa.Result,'AB') AS Result,
    --     CASE 
    --    WHEN UPPER(e.Schedule) LIKE '%NIGHT%' THEN 1 
    --    ELSE 0 
    --END AS IsNightShift
    --INTO #ForPivot
    --FROM #FinalEmp e
    --LEFT JOIN #PresentAbsent pa
    --    ON pa.EmpNo = e.EmpNo
    --    AND pa.Date = e.DayOfMonth

SELECT 
    e.EmpNo,

    -- 🔥 DATE FIELDS (NEW)
    d.DayOfMonth                               AS FullDate,
    YEAR(d.DayOfMonth)                         AS Yearnum,
    MONTH(d.DayOfMonth)                        AS Monthnum,
    DAY(d.DayOfMonth)                          AS MonthDay,
    DATENAME(WEEKDAY, d.DayOfMonth)            AS DayOfWeek,

    -- keep for grouping (you can still use MonthDay)
    DAY(d.DayOfMonth)                          AS PerDay,

    -- RESULT WITH RESIGNED LOGIC
    CASE 
        WHEN e.DateResigned_Status IS NOT NULL
             AND d.DayOfMonth >= CAST(e.DateResigned_Status AS DATE)
        THEN '-'
        ELSE ISNULL(pa.Result,'AB')
    END AS Result,

    -- SHIFT FLAG
    CASE 
        WHEN UPPER(e.Schedule) LIKE '%NIGHT%' THEN 1 
        ELSE 0 
    END AS IsNightShift,

    -- RESIGNED DAY FLAG (for RS_Count)
    CASE 
        WHEN e.DateResigned_Status IS NOT NULL
             AND d.DayOfMonth = CAST(e.DateResigned_Status AS DATE)
        THEN 1 ELSE 0
    END AS IsResignedDay

INTO #ForPivot
FROM #FinalEmp e
JOIN #DaysMonth d
    ON d.DayOfMonth = e.DayOfMonth
LEFT JOIN #PresentAbsent pa
    ON pa.EmpNo = e.EmpNo
    AND pa.Date = d.DayOfMonth;

    -- APPLY LEAVE
    UPDATE FP
    SET FP.Result =
        ISNULL(
            (SELECT TOP 1 LF.LeaveCode
             FROM #LEAVE_FILING LF
             WHERE LF.EmpNo = FP.EmpNo
             AND CAST(CONCAT(@Year,'-',@Month,'-',FP.PerDay) AS DATE)
                 BETWEEN LF.DateFrom AND LF.DateTo
             ORDER BY LF.CreateDate DESC),
            FP.Result
        )
    FROM #ForPivot FP;

    --select * from #ForPivot;
 --FINAL SUMMARY
 SELECT 
    Yearnum,
    Monthnum,
    MonthDay,
    DayOfWeek,
    FullDate,

    -- existing metrics
    SUM(CASE WHEN @schedule = 'Day'   AND Result = 'P(D)' THEN 1
             WHEN @schedule NOT IN ('Day','Night') AND Result = 'P(D)' THEN 1
             ELSE 0 END) AS Present_Day,

    SUM(CASE WHEN @schedule = 'Night' AND Result = 'P(N)' THEN 1
             WHEN @schedule NOT IN ('Day','Night') AND Result = 'P(N)' THEN 1
             ELSE 0 END) AS Present_Night,

    -- VL
    SUM(CASE 
        WHEN Result = 'VL'
             AND Result <> '-'
             AND (
                (@schedule = 'Day' AND IsNightShift = 0) OR
                (@schedule = 'Night' AND IsNightShift = 1) OR
                (@schedule NOT IN ('Day','Night'))
             )
        THEN 1 ELSE 0 END) AS VL_Count,

    -- SL
    SUM(CASE 
        WHEN Result = 'SL'
             AND Result <> '-'
             AND (
                (@schedule = 'Day' AND IsNightShift = 0) OR
                (@schedule = 'Night' AND IsNightShift = 1) OR
                (@schedule NOT IN ('Day','Night'))
             )
        THEN 1 ELSE 0 END) AS SL_Count,

    -- NW
    SUM(CASE 
        WHEN Result = 'NW'
             AND Result <> '-'
             AND (
                (@schedule = 'Day' AND IsNightShift = 0) OR
                (@schedule = 'Night' AND IsNightShift = 1) OR
                (@schedule NOT IN ('Day','Night'))
             )
        THEN 1 ELSE 0 END) AS NW_Count,

    -- ML
    SUM(CASE 
        WHEN Result = 'ML'
             AND Result <> '-'
             AND (
                (@schedule = 'Day' AND IsNightShift = 0) OR
                (@schedule = 'Night' AND IsNightShift = 1) OR
                (@schedule NOT IN ('Day','Night'))
             )
        THEN 1 ELSE 0 END) AS ML_Count,

    -- RS (only effective day)
    SUM(CASE WHEN IsResignedDay = 1 THEN 1 ELSE 0 END) AS RS_Count,

    -- AB
    SUM(CASE 
        WHEN Result = 'AB'
             AND Result <> '-'
             AND (
                (@schedule = 'Day' AND IsNightShift = 0) OR
                (@schedule = 'Night' AND IsNightShift = 1) OR
                (@schedule NOT IN ('Day','Night'))
             )
        THEN 1 ELSE 0 END) AS AB_Count,

    -- Present total
    SUM(CASE 
        WHEN Result IN ('P(D)','P(N)')
             AND (
                (@schedule = 'Day' AND IsNightShift = 0) OR
                (@schedule = 'Night' AND IsNightShift = 1) OR
                (@schedule NOT IN ('Day','Night'))
             )
        THEN 1 ELSE 0 END) AS Actual,

    -- Register MP
    --COUNT(CASE 
    --    WHEN Result <> '-'
    --         AND (
    --            (@schedule = 'Day' AND IsNightShift = 0) OR
    --            (@schedule = 'Night' AND IsNightShift = 1) OR
    --            (@schedule NOT IN ('Day','Night'))
    --         )
    --    THEN EmpNo END) AS [Register MP],

    -- Total Absent
    SUM(CASE 
        WHEN Result NOT IN ('P(D)','P(N)','-')
             AND (
                (@schedule = 'Day' AND IsNightShift = 0) OR
                (@schedule = 'Night' AND IsNightShift = 1) OR
                (@schedule NOT IN ('Day','Night'))
             )
        THEN 1 ELSE 0 END) AS Absent

FROM #ForPivot
GROUP BY 
    Yearnum,
    Monthnum,
    MonthDay,
    DayOfWeek,
    FullDate
ORDER BY FullDate;

END