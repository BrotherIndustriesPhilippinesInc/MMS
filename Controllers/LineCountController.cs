using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using OfficeOpenXml;
using Npgsql;
using System.ComponentModel;
using Microsoft.AspNetCore.Http.HttpResults;

namespace MMS.Controllers
{
    public class LineCountController : Controller
    {
        //public IActionResult Index()
        //{
        //    return View();
        //}
        private readonly DbConfig _db;

        public LineCountController(DbConfig db)
        {
            _db = db;
        }

        [HttpPost]
        public async Task<IActionResult> LineCount(int month, int year, string agency, string shift, string costCode, long? line)
        {
            try
            {
                var sql = SqlLoader.Load("LineCount.sql");

                //if (costCode == "A003")
                //{
                //    costCode = "TN";
                //}
                
                switch (costCode)
                {
                    case "A003":
                        costCode = "TN";
                        break;
                    case "C006":
                        costCode = "PR1";
                        break;
                    case "Y005":
                        costCode = "PR2";
                        break;
                }

                using (var con = _db.GetConnection())
                {
                    await con.OpenAsync();

                    using (var cmd = new SqlCommand(sql, con))
                    {
                        cmd.CommandTimeout = 120;
                        cmd.Parameters.AddWithValue("@filterMonth", month);
                        cmd.Parameters.AddWithValue("@filterYear", year);
                        cmd.Parameters.AddWithValue("@agency1", (object?)agency ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@filterShift", (object?)shift ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@filterSection", (object?)costCode ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@line1", (object?)line ?? 0);

                        var reader = await cmd.ExecuteReaderAsync();

                        var data1 = new List<Dictionary<string, object>>();

                        while (await reader.ReadAsync())
                        {
                            var row = new Dictionary<string, object>();

                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                row[reader.GetName(i)] = reader.GetValue(i);
                            }

                            data1.Add(row);
                        }

                        return Json(new { success = true, data1 });
                    }
                }
            }
            catch (Exception ex)
            {
                return Json(new { success = false, error = ex.Message });
            }
        }

        public class StdRequest
        {
            public int Month { get; set; }
            public int Year { get; set; }
            public string Section { get; set; }
            public string Shift { get; set; }
        }
        [HttpPost]
        public async Task<IActionResult> GetSTD([FromBody] StdRequest req)
        {
            string stdType = (req.Shift == "Day") ? "STD-Day" : "STD-Night";

            try
            {
                using (var conn = _db.GetpostreConnection())
                {
                    await conn.OpenAsync();

                    var cmd = new NpgsqlCommand(@"
                    SELECT dayofmonth, std
                    FROM tbl_std_mp
                    WHERE section = @section
                      AND month = @month
                      AND std_type = @stdType
                ", conn);

                    cmd.Parameters.AddWithValue("@section", req.Section ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@month", req.Month.ToString()); // match DB type
                    cmd.Parameters.AddWithValue("@stdType", stdType);

                    var reader = await cmd.ExecuteReaderAsync();

                    Dictionary<int, int> values = new Dictionary<int, int>();

                    while (await reader.ReadAsync())
                    {
                        //values[(int)reader["dayofmonth"]] = (int)reader["std"];
                        int day = Convert.ToInt32(reader["dayofmonth"]);
                        int std = Convert.ToInt32(reader["std"]);

                        values[day] = std;
                    }

                    if (values.Count == 0)
                    {
                        return Json(new
                        {
                            success = false,
                            message = "No STD uploaded yet"
                        });
                    }

                    return Json(new
                    {
                        success = true,
                        data = new
                        {
                            std_type = stdType,
                            values = values
                        }
                    });
                }
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

        [HttpPost]
        public async Task<IActionResult> UploadSTD(
            [FromForm] string section,
            [FromForm] string shift,
            [FromForm] IFormFile file)
        {
            ExcelPackage.LicenseContext = OfficeOpenXml.LicenseContext.NonCommercial;

            string user = "JEFFREY REYES";
            string stdType = (shift == "Day") ? "STD-Day" : "STD-Night";

            if (file == null || file.Length == 0)
            {
                return Json(new
                {
                    success = false,
                    message = "No file uploaded"
                });
            }

            try
            {
                using (var conn = _db.GetpostreConnection())
                {
                    await conn.OpenAsync();

                    Dictionary<int, int> values = new Dictionary<int, int>();

                    using (var stream = new MemoryStream())
                    {
                        await file.CopyToAsync(stream);

                        using (var package = new ExcelPackage(stream))
                        {
                            var sheet = package.Workbook.Worksheets[0];

                            int colCount = sheet.Dimension.End.Column;
                            int rowCount = sheet.Dimension.End.Row;

                            List<int> days = new List<int>();
                            string excelMonth = "";

                            for (int col = 2; col <= colCount; col++)
                            {
                                object value = sheet.Cells[1, col].Value;

                                if (value is DateTime dt)
                                {
                                    days.Add(dt.Day);

                                    if (string.IsNullOrEmpty(excelMonth))
                                    {
                                        excelMonth = dt.ToString("MM");
                                    }
                                }
                                else
                                {
                                    days.Add(0);
                                }
                            }

                            // FIND TARGET ROW
                            int targetRow = -1;

                            for (int row = 1; row <= rowCount; row++)
                            {
                                if (sheet.Cells[row, 1].Text.Trim() == stdType)
                                {
                                    targetRow = row;
                                    break;
                                }
                            }

                            if (targetRow == -1)
                            {
                                return Json(new
                                {
                                    success = false,
                                    message = $"{stdType} row not found in Excel"
                                });
                            }

                            using (var transaction = conn.BeginTransaction())
                            {
                                var insertCmd = new NpgsqlCommand(@"
                                INSERT INTO tbl_std_mp
                                (section, month, dayofmonth, std, std_type, date_uploaded, uploaded_by)
                                VALUES (@section, @month, @day, @std, @stdType, NOW(), @user)
                            ", conn);

                                insertCmd.Parameters.Add("@section", NpgsqlTypes.NpgsqlDbType.Varchar);
                                insertCmd.Parameters.Add("@month", NpgsqlTypes.NpgsqlDbType.Varchar); 
                                insertCmd.Parameters.Add("@day", NpgsqlTypes.NpgsqlDbType.Integer);
                                insertCmd.Parameters.Add("@std", NpgsqlTypes.NpgsqlDbType.Integer);
                                insertCmd.Parameters.Add("@stdType", NpgsqlTypes.NpgsqlDbType.Varchar);
                                insertCmd.Parameters.Add("@user", NpgsqlTypes.NpgsqlDbType.Varchar);
                                for (int col = 2; col <= colCount; col++)
                                {
                                    int day = days[col - 2];
                                    if (day == 0) continue;

                                    var text = sheet.Cells[targetRow, col].Text;
                                    int std = int.TryParse(text, out int temp) ? temp : 0;

                                    insertCmd.Parameters["@section"].Value = section;
                                    insertCmd.Parameters["@month"].Value = excelMonth;
                                    insertCmd.Parameters["@day"].Value = day;
                                    insertCmd.Parameters["@std"].Value = std;
                                    insertCmd.Parameters["@stdType"].Value = stdType;
                                    insertCmd.Parameters["@user"].Value = user;

                                    await insertCmd.ExecuteNonQueryAsync();

                                    values[day] = std;
                                }

                                await transaction.CommitAsync();
                            }
                        }
                    }

                    return Json(new
                    {
                        success = true,
                        data = new
                        {
                            std_type = stdType,
                            values = values
                        }
                    });
                }
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
