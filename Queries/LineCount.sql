DECLARE  
 @Month INT = @filterMonth,
 @Year  INT = @filterYear,
 @Shift NVARCHAR(50) =  @filterShift,
 @Line INT = NULL,
 @Process INT,
 @SectionGroup NVARCHAR(50) = @filterSection,
 @Certified NVARCHAR(50)


--DECLARE  
-- @Month INT = '04',
-- @Year  INT = '2026',
-- @Shift NVARCHAR(50) = 'DAY',
-- @Line INT = NULL,
-- @Process INT,
-- @SectionGroup NVARCHAR(50) = 'TN',
-- @Certified NVARCHAR(50)


BEGIN  
	SET NOCOUNT ON;  
	SET FMTONLY OFF;  
	SET ARITHABORT ON;  


	DROP TABLE IF EXISTS #tmpInitMPC, #otherRegProcessInitial, #otherRegProcess, #tmpBus, #checkCer,
	#checkCer2, #OutputTable, #FinalTable, #EmpStatusWOUpdateDate, #EmpStatusWUpdateDateActive, #EmpStatusWUpdateDateInactive,
	#CostCenterRanked, #AF_CSRanked, #EmployeeStatusDetails, #FilteredTiTo,#FilteredEmployeeStatus, #CompareNext

	DECLARE @DateFrom DATE = DATEFROMPARTS(@Year, @Month, 1);
	DECLARE @DateTo   DATE = EOMONTH(@DateFrom);

	DECLARE @StartDate DATE = @DateFrom,
			@EndDate   DATE = @DateTo,
			@StartTime TIME(0) = '00:00:00',
			@EndTime   TIME(0) = '23:59:59',

	--DECLARE @StartDate DATE = CONVERT(DATE, @DateFrom),
	--		@EndDate DATE = CONVERT(DATE, @DateTo),
	--		@StartTime TIME(0) = CONVERT(TIME(0), @DateFrom),
			--@EndTime TIME(0) = CONVERT(TIME(0), @DateTo),
			@PageCount INT, 
			@RowCount INT;

	IF ISNULL(@PageCount, 0) = 0 SET @PageCount = 0
	IF ISNULL(@RowCount, 0) = 0 SET @RowCount = 1000000000

	SELECT 
		ID, 
		EmployNo, 
		[Status],
		ROW_NUMBER() OVER (PARTITION BY EmployNo ORDER BY ID DESC) AS rn
	INTO #EmpStatusWOUpdateDate
	FROM M_Employee_Status

	SELECT 
		ID, 
		EmployNo, 
		[Status],
		UpdateDate,
		ROW_NUMBER() OVER (PARTITION BY EmployNo ORDER BY ID DESC) AS rn
	INTO #EmpStatusWUpdateDateActive
	FROM M_Employee_Status
	WHERE [Status] = 'ACTIVE'

	SELECT 
		ID, 
		EmployNo, 
		[Status],
		UpdateDate,
		ROW_NUMBER() OVER (PARTITION BY EmployNo ORDER BY ID DESC) AS rn
	INTO #EmpStatusWUpdateDateInactive
	FROM M_Employee_Status
	WHERE [Status] <> 'ACTIVE'

	SELECT CostCenter_AMS  
	   , EmployNo  
	   , UpdateDate_AMS  
	   , ROW_NUMBER() OVER (PARTITION BY EmployNo ORDER BY UpdateDate_AMS DESC) AS rn
	INTO #CostCenterRanked
	FROM M_Employee_CostCenter
	WHERE (UpdateDate_AMS <= @DateFrom OR UpdateDate_AMS <= @DateTo)

	SELECT Schedule  
		, CS_RefNo
		, EmployeeNo
		, ROW_NUMBER() OVER (PARTITION BY CS_RefNo, EmployeeNo ORDER BY ID DESC) AS rn
	INTO #AF_CSRanked
	FROM AF_ChangeSchedulefiling
	WHERE [Status] = StatusMax AND IsDeleted = 0  

	SELECT MEL.EmpNo
		,S.[Status]
		,A.UpdateDate As ActiveDate
		,I.UpdateDate AS InActiveDate
		,MEL.Family_Name
		,MEL.First_Name
		,MEL.Date_Hired
	INTO #EmployeeStatusDetails
	FROM M_Employee_Master_List MEL
	LEFT JOIN #EmpStatusWOUpdateDate S ON MEL.EmpNo = S.EmployNo AND S.rn = 1
	LEFT JOIN #EmpStatusWUpdateDateActive A ON MEL.EmpNo = A.EmployNo AND A.rn = 1
	LEFT JOIN #EmpStatusWUpdateDateInactive I ON MEL.EmpNo = I.EmployNo AND I.rn = 1

	-- Distinction of Logs during midnights (@StartDate & @Enddate)
	SELECT *
	INTO #FilteredTito
	FROM T_TimeInOut TT
	WHERE (
		(TT.TimeIn IS NULL 
			AND TRY_CONVERT(DATE, TT.[TimeOut]) BETWEEN @StartDate AND @EndDate 
			AND TRY_CONVERT(TIME(0), TT.[TimeOut]) BETWEEN @StartTime AND @EndTime
		)
		OR 
		(
		TT.TimeIn IS NOT NULL
			AND TRY_CONVERT(DATE, TT.TimeIn) BETWEEN @StartDate AND @EndDate 
			AND TRY_CONVERT(TIME(0), TT.TimeIn) BETWEEN @StartTime AND @EndTime
		)
	)

	SELECT 
		curr.ID AS CurrID,
		curr.EmpNo,
		curr.ScheduleID,
		curr.TimeIn AS CurrTimeIn,
		curr.TimeOut AS CurrTimeOut,
		nextRec.ID AS NextID,
		nextRec.TimeIn AS NextTimeIn,
		nextRec.TimeOut AS NextTimeOut,
		s.SchedTimeOut,
		s.SC,
		CASE 
			WHEN 
				CAST(curr.TimeIn AS DATE) <> CAST(nextRec.TimeIn AS DATE)
				AND curr.ScheduleID = nextRec.ScheduleID
				AND TRY_CONVERT(TIME, nextRec.TimeIn) < s.SchedTimeOut
				AND s.SC = 'NIGHT'
			THEN 1 ELSE 0
		END AS IsContinuous
	INTO #CompareNext
	FROM (
		-- Get current records with row number per employee ordered by TimeIn
		SELECT 
			t.*,
			ROW_NUMBER() OVER (PARTITION BY t.EmpNo ORDER BY t.TimeIn) AS rn
		FROM #FilteredTito t
	) AS curr
	LEFT JOIN (
		-- Get next records with row number per employee ordered by TimeIn
		SELECT 
			t.*,
			ROW_NUMBER() OVER (PARTITION BY t.EmpNo ORDER BY t.TimeIn) AS rn
		FROM #FilteredTito t
	) AS nextRec
		ON curr.EmpNo = nextRec.EmpNo
		AND curr.rn + 1 = nextRec.rn  -- next record for same employee
	LEFT JOIN (
		-- Get schedule info: Scheduled TimeOut for each ScheduleID
		SELECT 
			ID AS ScheduleID,
			ShiftCategory as SC,
			TRY_CONVERT(TIME, TimeOut) AS SchedTimeOut
		FROM M_Schedule
	) AS s
		ON curr.ScheduleID = s.ScheduleID;
	

	-- Step 1: Merge TimeOut for continuous logs
	UPDATE t
	SET t.TimeOut = c.NextTimeOut
	FROM #FilteredTito t
	JOIN #CompareNext c ON t.ID = c.CurrID
	WHERE c.IsContinuous = 1;

	DELETE t
	FROM #FilteredTito t
	JOIN #CompareNext c ON t.ID = c.NextID
	WHERE c.IsContinuous = 1;

	SELECT TT.Employee_RFID AS RFID,
	IIF(TT.DTR_RefNo IS NULL, TT.TimeIn, TT.DTR_TimeIn) AS TimeIn
	,IIF(TT.DTR_RefNo IS NULL, TT.[TimeOut], TT.DTR_TimeOut) AS [TimeOut]
	,COALESCE(TT.CS_ScheduleID, TT.ScheduleID) AS ScheduleID
	,IIF((TT.ScheduleID = TT.CS_ScheduleID AND TT.CSRef_No IS NOT NULL) OR TT.CSRef_No IS NULL, 'Black', 'Green') AS ChangeShift
	,TT.ScheduleID AS OrigShift
	,ISNULL(Newline, TT.LineID) AS LineID
	,ISNULL([NewProc], TT.ProcessID) AS ProcessID
	,MEL.EmpNo
	,MEL.Family_Name + ' ' + MEL.First_Name AS EmployeeName
	,MEL.Date_Hired
	,p.[Status]
	,TT.ID AS TTID
	,MEL.ActiveDate
	,MEL.InActiveDate
	INTO #FilteredEmployeeStatus
	FROM #FilteredTiTo TT
	JOIN #EmployeeStatusDetails MEL ON TT.EmpNo = MEL.EmpNo
	INNER JOIN #EmpStatusWOUpdateDate p ON TT.EmpNo = p.EmployNo AND p.rn = 1
	LEFT JOIN [AF_LineProcCorrection] AFLPC ON TT.ID = AFLPC.EmployeeLogID AND AFLPC.[Status] = AFLPC.StatusMax

	SELECT F.RFID,
		   F.TimeIn,
		   F.[TimeOut],
		   F.ScheduleID,
		   F.ChangeShift,
		   F.OrigShift,
		   F.LineID,
		   F.ProcessID,
		   F.EmployeeName,
		   F.Date_Hired,
		   F.[Status],
		   F.EmpNo,
		   F.TTID
		   ,MCL.Cost_Center AS CostCenter_AMS
	INTO #tmpInitMPC
	FROM #FilteredEmployeeStatus F
	JOIN M_Cost_Center_List MCL ON (
		SELECT TOP 1 CostCenter_AMS 
		FROM #CostCenterRanked MEC 
		WHERE MEC.EmployNo = F.EmpNo 
		AND MEC.UpdateDate_AMS <= ISNULL(F.TimeIn, F.[TimeOut]) 
		ORDER BY MEC.UpdateDate_AMS DESC
	) IN (MCL.Cost_Center)
	WHERE F.[Status] = 'ACTIVE'
	   OR (F.ActiveDate <= ISNULL(F.TimeIn, F.[TimeOut]) AND F.InActiveDate >= ISNULL(F.TimeIn, F.[TimeOut]))
	   AND F.RFID IS NOT NULL

	 SELECT MES.*, ms.Skill
	 INTO #otherRegProcessInitial
	 FROM M_Employee_Skills MES
	 JOIN M_Skills AS ms ON ms.ID = MES.SkillID

	SELECT 
		TB.EmpNo, 
		TB.ProcessID, 
		TB.TimeIn,
		CASE 
			WHEN PST.ID IS NULL THEN 'Uncertified'
			WHEN PST.DateValidity <> 'No Expiration'
				 AND DATEADD(DAY, TRY_CAST(PST.DateValidity AS int), PST.CertifacteDate) < CAST(GETDATE() AS date)
				THEN 'Uncertified'
			ELSE PST.ProcessType
		END AS ProcessType,
		PST.CertifacteDate, 
		PST.DateValidity,
		PST.DateRange
	INTO #otherRegProcess
	FROM #tmpInitMPC TB
	JOIN GET_Section_Process(@SectionGroup) GSP2
		ON TB.ProcessID = GSP2.ID
	LEFT JOIN #otherRegProcessInitial PST
		ON TB.EmpNo = PST.EmpNo
		AND GSP2.ID = PST.SkillID;  

	 SELECT *  
	 INTO #tmpBus  
	 FROM #tmpInitMPC  
	 ORDER BY RFID   
	 OFFSET @PageCount ROWS  
	 FETCH NEXT @RowCount ROWS ONLY;   

	WITH Deduplicated AS (
		SELECT DISTINCT
			TRY_CAST(TRY_CONVERT(Char(16), ISNULL(TB.TimeIn,TB.TimeOut), 20) AS Date) AS InDate,  
			ISNULL(TRY_CONVERT(VARCHAR(10), TB.TimeIn, 108), 'NoIn') AS TimeIn,  
			TRY_CAST(TRY_CONVERT(Char(16), ISNULL(TB.TimeOut, TB.TimeOut), 20) AS Date) AS InDateOut,  
			ISNULL(TRY_CONVERT(VARCHAR(10), TB.TimeOut, 108), 'NoOut') AS TimeOut,  
			ISNULL(MSS.Type + ' ('+ MSS.TimeIn + ' - ' + MSS.TimeOut + ')', '') AS Shift,  
			ORP.ProcessType, --FOR REFERENCE BETWEEN 'ORIGINAL' AND 'CERTIFIED'
			ORP.DateValidity,
			--ORP.DateRange,
			TB.ChangeShift,  
			ISNULL((SELECT TOP 1 aa.Type + ' (' + aa.TimeIn + ' - ' + aa.TimeOut + ')'  
					FROM M_Schedule aa  
					WHERE ID = TB.OrigShift), '') AS OrigShift,  
			ISNULL(ML.Line, 'No Line') AS Line,  
			IIF(ML.Code = '-' OR ML.Code IS NULL, 'No Code', ML.Code) AS LineCode,  
			ol.Line AS OriginalLine,  
			os.Skill AS OrigProcess, 
			ISNULL(MS.Skill, 'No Process') AS Skill,  
			IIF(MS.Code = '-' OR MS.Code IS NULL, 'No Code', MS.Code) AS SkillCode,  
			MS.ID,
			TB.EmpNo,  
			TB.EmployeeName,  
			TB.Date_Hired,
			MES.IsDeleted,
			MES.DeletedDate,
			ISNULL(ISNULL(ORP.CertifacteDate, MES.CertifacteDate),NULL) AS DateCertified,
			CASE WHEN (MES.CreateDate IS NULL) THEN NULL --start new  
				 ELSE  
				 (  
				  CASE  
				   WHEN ISNULL(ORP.ProcessType,mes.ProcessType) = 'Temporary' THEN  
					CASE  
					 WHEN MSS.ShiftCategory = 'Night' THEN
						FORMAT(DATEADD(day,(TRY_CAST(mb.TemporaryCertifiedBadgeValidity as int)), ISNULL(ORP.CertifacteDate,mes.CertifacteDate)),'MM/dd/yyyy')
					ELSE
						FORMAT(mes.CertifacteDate, 'MM/dd/yyyy')
					END  
				   ELSE  
					CASE  
					 WHEN MSS.ShiftCategory = 'Night' THEN  
					  IIF(mb.CertifiedBadgeValidity = 'No Expiration', mb.CertifiedBadgeValidity, FORMAT(DATEADD(DAY, 1, DATEADD(DAY, TRY_CAST(mb.CertifiedBadgeValidity AS INT), ISNULL(ORP.CertifacteDate,mes.CertifacteDate))), 'MM/dd/yyyy'))  
					 ELSE  
					  IIF(
							mb.CertifiedBadgeValidity = 'No Expiration',
							mb.CertifiedBadgeValidity,
							FORMAT(
								DATEADD(
									DAY,
									TRY_CAST(mb.CertifiedBadgeValidity AS int),
									ISNULL(ORP.CertifacteDate, mes.CertifacteDate)
								),
								'MM/dd/yyyy'
							)
						)  
					END  
				  END  
				 )   
				 END AS DateRange,
			TB.[Status],  
			TB.TTID  
		FROM #tmpInitMPC TB
		LEFT JOIN M_LineTeam ML ON TB.LineID = ML.ID  
		LEFT JOIN M_Employee_Skills MES ON MES.EmpNo = TB.EmpNo AND MES.LineID = TB.LineID AND MES.SkillID = TB.ProcessID
		LEFT JOIN M_Skills MS ON MS.ID = TB.ProcessID  
		LEFT JOIN M_Schedule MSS ON MSS.ID = TB.ScheduleID  
		JOIN M_BadgeValidity MB ON CONCAT('Rank ', mb.ProcessRank) = MS.ProcessRank AND MB.CertifiedBadgeValidity <> ''  
		LEFT OUTER JOIN AF_LineProcCorrection_Approve AS orig ON TB.TTID = orig.EmployeeLogID  
		LEFT OUTER JOIN M_LineTeam AS ol ON orig.OrigLineID = ol.ID  
		LEFT OUTER JOIN M_Skills AS os ON orig.OrigProcID = os.ID
		LEFT JOIN #otherRegProcess ORP
	  ON TB.ProcessID = ORP.ProcessID AND TB.EmpNo = ORP.EmpNo AND TB.TimeIn = ORP.TimeIn
	 WHERE 

	 --(TB.ScheduleID = 0 OR TB.ScheduleID IS NULL OR TB.ScheduleID = TB.ScheduleID)
	 tb.ScheduleID IN (SELECT ID FROM M_Schedule WHERE ShiftCategory = 'DAY')
	 AND (@Line = 0 OR @Line IS NULL OR @Line = ML.ID)   
	 AND (@Process = 0 OR @Process IS NULL OR @Process = MS.ID)   
	 AND (@SectionGroup = '' OR @SectionGroup IS NULL OR TB.CostCenter_AMS IN (SELECT Cost_Center FROM M_Cost_Center_List WHERE GroupSection = @SectionGroup))   
	 AND (@Certified = '' OR @Certified IS NULL OR @Certified = ISNULL(ISNULL(ORP.ProcessType,MES.ProcessType), 'Uncertified'))  
	 ), Ranked AS ( 
		SELECT *,
			   ROW_NUMBER() OVER (PARTITION BY EmpNo, TRY_CAST(TimeIn AS DATE), TTID
								  ORDER BY 
					ISNULL(DateCertified, '1900-01-01') DESC,  
				   CASE 
					   WHEN ProcessType = 'CERTIFIED' THEN 1 
					   WHEN ProcessType = 'ORIGINAL' THEN 2 
					   ELSE 3 
				   END, 
				   TTID -- Breaks ties, keeping the earliest entry per day
			   ) AS rn
		FROM Deduplicated
	)

	SELECT * INTO #checkCer FROM Ranked 
	WHERE rn = 1
	ORDER BY TTID;

	SELECT 
		a.*,
		CASE 
			WHEN a.ProcessType = 'Original' THEN 'Black'	 -- Original
			WHEN a.ProcessType IS NULL THEN 'Red'			-- Uncertified (no ProcessType means tapped on Unregistered Process)
			WHEN a.DateRange IS NULL THEN 'Red'				-- Uncertified (no DateRange means tapped on Unregistered Process)
			WHEN a.DateRange = 'No Expiration' AND a.ProcessType IN ('Certified', 'Original') THEN 'Green'  -- No Expiration, always valid
			WHEN a.DateRange <> 'No Expiration' AND a.ProcessType IN ('Certified', 'Temporary', 'Original')
				 AND (
					 DATEADD(day,(TRY_CAST(a.DateValidity as int)), a.DateRange) < CAST(GETDATE() AS date) 
					 OR a.DateRange IS NULL
				 ) THEN 'Red'   -- Expired or unregistered
			ELSE 'Green'  -- Valid
		END AS Certified,
		(
			SELECT COUNT(c.EmpNo)
			FROM #checkCer c
			WHERE c.InDate = a.InDate
			  AND c.EmpNo = a.EmpNo
		) AS CountTransfer
	INTO #checkCer2
	FROM #checkCer a
	WHERE a.Line <> 'No Line'
	  AND a.Skill NOT IN ('No Process', 'Same Process');

	 SELECT *, (CASE WHEN(CountTransfer = 1 AND (Certified = 'Green' OR Certified = 'Black')) THEN 'Black'  
		 WHEN(CountTransfer = 1 AND Certified = 'Red') THEN 'Red'  
		 WHEN(CountTransfer > 1 AND Certified = 'Red') THEN 'Red'  
		 ELSE 'Green' END  
		  ) AS TrueColor  
	 INTO #OutputTable  
	 FROM #checkCer2  
	 ORDER BY EmpNo, InDate,TimeIn
  
	 SELECT CASE WHEN EmpNo LIKE 'BIPH%' THEN 1 ELSE 2 END AS Prio,  
		 *  
	 INTO #FinalTable  
	 FROM #OutputTable  
	 WHERE (  
		  @Certified IS NULL OR  
		  @Certified = '' OR  
		  (  
		  TrueColor = CASE WHEN @Certified = 'Certified'  
			   THEN 'Green'  
			   ELSE 'Red'  
			 END  
		  OR  
		  TrueColor = CASE WHEN @Certified = 'Certified'  
			   THEN 'Black'  
			   ELSE 'Red'  
			 END  
		  )  
		  OR  
		  (  
		  TrueColor = CASE WHEN @Certified = 'Original'  
			   THEN 'Green'  
			   ELSE 'Red'  
			 END  
		  OR  
		  TrueColor = CASE WHEN @Certified = 'Original'  
			   THEN 'Black'  
			   ELSE 'Red'  
			 END  
		  )  
      
		)  
	 ORDER BY CASE WHEN EmpNo LIKE 'BIPH%' THEN 1 ELSE 2 END, EmpNo     
	 OFFSET @PageCount * (@RowCount) ROWS  
	 FETCH NEXT @RowCount ROWS ONLY   

	 DROP TABLE IF EXISTS #TABLEFinal1;
  
	-- SELECT    
	--   Prio,  
	--   CASE WHEN TimeIn = 'NoIn' THEN '-' ELSE TRY_CONVERT(varchar, InDate, 101) END AS InDate,  
	--   TimeIn,IIF(TRY_CONVERT(nvarchar, InDateOut, 101) <> '01/01/1900', ISNULL(TRY_CONVERT(nvarchar, InDateOut, 101), '-'), '-') AS InDateOut,
	--   IIF(TRY_CONVERT(nvarchar, InDateOut, 101) = '01/01/1900', 'NoOut', [TimeOut]) AS [TimeOut],
	--   [Shift],  
	--   ProcessType,  
	--   ChangeShift,  
	--   OrigShift,  
	--   Line,  
	--   LineCode,  
	--   OriginalLine,  
	--   OrigProcess,  
	--   Skill,  
	--   SkillCode,  
	--   EmpNo,  
	--   EmployeeName,  
	--   TRY_CONVERT(varchar, TRY_CAST(Date_Hired AS DATE), 101) AS Date_Hired,  
	--   (  
	--   CASE  
	--	WHEN DateCertified IS NULL THEN  
	--	 '-'  
	--	ELSE  
	--	 CASE  
	--	  WHEN DateRange IS NULL OR DateRange = 'No Expiration' OR DateCertified = DateRange THEN
	--		TRY_CONVERT(nvarchar(20),DateCertified,101) 
	--	  WHEN DateRange = 'Uncertified' THEN  
	--		'-'  
	--	  ELSE  
	--		TRY_CONVERT(nvarchar(30),CONCAT(TRY_CONVERT(varchar, DateCertified, 101),' - ',TRY_CONVERT(varchar, DateRange, 101)),0)  
	--	 END  
	--   END  
	--   ) AS DateCertified,   
	--   [Status],  
	--   TTID,  
	--   Certified,  
	--   CountTransfer,  
	--   TrueColor  
	-- INTO #TABLEFinal1  
	-- FROM #FinalTable  
	-- ORDER BY Prio, EmpNo, TTID ASC, InDate ASC, InDateOut DESC  
  
	--SELECT CASE WHEN (@PageCount) = 0 THEN ROW_NUMBER() OVER(
	--	ORDER BY Prio
	--		, EmpNo
	--		, CASE WHEN (InDate = '-') THEN InDateOut 
	--			ELSE InDate END 
	--		ASC
	--		, TimeIn ASC
	--		, TimeOut DESC
	--	) 
	--	ELSE ROW_NUMBER() OVER(ORDER BY (select 0)) + (@RowCount) * (@PageCount) END AS Rownum,  
	--*
	--FROM #TABLEFinal1
	--ORDER BY Prio, EmpNo, TTID ASC, InDate ASC, InDateOut DESC
		
	--SELECT 
 --   Skill,
 --   COUNT(DISTINCT EmpNo) AS AccountCount
	--	FROM #checkCer2
	--	WHERE 
	--		Skill LIKE '%Leader%'
	--		OR Skill LIKE '%Sub-Leader%'
	--		OR Skill LIKE '%MSO%'
		
	--	GROUP BY Skill
	--	ORDER BY Skill;



