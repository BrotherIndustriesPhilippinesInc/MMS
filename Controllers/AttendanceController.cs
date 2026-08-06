using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Npgsql;

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
                //var sql = SqlLoader.Load("Getattendancecout.sql");
                var sql = SqlLoader.Load("Getattendancecout_rev1.sql");
                //var sql = "EXEC get_attendance(@mont)"

                using (var con =_db.GetConnection())
                {
                    await con.OpenAsync();

                    using (var cmd = new SqlCommand(sql, con))
                    {
                        cmd.CommandTimeout = 120;
                        cmd.Parameters.AddWithValue("@month1", month);
                        cmd.Parameters.AddWithValue("@year1", year);
                        cmd.Parameters.AddWithValue("@agency1", (object?)agency ?? DBNull.Value);
                        //cmd.Parameters.AddWithValue("@shift1", (object?)shift ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@shift1", string.IsNullOrWhiteSpace(shift) ? "" : shift);
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

        [HttpPost]

        public async Task<IActionResult> GetregisterMP(int month, int year, string agency, string shift, string costCode, long? line)
        {
            try
            {
                var sql = SqlLoader.Load("Getattendancecout.sql");

                using (var con = _db.GetConnection())
                {
                    await con.OpenAsync();
                   
                    using (var cmd = new SqlCommand(sql, con))
                    {
                        cmd.CommandTimeout = 120;
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

        [HttpPost]
        public IActionResult SaveForecast(int year, int month, int day, string dayOfWeek, decimal forecastValue)
        {
            string sql = @"INSERT INTO public.tbl_forcasted(year_num, month_num, month_day, forcasted_data, date_updated)
                        VALUES(@year,@month,@day,@forecastValue,NOW()) 
                        ON CONFLICT (year_num, month_num, month_day) DO UPDATE SET
                        forcasted_data = EXCLUDED.forcasted_data,
                        date_updated = NOW();";

            using (var conn = _db.GetpostreConnection())
            {
                conn.Open();

                using (var cmd = new NpgsqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@year", year);
                    cmd.Parameters.AddWithValue("@month", month);
                    cmd.Parameters.AddWithValue("@day", day);
                    cmd.Parameters.AddWithValue("@forecastValue", forecastValue);

                    cmd.ExecuteNonQuery();
                }
            }

            return Json(new { success = true });
        }

        [HttpGet]
        public IActionResult GetForecast(int year)
        {
            var result = new List<object>();

            string sql = @"SELECT year_num, month_num, month_day, dayoffweek, forcasted_data FROM public.tbl_forcasted WHERE year_num = @year ORDER BY month_num, month_day;";

            using (var conn = _db.GetpostreConnection())
            {
                conn.Open();

                using (var cmd = new NpgsqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@year", year);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            result.Add(new
                            {
                                Year = reader["year_num"],
                                Month = reader["month_num"],
                                Day = reader["month_day"],
                                DayOfWeek = reader["dayoffweek"],
                                ForecastedData = reader["forcasted_data"]
                            });
                        }
                    }
                }
            }

            return Json(result);
        }

        [HttpPost]
        public IActionResult SaveForecastRange(DateTime dateFrom, DateTime dateTo, decimal forecastRate)
        {
            try
            {
                using (var conn = _db.GetpostreConnection())
                {
                    conn.Open();

                    for (DateTime d = dateFrom; d <= dateTo; d = d.AddDays(1))
                    {
                        string sql = @"INSERT INTO public.tbl_forcasted(year_num, month_num, month_day, dayoffweek, forcasted_data, date_updated)
                                    VALUES(@year, @month, @day, @dayofweek, @forecast, NOW()) ON CONFLICT (year_num, month_num, month_day)
                                    DO UPDATE SET forcasted_data = EXCLUDED.forcasted_data, date_updated = NOW();";

                        using (var cmd = new NpgsqlCommand(sql, conn))
                        {
                            cmd.Parameters.AddWithValue("@year", d.Year);
                            cmd.Parameters.AddWithValue("@month", d.Month);
                            cmd.Parameters.AddWithValue("@day", d.Day);
                            cmd.Parameters.AddWithValue("@dayofweek", d.DayOfWeek.ToString());
                            cmd.Parameters.AddWithValue("@forecast", forecastRate);

                            cmd.ExecuteNonQuery();
                        }
                    }
                }

                return Json(new
                {
                    success = true
                });
            }
            catch (Exception ex)
            {
                return Json(new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }


    }
}
