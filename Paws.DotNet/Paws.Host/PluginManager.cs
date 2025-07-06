using Paws.Core.Abstractions;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Paws.Host;

/// <summary>
/// Manages the discovery, loading, and access to all Paws plugins.
/// </summary>
public class PluginManager
{
    private readonly List<IFunctionalExplicitPlugin> _loadedPlugins = new();
    private readonly List<PluginManifest> _discoveredPluginManifests = new();
    private readonly IHostServices _hostServices;
    private readonly ILogger<PluginManager> _logger;
    private readonly string _pluginsDirectory;
    private readonly JsonSerializerOptions _jsonOptions;

    public PluginManager(IHostServices hostServices, ILogger<PluginManager> logger)
    {
        _hostServices = hostServices;
        _logger = logger;
        _pluginsDirectory = Path.Combine(AppContext.BaseDirectory, "plugins");
        _jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true, Converters = { new JsonStringEnumConverter() } };
        Directory.CreateDirectory(_pluginsDirectory);
    }

    /// <summary>
    /// Scans the plugins directory, validates manifests, and loads only the approved plugins.
    /// </summary>
    /// <param name="approvedGuids">A set of GUIDs for plugins that the user has approved for loading.</param>
    public void DiscoverAndLoadPlugins(IEnumerable<string> approvedGuids)
    {
        var approvedSet = new HashSet<string>(approvedGuids, StringComparer.OrdinalIgnoreCase);
        _logger.LogInformation("Starting plugin discovery. {Count} plugins are pre-approved.", approvedSet.Count);

        foreach (var pluginDir in Directory.GetDirectories(_pluginsDirectory))
        {
            var manifestPath = Path.Combine(pluginDir, "plugin.json");
            if (!File.Exists(manifestPath))
            {
                _logger.LogWarning("Skipping directory '{Directory}' - no plugin.json found.", Path.GetFileName(pluginDir));
                continue;
            }

            try
            {
                var manifest = JsonSerializer.Deserialize<PluginManifest>(File.ReadAllText(manifestPath), _jsonOptions);

                if (manifest is null || string.IsNullOrEmpty(manifest.Id) || string.IsNullOrEmpty(manifest.EntryPoint))
                {
                    _logger.LogError("Invalid or incomplete manifest in '{Directory}'. Skipping.", Path.GetFileName(pluginDir));
                    continue;
                }
                
                _discoveredPluginManifests.Add(manifest);

                if (approvedSet.Contains(manifest.Id))
                {
                    LoadSinglePlugin(manifest, pluginDir);
                }
                else
                {
                    _logger.LogInformation("Plugin '{Name}' ({Id}) is available but not approved.", manifest.Name, manifest.Id);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process manifest in '{Directory}'.", Path.GetFileName(pluginDir));
            }
        }
        _logger.LogInformation("Plugin discovery finished. {LoadedCount} loaded, {DiscoveredCount} discovered in total.", _loadedPlugins.Count, _discoveredPluginManifests.Count);
    }

    private void LoadSinglePlugin(PluginManifest manifest, string pluginDirectory)
    {
        try
        {
            var entryPointPath = Path.Combine(pluginDirectory, manifest.EntryPoint);
            if (!File.Exists(entryPointPath))
            {
                _logger.LogError("EntryPoint DLL not found at '{Path}' for plugin '{Name}'.", entryPointPath, manifest.Name);
                return;
            }

            // Load the assembly into the current application domain.
            var assembly = Assembly.LoadFrom(entryPointPath);
            var pluginType = assembly.GetTypes().FirstOrDefault(t => typeof(IPlugin).IsAssignableFrom(t) && !t.IsInterface && !t.IsAbstract);

            if (pluginType == null)
            {
                 _logger.LogError("No type implementing IPlugin found in '{EntryPoint}'.", manifest.EntryPoint);
                 return;
            }
            
            // Create an instance of the plugin and initialize it.
            if (Activator.CreateInstance(pluginType) is IFunctionalExplicitPlugin plugin)
            {
                plugin.Initialize(_hostServices);
                _loadedPlugins.Add(plugin);
                _logger.LogInformation("Successfully loaded plugin: {Name} (v{Version})", plugin.Name, plugin.Version);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception while loading plugin '{Name}'.", manifest.Name);
        }
    }

    /// <summary>Gets a read-only list of plugins that are loaded and running.</summary>
    public IEnumerable<IFunctionalExplicitPlugin> GetLoadedPlugins() => _loadedPlugins.AsReadOnly();
    
    /// <summary>Gets a read-only list of all plugins that were discovered, whether loaded or not.</summary>
    public IEnumerable<PluginManifest> GetDiscoveredPlugins() => _discoveredPluginManifests.AsReadOnly();

    /// <summary>Gets a list of plugins that have been discovered but are not currently loaded (i.e., pending user approval).</summary>
    public IEnumerable<PluginManifest> GetPendingPlugins()
    {
        var loadedGuids = new HashSet<string>(_loadedPlugins.Select(p => p.Id.ToString()), StringComparer.OrdinalIgnoreCase);
        return _discoveredPluginManifests.Where(m => !loadedGuids.Contains(m.Id));
    }

    /// <summary>Retrieves a specific loaded plugin by its unique ID.</summary>
    public IFunctionalExplicitPlugin? GetPluginById(Guid pluginId) => _loadedPlugins.FirstOrDefault(p => p.Id == pluginId);
}

// --- Manifest Records ---
// Using records for immutable, simple data structures.
public record PluginManifest(
    string Id,
    string Name,
    string Version,
    string EntryPoint,
    string? Author,
    string? Description,
    PluginUiManifest? Ui
);

public record PluginUiManifest(
    string Entry
);