--	SELECT 
--    CASE 
--        WHEN Skill LIKE '%Sub-Leader%' OR Skill LIKE '%Sub Leader%' THEN 'Sub-Leader'
--        WHEN Skill LIKE '%Leader%' AND Skill NOT LIKE '%Sub%' THEN 'Leader'
--        WHEN Skill LIKE '%MSO%' THEN 'MSO'
--        ELSE 'Operator'  
--    END AS SkillCategory,
--    COUNT(DISTINCT EmpNo) AS AccountCount
--FROM #checkCer2
--WHERE ProcessType IN ('Original','Certified')
--GROUP BY 
--    CASE 
--        WHEN Skill LIKE '%Sub-Leader%' OR Skill LIKE '%Sub Leader%' THEN 'Sub-Leader'
--        WHEN Skill LIKE '%Leader%' AND Skill NOT LIKE '%Sub%' THEN 'Leader'
--        WHEN Skill LIKE '%MSO%' THEN 'MSO'
--        ELSE 'Operator'
--    END
--ORDER BY SkillCategory;


--SELECT COUNT(*) AS RecordCount
--FROM #checkCer2

DECLARE @StartOfMonth DATE = DATEFROMPARTS(@Year, @Month, 1);
DECLARE @EndOfMonth   DATE = EOMONTH(@StartOfMonth);


