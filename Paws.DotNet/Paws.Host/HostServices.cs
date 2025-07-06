using Paws.Core.Abstractions;
using Realms;
using System.Diagnostics;

namespace Paws.Host;

/// <summary>
/// Implements the IHostServices interface, providing a concrete bridge between the Paws framework
/// and individual plugins. It's responsible for handling requests from plugins for framework-level
/// services like database access and logging.
/// </summary>
public class HostServices : IHostServices
{
    private readonly ILogger<HostServices> _logger;
    private readonly LazerDbService _lazerDbService;
    private readonly StableDbService _stableDbService;

    public HostServices(ILogger<HostServices> logger, LazerDbService lazerDbService, StableDbService stableDbService)
    {
        _logger = logger;
        _lazerDbService = lazerDbService;
        _stableDbService = stableDbService;
    }

    /// <inheritdoc/>
    public void LogMessage(string message, PawsLogLvl level = PawsLogLvl.Information, string? pluginName = null)
    {
        // This log goes to the C# console, which is then captured by the Electron main process.
        string prefix = pluginName != null ? $"[{pluginName}] " : "";
        _logger.Log((Microsoft.Extensions.Logging.LogLevel)level, "{Prefix}{Message}", prefix, message);
    }

    /// <inheritdoc/>
    public dynamic? GetLazerDatabase() => _lazerDbService.GetInstance();

    /// <inheritdoc/>
    public Task PerformLazerWriteAsync(Action<Realm> action)
    {
        return Task.Run(() =>
        {
            // This method encapsulates the safety check and transaction management.
            // The plugin developer doesn't need to worry about it.
            using var db = _lazerDbService.GetWriteableInstance();
            if (db == null)
            {
                throw new InvalidOperationException("Failed to open the lazer database for writing. It may be locked or corrupt.");
            }

            using var transaction = db.BeginWrite();
            action(db);
            transaction.Commit();
        });
    }

    /// <inheritdoc/>
    public async Task<object?> GetStableOsuDbAsync() => await _stableDbService.GetOsuDbAsync();

    /// <inheritdoc/>
    public async Task<object?> GetStableScoresDbAsync() => await _stableDbService.GetScoresDbAsync();

    /// <inheritdoc/>
    public Task PerformStableWriteAsync(Action<string> action)
    {
        return Task.Run(() =>
        {
            // 1. Get Path
            var stablePath = _stableDbService.GetStableRootPath();
            if (string.IsNullOrEmpty(stablePath))
                throw new InvalidOperationException("osu!stable path is not set.");
            
            // 2. Safety Check for Running Process
            if (Process.GetProcessesByName("osu!").Any())
                throw new StableIsRunningException();
            
            // 3. Execute the plugin's code, passing the validated path.
            action(stablePath);
        });
    }
}