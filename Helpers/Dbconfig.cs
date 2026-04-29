using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Npgsql;
public class DbConfig
{
    private readonly IConfiguration configuration;

    public DbConfig(IConfiguration configuration)
    {
        this.configuration = configuration;
    }

    public SqlConnection GetConnection()
    {
        var connectionString = configuration.GetConnectionString("conn");
        return new SqlConnection(connectionString);
    }

    public NpgsqlConnection GetpostreConnection()
    {
        var connectionString = configuration.GetConnectionString("conn2");
        return new NpgsqlConnection(connectionString);
    }
}