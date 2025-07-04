using OsuParsers.Database;
using OsuParsers.Decoders;
using System.Threading.Tasks; // Make sure this is present

namespace Paws.Host;

public class StableDbService
{
    private readonly ILogger<StableDbService> _logger;
    private string? _stableRootPath;

    private OsuDatabase? _cachedOsuDb;
    private ScoresDatabase? _cachedScoresDb;

    private DateTime _osuDbCacheTimestamp;
    private DateTime _scoresDbCacheTimestamp;

    public StableDbService(ILogger<StableDbService> logger)
    {
        _logger = logger;
    }

    public void SetStablePath(string path)
    {
        _stableRootPath = path;
        _cachedOsuDb = null;
        _cachedScoresDb = null;
    }

    public string? GetStableRootPath() => _stableRootPath;
    public async Task<OsuDatabase?> GetOsuDbAsync()
    {
        // Get the result from the helper
        var result = await GetOrParseDbAsync("osu!.db", _cachedOsuDb, _osuDbCacheTimestamp, (path) => Task.Run(() => DatabaseDecoder.DecodeOsu(path)));

        // Update the cache fields if the result is valid
        if (result.HasValue)
        {
            _cachedOsuDb = result.Value.data;
            _osuDbCacheTimestamp = result.Value.timestamp;
        }

        return _cachedOsuDb;
    }

    public async Task<ScoresDatabase?> GetScoresDbAsync()
    {
        var result = await GetOrParseDbAsync("scores.db", _cachedScoresDb, _scoresDbCacheTimestamp, (path) => Task.Run(() => DatabaseDecoder.DecodeScores(path)));

        if (result.HasValue)
        {
            _cachedScoresDb = result.Value.data;
            _scoresDbCacheTimestamp = result.Value.timestamp;
        }

        return _cachedScoresDb;
    }

    // --- REWRITTEN HELPER METHOD ---
    private async Task<(T? data, DateTime timestamp)?> GetOrParseDbAsync<T>(string fileName, T? cacheField, DateTime cacheTimestamp, Func<string, Task<T>> parseFunc) where T : class
    {
        if (string.IsNullOrEmpty(_stableRootPath))
        {
            _logger.LogWarning("Attempted to get stable DB but path is not set.");
            return null;
        }

        var dbPath = Path.Combine(_stableRootPath, fileName);
        if (!File.Exists(dbPath))
        {
            _logger.LogWarning("{FileName} not found at stable path.", fileName);
            return null;
        }

        var lastWriteTime = File.GetLastWriteTimeUtc(dbPath);

        if (cacheField != null && lastWriteTime <= cacheTimestamp)
        {
            _logger.LogInformation("Returning cached version of {FileName}.", fileName);
            return (cacheField, cacheTimestamp);
        }

        _logger.LogInformation("Parsing {FileName} from disk...", fileName);
        
        var parsedData = await parseFunc(dbPath);
        
        _logger.LogInformation("Finished parsing {FileName}.", fileName);

        // Return a tuple with the new data and timestamp
        return (parsedData, lastWriteTime);
    }
}