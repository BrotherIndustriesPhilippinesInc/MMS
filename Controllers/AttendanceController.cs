using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace MMS.Controllers
{
    public class AttendanceController : Controller
    {
        //public IActionResult Index()
        //{
        //    return View();
        //}

        private readonly DbConfig _db;

        public AttendanceController(DbConfig db)
        {
            _db = db;
        }

        [HttpPost]
        public async Task<IActionResult> GetAttendanceCount(int month, int year, string agency, string shift, string costCode, long? line)
        {
            try
            {
                var sql = SqlLoader.Load("Getattendancecout.sql");

                using (var con =_db.GetConnection())
                {
                    await con.OpenAsync();

                    using (var cmd = new SqlCommand(sql, con))
                    {
                        cmd.Parameters.AddWithValue("@month1", month);
                        cmd.Parameters.AddWithValue("@year1", year);
                        cmd.Parameters.AddWithValue("@agency1", (object?)agency ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@shift1", (object?)shift ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@costCode1", (object?)costCode ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@line1", (object?)line ?? 0);

                        var reader = await cmd.ExecuteReaderAsync();

                        var data = new List<Dictionary<string, object>>();

                        while (await reader.ReadAsync())
                        {
                            var row = new Dictionary<string, object>();

                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                row[reader.GetName(i)] = reader.GetValue(i);
                            }

                            data.Add(row);
                        }

                        return Json(new { success = true, data });
                    }
                }
            }
            catch (Exception ex)
            {
                return Json(new { success = false, error = ex.Message });
            }
        }

        [HttpGet]
        public async Task<IActionResult> GetCalendar(int? month, int? year)
        {
            try
            {
                int m = month ?? DateTime.Now.Month;
                int y = year ?? DateTime.Now.Year;

                //var sql = SqlLoader.Load("GetCalendar.sql");
                string sql = @"  SELECT [Year], [Month], [Day], [Type]
                FROM [Brother_AMS_Live_V3].[dbo].[CalendarSetting_List]
                WHERE [Month] = @month AND [Year] = @year
                ORDER BY [Day] ASC";

                using (var con = _db.GetConnection())
                {
                    await con.OpenAsync();

                    using (var cmd = new SqlCommand(sql, con))
                    {
                        cmd.Parameters.AddWithValue("@month", m);
                        cmd.Parameters.AddWithValue("@year", y);

                        var reader = await cmd.ExecuteReaderAsync();

                        var calendarData = new List<object>();

                        while (await reader.ReadAsync())
                        {
                            calendarData.Add(new
                            {
                                Year = Convert.ToInt32(reader["Year"]),
                                Month = Convert.ToInt32(reader["Month"]),
                                Day = Convert.ToInt32(reader["Day"]),
                                Type = Convert.ToInt32(reader["Type"])
                            });
                        }

                        return Json(calendarData);
                    }
                }
            }
            catch (Exception)
            {
                return StatusCode(500, new { error = "Query failed." });
            }
        }


    }
}
