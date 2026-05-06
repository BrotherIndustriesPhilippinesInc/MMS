--DECLARE
--    @Month INT = @month1,
--    @Year INT = @year1,
--    @Agency NVARCHAR(50) = @agency1,
--    @Shift NVARCHAR(20) = @shift1,
--    @Line BIGINT = @line1,
--   @section NVARCHAR(50) = 'TN';

DECLARE
    @Month INT = '5',
    @Year INT = '2026',
    @Agency NVARCHAR(50) = '',
    @Shift NVARCHAR(20) = 'Day',
    @Line BIGINT = '',
   @section NVARCHAR(50) = 'TN';


            
                BEGIN
                    SET NOCOUNT ON;
                    SET FMTONLY OFF;
                    SET ARITHABORT ON;

                    -- Drop temp tables if exist
                    IF OBJECT_ID('tempdb..#DaysMonth') IS NOT NULL DROP TABLE #DaysMonth;
                    IF OBJECT_ID('tempdb..#MPCountTB') IS NOT NULL DROP TABLE #MPCountTB;
                    IF OBJECT_ID('tempdb..#TimeInOutRaw') IS NOT NULL DROP TABLE #TimeInOutRaw;
                    IF OBJECT_ID('tempdb..#EmployeeListDaily') IS NOT NULL DROP TABLE #EmployeeListDaily;
                    IF OBJECT_ID('tempdb..#AttendanceData') IS NOT NULL DROP TABLE #AttendanceData;
                    IF OBJECT_ID('tempdb..#LeaveCounts') IS NOT NULL DROP TABLE #LeaveCounts;
                    IF OBJECT_ID('tempdb..#FinalData') IS NOT NULL DROP TABLE #FinalData;

                    -- Generate days of month
                    ;WITH N(N) AS (SELECT 1 FROM (VALUES(1),(1),(1),(1),(1),(1)) M(N)),
                        tally(N) AS (SELECT ROW_NUMBER() OVER(ORDER BY N.N) FROM N,N a,N b)
                    SELECT DATEFROMPARTS(@Year, @Month, N) AS date
                    INTO #DaysMonth
                    FROM tally
                    WHERE N <= DAY(EOMONTH(DATEFROMPARTS(@Year, @Month, 1)));

                    -- MP Count table
                    CREATE TABLE #MPCountTB(
                        InDate DATETIME,
                        mpcount INT,
                      
                    );

                    DECLARE @SectionGroup NVARCHAR(50) = (SELECT TOP 1 GroupSection FROM M_Cost_Center_List WHERE GroupSection = @section);
                    DECLARE @DateFrom DATETIME = (SELECT TOP 1 date FROM #DaysMonth ORDER BY date);
                    DECLARE @DateTo DATETIME = DATEADD(DAY, 1, (SELECT TOP 1 date FROM #DaysMonth ORDER BY date DESC));

                    -- Employee list daily with schedule
                    SELECT
                        DM.date AS InDate,
                        MEL.EmpNo,
                        ISNULL(
                            (SELECT TOP 1 s.Schedule FROM AF_ChangeSchedulefiling s
                            WHERE s.EmployeeNo = MEL.EmpNo
                            AND DM.date BETWEEN s.DateFrom AND s.DateTo
                            --AND s.Status BETWEEN '1' AND s.StatusMax
                            AND s.Status = s.StatusMax
                            --OR s.Status = '1'
                            ORDER BY s.ID DESC),
                            (SELECT TOP 1 ScheduleID
                            FROM M_Employee_Master_List_Schedule
                            WHERE EmployeeNo = MEL.EmpNo
                            AND ScheduleID IS NOT NULL
                            AND EffectivityDate <= DM.date
                            ORDER BY ID DESC)
                        ) AS ScheduleID
                    INTO #EmployeeListDaily
                    FROM #DaysMonth DM
                    CROSS JOIN M_Employee_Master_List MEL
                    LEFT JOIN M_Employee_Status MEC_Current ON MEC_Current.ID = ( 
                        SELECT TOP 1 ID FROM M_Employee_Status MEC
                        WHERE MEC.EmployNo = MEL.EmpNo AND MEC.UpdateDate <= DM.date
                        ORDER BY MEC.ID DESC
                    )
                    LEFT JOIN M_Employee_Master_List emp on MEL.EmpNo = emp.EmpNo
                    WHERE
                     --emp.Position not in ('Manager','Assitant Manager', 'Senior Supervisor','Supervisor') AND
                        (MEL.Date_Resigned IS NULL OR DM.date < DATEADD(DAY, 1, MEL.Date_Resigned))
                        --(MEL.Date_Resigned IS NULL OR DM.date <= MEL.Date_Resigned)
                        AND (
                            MEC_Current.Status = 'ACTIVE'
                            OR (MEC_Current.Status <> 'ACTIVE' AND EXISTS ( 
                                SELECT 1 FROM M_Employee_Status MEC_Active
                                WHERE MEC_Active.EmployNo = MEL.EmpNo
                                AND MEC_Active.Status = 'ACTIVE'
                                AND MEC_Active.UpdateDate <= DM.date
                                AND (SELECT TOP 1 UpdateDate FROM M_Employee_Status MEC_Next
                                    WHERE MEC_Next.EmployNo = MEL.EmpNo AND MEC_Next.UpdateDate > MEC_Active.UpdateDate
                                    ORDER BY MEC_Next.UpdateDate) > DM.date
                            ))
                        )
                        AND (SELECT TOP 1 MEC.CostCenter_AMS FROM M_Employee_CostCenter MEC WHERE MEC.EmployNo = MEL.EmpNo AND MEC.UpdateDate_AMS <= DM.date ORDER BY UpdateDate_AMS DESC) IN (
                            SELECT Cost_Center FROM M_Cost_Center_List
                            WHERE GroupSection = @SectionGroup OR @SectionGroup = '' OR @SectionGroup IS NULL
                        )
                        AND (
                            @Agency IS NULL OR @Agency = ''
                            OR (@Agency = 'AGENCY' AND MEL.EmpNo LIKE 'SRI%')
                            OR (@Agency = 'AGENCY' AND MEL.EmpNo LIKE 'AMI%')
                            OR (@Agency = 'AGENCY' AND MEL.EmpNo LIKE 'PKIMT%')
                            OR (@Agency = 'AGENCY' AND MEL.EmpNo LIKE 'AVANCE%')
                            OR (@Agency = 'AGENCY' AND MEL.EmpNo LIKE 'NATCORP%')
                            OR (@Agency <> 'AGENCY' AND MEL.EmpNo LIKE @Agency+'%')
                        );

                    --select * from #EmployeeListDaily;
                    -- Count MP
                    INSERT INTO #MPCountTB(InDate, mpcount)
                    SELECT
                        ELD.InDate,
                        COUNT(ELD.EmpNo) AS mpco
                    FROM #EmployeeListDaily ELD
                    LEFT JOIN M_Schedule MS ON ELD.ScheduleID = MS.ID
                    --LEFT JOIN M_Employee_Master_List emp on ELD.EmpNo = emp.EmpNo
                    WHERE
                        (@Shift = 'NoSched' AND (ELD.ScheduleID IS NULL OR ISNULL(MS.IsDeleted, 1) = 1))
                        OR (@Shift IN ('Day', 'Night') AND ISNULL(MS.IsDeleted, 0) <> 1 AND MS.Type LIKE @Shift + '%')
                        OR (@Shift = 'ALL' OR @Shift IS NULL OR @Shift = '')
                        --AND emp.Position not in ('Assitant Manager', 'Senior Supervisor')
                    GROUP BY ELD.InDate

                    -- Leave counts
                    SELECT
                        RP.Date,
                        SUM(CASE WHEN RP.LeaveType = 'ML' THEN 1 ELSE 0 END) AS MLCount,
                        SUM(CASE WHEN RP.LeaveType = 'NW' THEN 1 ELSE 0 END) AS NWCount,
                        SUM(CASE WHEN RP.LeaveType <> 'NW' AND RP.LeaveType <> 'ML' THEN 1 ELSE 0 END) AS LeaveSum
                    INTO #LeaveCounts
                    FROM RP_AttendanceMonitoring RP
                    WHERE
                        MONTH(RP.Date) = @Month AND YEAR(RP.Date) = @Year
                        AND RP.EmployeeNo IN (SELECT EmpNo FROM #EmployeeListDaily WHERE InDate = RP.Date)
                        AND (
                            @Shift = '' OR @Shift IS NULL OR @Shift = 'ALL'
                            OR (SELECT TOP 1 Type FROM M_Schedule MS WHERE ID = (SELECT TOP 1 ScheduleID FROM M_Employee_Master_List_Schedule MES WHERE MES.EmployeeNo = RP.EmployeeNo AND MES.EffectivityDate <= RP.Date ORDER BY MES.ID DESC)) LIKE @Shift + '%'
                        )
                    GROUP BY RP.Date;

                    -- TimeInOutRaw
                    SELECT
                        CAST(ISNULL(TT.TimeIn, TT.TimeOut) AS DATE) AS InDate,
                        TT.EmpNo,
                        TT.LineID,
                        TT.ProcessID,
                        ISNULL(TT.CS_ScheduleID, TT.ScheduleID) AS ScheduleID
                    INTO #TimeInOutRaw
                    FROM T_TimeInOut TT
                    JOIN M_Employee_Master_List MEL ON TT.EmpNo = MEL.EmpNo
                    WHERE
                        ISNULL(TT.TimeIn, TT.TimeOut) BETWEEN @DateFrom AND DATEADD(SECOND, -1, @DateTo)
                        
                        AND  (MEL.Date_Resigned IS NULL OR ISNULL(TT.TimeIn, TT.TimeOut) < DATEADD(DAY, 1, MEL.Date_Resigned)) 
                        AND TT.Employee_RFID IS NOT NULL
                        AND EXISTS (SELECT 1 FROM #EmployeeListDaily ELD WHERE ELD.EmpNo = MEL.EmpNo AND ELD.InDate = CAST(ISNULL(TT.TimeIn, TT.TimeOut) AS DATE))
                        AND (
                            @Shift = '' OR @Shift IS NULL OR @Shift = 'ALL'
                            OR (@Shift = 'Day' AND ISNULL(TT.CS_ScheduleID, TT.ScheduleID) IN (SELECT ID FROM M_Schedule WHERE Type LIKE 'Day%'))
                            OR (@Shift = 'Night' AND ISNULL(TT.CS_ScheduleID, TT.ScheduleID) IN (SELECT ID FROM M_Schedule WHERE Type LIKE 'Night%'))
                            OR (@Shift = 'NoSched' AND (ISNULL(TT.CS_ScheduleID, TT.ScheduleID) IS NULL OR NOT EXISTS(SELECT 1 FROM M_Schedule MS WHERE MS.ID = ISNULL(TT.CS_ScheduleID, TT.ScheduleID) AND MS.IsDeleted <> 1)))
                        )
                    GROUP BY
                        CAST(ISNULL(TT.TimeIn, TT.TimeOut) AS DATE), TT.EmpNo, TT.LineID, TT.ProcessID, ISNULL(TT.CS_ScheduleID, TT.ScheduleID);

                    -- Night shift previous day
                    IF @Shift NOT IN ('Day', 'NoSched') OR @Shift IS NULL OR @Shift = '' OR @Shift = 'ALL'
                    BEGIN
                        INSERT INTO #TimeInOutRaw(InDate, EmpNo, LineID, ProcessID, ScheduleID)
                        SELECT
                            CAST(DATEADD(day, -1, TT.TimeOut) AS DATE) AS InDate,
                            TT.EmpNo,
                            TT.LineID,
                            TT.ProcessID,
                            ISNULL(TT.CS_ScheduleID, TT.ScheduleID) AS ScheduleID
                        FROM T_TimeInOut TT
                        JOIN M_Employee_Master_List MEL ON TT.EmpNo = MEL.EmpNo
                        WHERE
                            TT.TimeIn IS NULL
                            AND TT.TimeOut BETWEEN DATEADD(DAY, 1, @DateFrom) AND @DateTo 
                            AND (MEL.Date_Resigned IS NULL OR TT.TimeOut < DATEADD(DAY, 1, MEL.Date_Resigned)) 
                            AND TT.Employee_RFID IS NOT NULL
                            AND ISNULL(TT.CS_ScheduleID, TT.ScheduleID) IN (SELECT ID FROM M_Schedule WHERE Type LIKE 'Night%')
                            AND EXISTS (SELECT 1 FROM #EmployeeListDaily ELD WHERE ELD.EmpNo = MEL.EmpNo AND ELD.InDate = CAST(DATEADD(day, -1, TT.TimeOut) AS DATE))
                        GROUP BY
                            CAST(DATEADD(day, -1, TT.TimeOut) AS DATE), TT.EmpNo, TT.LineID, TT.ProcessID, ISNULL(TT.CS_ScheduleID, TT.ScheduleID);
                    END

                    -- Attendance data
                    SELECT
                        T.InDate,
                        COUNT(DISTINCT T.EmpNo) AS Present 
                    INTO #AttendanceData
                    FROM #TimeInOutRaw T
                    LEFT JOIN M_LineTeam ML ON T.LineID = ML.ID
                    WHERE
                        (@Line = 0 OR @Line IS NULL OR @Line = ML.ID)
                    GROUP BY T.InDate;

                    --SELECT * FROM #TimeInOutRaw

                    -- FinalData
                    SELECT
                        YEAR(DM.date) AS Year,
                        MONTH(DM.date) AS Monthnum,
                        DAY(DM.date) AS MonthDay,
                        ISNULL(MTB.mpcount, 0) AS [Register MP],
                        ISNULL(ETTD.Present, 0) AS Present,
                        ISNULL(LC.MLCount, 0) AS MLCount,
                        ISNULL(LC.NWCount, 0) AS NWCount,
                        ISNULL(LC.LeaveSum, 0) AS LeaveSum,
                        DATENAME(dw, DM.date) AS DayOfWeek,
                        DM.date AS FullDate
                    INTO #FinalData
                    FROM #DaysMonth DM
                    --LEFT JOIN M_Employee_Master_List 
                    LEFT JOIN #AttendanceData ETTD ON DM.date = ETTD.InDate
                    LEFT JOIN #MPCountTB MTB ON MTB.InDate = DM.date
                    LEFT JOIN #LeaveCounts LC ON LC.Date = DM.date
              
                    --SELECT * FROM #AttendanceData
                    -- Forecast logic
                    ;WITH PastData AS (
                        SELECT
                            FD.FullDate,
                            FD.DayOfWeek,
                            FD.[Register MP],
                            FD.Present,
                            FD.MLCount,
                            FD.NWCount,
                            FD.LeaveSum,
                            FD.[Register MP] - FD.Present - FD.MLCount - FD.NWCount AS AbsentCount,
                            CASE
                                WHEN FD.DayOfWeek IN ('Saturday', 'Sunday') AND FD.FullDate <= GETDATE()
                                    THEN CAST(FD.LeaveSum AS DECIMAL(18,2))
                                WHEN FD.DayOfWeek NOT IN ('Saturday', 'Sunday') AND FD.FullDate <= GETDATE()
                                    THEN CAST(CASE
                                                WHEN (FD.[Register MP] - FD.Present - FD.MLCount - FD.NWCount) >= 0
                                                    THEN (FD.[Register MP] - FD.Present - FD.MLCount - FD.NWCount)
                                                    ELSE 0
                                            END AS DECIMAL(18,2))
                                ELSE 0
                            END AS ActualAbsentForCalc
                        FROM #FinalData FD
                    )
                    SELECT
                        FD.Year,
                        FD.Monthnum,
                        FD.MonthDay,
                        FD.[Register MP],

                        CASE 
                            WHEN FD.FullDate > GETDATE() THEN
                                FD.[Register MP] - CAST((
                                    SELECT AVG(ActualAbsentForCalc)
                                    FROM (
                                        SELECT TOP 10 *
                                        FROM PastData
                                        WHERE FullDate < FD.FullDate
                                        AND DayOfWeek NOT IN ('Saturday','Sunday')
                                        AND ActualAbsentForCalc <> ([Register MP] - MLCount - NWCount)
                                        ORDER BY FullDate DESC
                                    ) AS last10
                                ) AS INT)
                            ELSE FD.Present
                        END AS Actual,
                        FD.MLCount,
                        FD.LeaveSum,

                        -- Absent
                        CASE
                            WHEN FD.DayOfWeek IN ('Saturday', 'Sunday') AND FD.FullDate <= GETDATE()
                                THEN FD.LeaveSum
                            WHEN FD.DayOfWeek NOT IN ('Saturday', 'Sunday') AND FD.FullDate <= GETDATE()
                                THEN CASE 
                                        WHEN (FD.[Register MP] - FD.Present - FD.MLCount - FD.NWCount) >= 0
                                        THEN (FD.[Register MP] - FD.Present - FD.MLCount - FD.NWCount)
                                        ELSE 0
                                    END
                            ELSE 0 
                        END AS Absent,

                        CASE
                            WHEN FD.DayOfWeek IN ('Saturday', 'Sunday') AND FD.FullDate <= GETDATE()
                                THEN FD.NWCount - FD.LeaveSum
                            ELSE FD.NWCount
                        END AS NWCount,

                        FD.DayOfWeek,
                        FD.FullDate
                    FROM #FinalData FD
                    ORDER BY FD.MonthDay;

                END