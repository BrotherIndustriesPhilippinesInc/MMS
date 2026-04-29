using System;
using System.Collections.Generic;
using System.IO;

public static class SqlLoader
{
    private static readonly Dictionary<string, string> _cache = new();

    public static string Load(string fileName)
    {
        if (_cache.ContainsKey(fileName))
            return _cache[fileName];

        var basePath = AppDomain.CurrentDomain.BaseDirectory;
        var fullPath = Path.Combine(basePath, "Queries", fileName);

        if (!File.Exists(fullPath))
            throw new FileNotFoundException($"SQL file not found: {fullPath}");

        var sql = File.ReadAllText(fullPath);
        _cache[fileName] = sql;

        return sql;
    }
}