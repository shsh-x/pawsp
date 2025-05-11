using Paws.Core.Abstractions;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace Paws.Host
{
    public class PluginManager
    {
        private readonly List<IFunctionalExplicitPlugin> _loadedPlugins = new();
        private readonly IHostServices _hostServices;
        private readonly string _pluginsDirectory;

        public PluginManager(IHostServices hostServices, Microsoft.Extensions.Hosting.IHostEnvironment environment)
        {
            _hostServices = hostServices;
            // In development, plugins might be in a different relative path than in production.
            // AppContext.BaseDirectory points to bin/Debug/net8.0 for Paws.Host.exe
            _pluginsDirectory = Path.Combine(AppContext.BaseDirectory, "plugins");
            Directory.CreateDirectory(_pluginsDirectory); // Ensure it exists
        }

        public void LoadPlugins()
        {
            _hostServices.LogMessage($"Scanning for plugins in: {_pluginsDirectory}", Paws.Core.Abstractions.LogLevel.Information, "PluginManager");

            if (!Directory.Exists(_pluginsDirectory))
            {
                _hostServices.LogMessage($"Plugins directory not found: {_pluginsDirectory}", Paws.Core.Abstractions.LogLevel.Warning, "PluginManager");
                return;
            }

            foreach (var dllFile in Directory.GetFiles(_pluginsDirectory, "*.dll"))
            {
                try
                {
                    var assembly = Assembly.LoadFrom(dllFile);
                    foreach (var type in assembly.GetTypes())
                    {
                        if (typeof(IFunctionalExplicitPlugin).IsAssignableFrom(type) && !type.IsInterface && !type.IsAbstract)
                        {
                            if (Activator.CreateInstance(type) is IFunctionalExplicitPlugin plugin)
                            {
                                plugin.Initialize(_hostServices);
                                _loadedPlugins.Add(plugin);
                                _hostServices.LogMessage($"Loaded plugin: {plugin.Name} (v{plugin.Version}) from {Path.GetFileName(dllFile)}", Paws.Core.Abstractions.LogLevel.Information, "PluginManager");
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _hostServices.LogMessage($"Error loading plugin from {dllFile}: {ex.Message}", Paws.Core.Abstractions.LogLevel.Error, "PluginManager");
                    // Consider more detailed logging for ex.ToString() in debug.
                }
            }
            _hostServices.LogMessage($"Finished loading plugins. {_loadedPlugins.Count} functional explicit plugins loaded.", Paws.Core.Abstractions.LogLevel.Information, "PluginManager");
        }

        public IEnumerable<IFunctionalExplicitPlugin> GetLoadedPlugins()
        {
            return _loadedPlugins.AsReadOnly();
        }

        public IFunctionalExplicitPlugin? GetPluginById(Guid pluginId)
        {
            return _loadedPlugins.FirstOrDefault(p => p.Id == pluginId);
        }
    }
}