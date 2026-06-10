using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace MMS.Controllers
{
    public class RetapController : Controller
    {
        //public IActionResult Index()
        //{
        //    return View();
        //}

        private readonly DbConfig _db;

        public RetapController(DbConfig db)
        {
            _db = db;
        }

        [HttpPost]
        public async Task<IActionResult> RetapData(int month, int year, string agency, string shift, string costCode, long? line)
        {
            try
            {
                var sql = SqlLoader.Load("RetapData.sql");

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

                        var retap_data = new List<Dictionary<string, object>>();

                        while (await reader.ReadAsync())
                        {
                            var row = new Dictionary<string, object>();

                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                row[reader.GetName(i)] = reader.GetValue(i);
                            }

                            retap_data.Add(row);
                        }

                        return Json(new { success = true, retap_data });
                    }
                }
            }
            catch (Exception ex)
            {
                return Json(new { success = false, error = ex.Message });
            }
        }
    }
}