IF OBJECT_ID('tempdb..#DailyAgg') IS NOT NULL DROP TABLE #DailyAgg;

;WITH Dedup AS
(
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY EmpNo, CAST(InDate AS DATE)
            ORDER BY TimeIn ASC -- 👈 FIRST RECORD
        ) AS rn2   -- ✅ renamed (avoid conflict)
    FROM #checkCer2
    WHERE 
        ProcessType IN ('Original','Certified')
        AND InDate BETWEEN @StartOfMonth AND @EndOfMonth
        --(FOR PR1)
        --AND Line NOT IN ('OFFICE-PG','OFFLINE-EG','OFFICE-MG','	OFFLINE-MG')
        ----(FOR TN)
        --AND Line NOT IN ('OFFICE-MGT','OFFLINE-MGT','OFFICE-PROD','OFFLINE-PROD','OFFICE-ENGR','')
		AND Skill NOT IN('ASST.MANAGER','SRSTAFF/ENGR','CLERK')
)

SELECT
    DAY(InDate) AS DayOfMonth,
    CASE 
        WHEN Skill LIKE '%Sub-Leader%' OR Skill LIKE '%Sub Leader%' THEN 'A. Leader'
        WHEN Skill LIKE '%Leader%' AND Skill NOT LIKE '%Sub%' THEN 'B. Sub-Leader'
        WHEN Skill LIKE '%MSO%' THEN 'C. MSO'
        ELSE 'D. Operator & Kitting & Trainee'
    END AS SkillCategory,
    COUNT(EmpNo) AS AccountCount
