namespace Paws.Host;

/// <summary>
/// Service responsible for fetching and managing the list of available plugins from a remote repository.
/// This is the foundation for the "Plugin Store" feature.
/// </summary>
public class PluginRepositoryService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PluginRepositoryService> _logger;
    private List<RemotePluginInfo>? _cachedPluginList;
    private DateTime _lastFetchTime;

    // The URL of the simple JSON file that acts as our plugin repository index.
    private const string PluginRepoUrl = "https://raw.githubusercontent.com/shsh-x/paws-plugins-repo/main/repo.json";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);

    public PluginRepositoryService(IHttpClientFactory httpClientFactory, ILogger<PluginRepositoryService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// Gets the list of available plugins, using a cache to avoid excessive network requests.
    /// </summary>
    public async Task<IEnumerable<RemotePluginInfo>> GetAvailablePluginsAsync()
    {
        if (_cachedPluginList != null && DateTime.UtcNow - _lastFetchTime < CacheDuration)
        {
            _logger.LogInformation("Returning cached plugin repository list.");
            return _cachedPluginList;
        }

        _logger.LogInformation("Fetching fresh plugin repository list from {Url}", PluginRepoUrl);
        var client = _httpClientFactory.CreateClient();
        try
        {
            var plugins = await client.GetFromJsonAsync<List<RemotePluginInfo>>(PluginRepoUrl);
            _cachedPluginList = plugins ?? new List<RemotePluginInfo>();
            _lastFetchTime = DateTime.UtcNow;
            return _cachedPluginList;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch or parse plugin repository.");
            return Enumerable.Empty<RemotePluginInfo>(); // Return empty on error
        }
    }
}

/// <summary>
/// Represents the information for a single plugin as defined in the remote repository JSON.
/// </summary>
public record RemotePluginInfo(
    string Id,
    string Name,
    string Version,
    string Author,
    string Description,
    string DownloadUrl
);