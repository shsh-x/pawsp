using Paws.Core.Abstractions;
using Realms;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace Paws.Host
{
    // The delegate and event that will allow us to talk back to Program.cs
    public delegate void UiEventRequestHandler(string eventName, object payload);

    /// <summary>
    /// Implements the IHostServices interface, providing a concrete bridge between the Paws framework
    /// and the individual plugins. It's responsible for handling requests from plugins for framework-level
    /// services like database access, logging, and UI events.
    /// </summary>
    public class HostServices : IHostServices
    {
        // --- Private Fields for Injected Services ---
        private readonly LazerDbService _lazerDbService;
        private readonly StableDbService _stableDbService;

        public event UiEventRequestHandler? OnUiEventRequested;

        /// <summary>
        /// The constructor receives all necessary services from the dependency injection container.
        /// </summary>
        public HostServices(LazerDbService lazerDbService, StableDbService stableDbService)
        {
            _lazerDbService = lazerDbService;
            _stableDbService = stableDbService;
        }

        /// <summary>
        /// Logs a message to the console, prefixed with the plugin's name.
        /// </summary>
        public void LogMessage(string message, Paws.Core.Abstractions.LogLevel level = Paws.Core.Abstractions.LogLevel.Information, string? pluginName = null)
        {
            string prefix = pluginName != null ? $"[{pluginName}] " : "";
            Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] HOST_SERVICE_LOG ({level}): {prefix}{message}");
        }

        /// <summary>
        /// Invokes an event to send a message to the Electron frontend.
        /// </summary>
        public void SendEventToUI(string eventName, object payload)
        {
            OnUiEventRequested?.Invoke(eventName, payload);
        }

        /// <summary>
        /// Gets a read-only dynamic realm instance for the configured osu!lazer database.
        /// </summary>
        public dynamic? GetLazerDatabase()
        {
            return _lazerDbService.GetInstance();
        }

        /// <summary>
        /// Safely performs a write operation on the lazer database after ensuring the game is closed.
        /// </summary>
        public Task PerformLazerWriteAsync(Action<Realm> action)
        {
            return Task.Run(() =>
            {
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

        /// <summary>
        /// Asynchronously gets the parsed osu!stable osu!.db file.
        /// </summary>
        public async Task<object?> GetStableOsuDbAsync() => await _stableDbService.GetOsuDbAsync();

        /// <summary>
        /// Asynchronously gets the parsed osu!stable scores.db file.
        /// </summary>
        public async Task<object?> GetStableScoresDbAsync() => await _stableDbService.GetScoresDbAsync();

        public Task PerformStableWriteAsync(Action<string> action)
        {
            return Task.Run(() =>
            {
                // 1. Get Path
                var stablePath = _stableDbService.GetStableRootPath();
                if (string.IsNullOrEmpty(stablePath))
                    throw new InvalidOperationException("osu!stable path is not set.");
                
                // 2. Safety Check for Running Process
                string processName = "osu!";
                if (Process.GetProcessesByName(processName).Any())
                    throw new StableIsRunningException();
                
                // 3. Execute the plugin's code
                action(stablePath);
            });
        }
    }
}