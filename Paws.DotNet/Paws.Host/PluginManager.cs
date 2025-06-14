using Paws.Core.Abstractions;
using System.Reflection;
using System.Text.Json;

namespace Paws.Host
{
    public class PluginManager
    {
        private readonly List<IFunctionalExplicitPlugin> _loadedPlugins = new();
        private readonly List<PluginManifest> _discoveredPluginManifests = new();
        private readonly IHostServices _hostServices;
        private readonly string _pluginsDirectory;

        public PluginManager(IHostServices hostServices)
        {
            _hostServices = hostServices;
            _pluginsDirectory = Path.Combine(AppContext.BaseDirectory, "plugins");
            Directory.CreateDirectory(_pluginsDirectory);
        }

        public void LoadPlugins(IEnumerable<string> approvedGuids)
        {
            var approvedSet = new HashSet<string>(approvedGuids, StringComparer.OrdinalIgnoreCase);
            _hostServices.LogMessage($"Received {approvedSet.Count} approved plugin GUIDs.", Paws.Core.Abstractions.LogLevel.Information, "PluginManager");

            var pluginSubdirectories = Directory.GetDirectories(_pluginsDirectory);

            foreach (var pluginDir in pluginSubdirectories)
            {
                var manifestPath = Path.Combine(pluginDir, "plugin.json");
                if (!File.Exists(manifestPath))
                {
                    _hostServices.LogMessage($"Skipping directory '{Path.GetFileName(pluginDir)}' - no plugin.json found.", Paws.Core.Abstractions.LogLevel.Warning, "PluginManager");
                    continue;
                }

                try
                {
                    var manifestJson = File.ReadAllText(manifestPath);
                    var manifest = JsonSerializer.Deserialize<PluginManifest>(manifestJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    if (manifest == null || string.IsNullOrEmpty(manifest.EntryPoint) || string.IsNullOrEmpty(manifest.Id))
                    {
                        _hostServices.LogMessage($"Invalid or incomplete manifest in '{Path.GetFileName(pluginDir)}'.", Paws.Core.Abstractions.LogLevel.Error, "PluginManager");
                        continue;
                    }
                    
                    _discoveredPluginManifests.Add(manifest);

                    if (!approvedSet.Contains(manifest.Id))
                    {
                        _hostServices.LogMessage($"Plugin '{manifest.Name}' is pending approval.", Paws.Core.Abstractions.LogLevel.Information, "PluginManager");
                        continue;
                    }
                    
                    var entryPointPath = Path.Combine(pluginDir, manifest.EntryPoint);
                    if (!File.Exists(entryPointPath)) {
                        _hostServices.LogMessage($"EntryPoint DLL not found at '{entryPointPath}' for plugin '{manifest.Name}'.", Paws.Core.Abstractions.LogLevel.Error, "PluginManager");
                        continue;
                    }

                    var assembly = Assembly.LoadFrom(entryPointPath);
                    var pluginType = assembly.GetTypes().FirstOrDefault(t => typeof(IFunctionalExplicitPlugin).IsAssignableFrom(t) && !t.IsInterface && !t.IsAbstract);

                    if (pluginType == null)
                    {
                         _hostServices.LogMessage($"No type implementing IFunctionalExplicitPlugin found in '{manifest.EntryPoint}'.", Paws.Core.Abstractions.LogLevel.Error, "PluginManager");
                         continue;
                    }

                    if (Activator.CreateInstance(pluginType) is IFunctionalExplicitPlugin plugin)
                    {
                        plugin.Initialize(_hostServices);
                        _loadedPlugins.Add(plugin);
                        _hostServices.LogMessage($"Loaded approved plugin: {plugin.Name} (v{plugin.Version})", Paws.Core.Abstractions.LogLevel.Information, "PluginManager");
                    }
                }
                catch (Exception ex)
                {
                    _hostServices.LogMessage($"Error loading plugin from '{Path.GetFileName(pluginDir)}': {ex.Message}", Paws.Core.Abstractions.LogLevel.Error, "PluginManager");
                }
            }
            _hostServices.LogMessage($"Finished processing plugins. {_loadedPlugins.Count} loaded, {_discoveredPluginManifests.Count} discovered.", Paws.Core.Abstractions.LogLevel.Information, "PluginManager");
        }

        public IEnumerable<IFunctionalExplicitPlugin> GetLoadedPlugins() => _loadedPlugins.AsReadOnly();
        
        public IEnumerable<PluginManifest> GetDiscoveredPluginManifests() => _discoveredPluginManifests.AsReadOnly();

        public IEnumerable<PluginManifest> GetPendingPlugins()
        {
            var loadedGuids = new HashSet<string>(_loadedPlugins.Select(p => p.Id.ToString()), StringComparer.OrdinalIgnoreCase);
            return _discoveredPluginManifests.Where(m => !loadedGuids.Contains(m.Id));
        }

        public IFunctionalExplicitPlugin? GetPluginById(Guid pluginId) => _loadedPlugins.FirstOrDefault(p => p.Id == pluginId);
    }

    public record PluginManifest(
        string Id,
        string Name,
        string Version,
        string EntryPoint,
        PluginUiManifest? Ui,
        string? Description, // Nullable for safety
        string? Author       // Nullable for safety
    );

    public record PluginUiManifest(
        string Entry,
        string Path
    );
}