INTO #DailyAgg
FROM Dedup
WHERE rn2 = 1 
GROUP BY 
    DAY(InDate),
    CASE 
        WHEN Skill LIKE '%Sub-Leader%' OR Skill LIKE '%Sub Leader%' THEN 'A. Leader'
        WHEN Skill LIKE '%Leader%' AND Skill NOT LIKE '%Sub%' THEN 'B. Sub-Leader'
        WHEN Skill LIKE '%MSO%' THEN 'C. MSO'
        ELSE 'D. Operator & Kitting & Trainee'
    END;


DECLARE @cols NVARCHAR(MAX) = '';
DECLARE @colsSelect NVARCHAR(MAX) = '';
DECLARE @sql  NVARCHAR(MAX) = '';

;WITH Numbers AS
(
    SELECT TOP (DAY(@EndOfMonth))
           ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.objects
)
SELECT 
    @cols = STRING_AGG(QUOTENAME(n), ','),
    @colsSelect = STRING_AGG('ISNULL(' + QUOTENAME(n) + ',''-'') AS ' + QUOTENAME(n), ',')
FROM Numbers;


SET @sql = '
SELECT 
    SkillCategory,
    ' + @colsSelect + '
FROM
(
    SELECT SkillCategory, DayOfMonth, AccountCount
    FROM #DailyAgg
) src
PIVOT
(
    SUM(AccountCount)
    FOR DayOfMonth IN (' + @cols + ')
) p
ORDER BY 
    CASE SkillCategory
        WHEN ''A. Leader'' THEN 1
        WHEN ''B. Sub-Leader'' THEN 2
        WHEN ''C. MSO'' THEN 3
        WHEN ''D. Operator & Kitting & Trainee'' THEN 4
    END;
';

EXEC sp_executesql @sql;
END