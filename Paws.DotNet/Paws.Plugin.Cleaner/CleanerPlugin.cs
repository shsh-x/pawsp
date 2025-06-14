using System.Text.Json;
using Paws.Core.Abstractions;
using Paws.Plugin.Cleaner.Models;
using Paws.Plugin.Cleaner.Services;
using System.Text.Json.Serialization;

namespace Paws.Plugin.Cleaner;

public class CleanerPlugin : IFunctionalExplicitPlugin
{
    private IHostServices? _hostServices;
    public Guid Id => new("D92D43F9-30F3-4A97-8A3A-E0A752A3665A");
    public string Name => "osu!stable Cleaner";
    public string Description => "Cleans beatmap folders of junk files and can replace backgrounds with symlinks.";
    public string Version => "1.1.0";
    public string IconName => "cleaning_services";

    public void Initialize(IHostServices hostServices)
    {
        _hostServices = hostServices;
    }

    public Task<object?> ExecuteCommandAsync(string commandName, object? payload)
    {
        if (_hostServices == null) throw new InvalidOperationException("Plugin is not initialized.");

        switch (commandName)
        {
            case "get-default-osu-root":
                return Task.FromResult<object?>(GetDefaultOsuRootPath());
            
            case "check-path-validity":
                var path = (payload as JsonElement?)?.GetString();
                if (string.IsNullOrEmpty(path)) return Task.FromResult<object?>(false);
                return Task.FromResult<object?>(File.Exists(Path.Combine(path, "osu!.exe")));

            case "start-clean":
                return HandleStartClean(payload);

            default:
                throw new NotImplementedException($"Command '{commandName}' is not implemented.");
        }
    }

    // --- METHOD UPDATED ---
    private Task<object?> HandleStartClean(object? payload)
    {
        if (payload is not JsonElement element) throw new ArgumentException("Payload is not in the expected format.");
        
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true, Converters = { new JsonStringEnumConverter() } };
        var cleanerParams = element.Deserialize<CleanerParams>(options);

        if (cleanerParams == null || string.IsNullOrEmpty(cleanerParams.OsuPath))
        {
            throw new ArgumentException("Cleaner parameters are invalid or OsuPath is missing.");
        }

        return Task.Run<object?>(() =>
        {
            // --- THIS IS THE KEY CHANGE ---
            // Define the path to the assets bundled with the application.
            var internalAssetsPath = Path.Combine(AppContext.BaseDirectory, "assets");
            // Pass this path to the service.
            var cleanerService = new CleanerService(cleanerParams, _hostServices!, internalAssetsPath);

            var result = cleanerService.StartClean();
            return new { Message = $"Cleaning complete. Processed: {result.processed}, Deleted: {result.deleted}, Errors: {result.errors}", Success = true };
        });
    }

    private string? GetDefaultOsuRootPath()
    {
        if (!OperatingSystem.IsWindows()) return null;
        
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var defaultOsuPath = Path.Combine(localAppData, "osu!");

        if (File.Exists(Path.Combine(defaultOsuPath, "osu!.exe")))
        {
            return defaultOsuPath;
        }

        return null;
    }
}