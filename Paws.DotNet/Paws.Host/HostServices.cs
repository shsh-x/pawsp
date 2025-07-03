using System;
using System.Threading.Tasks;
using Paws.Core.Abstractions;
using Realms;

namespace Paws.Host
{
    // The delegate and event that will allow us to talk back to Program.cs
    public delegate void UiEventRequestHandler(string eventName, object payload);

    // We explicitly implement Paws.Core.Abstractions.IHostServices
    public class HostServices : IHostServices
    {
        private readonly LazerDbService _lazerDbService;
        public event UiEventRequestHandler? OnUiEventRequested;

        // Inject the LazerDbService via the constructor
        public HostServices(LazerDbService lazerDbService)
        {
            _lazerDbService = lazerDbService;
        }

        public void LogMessage(string message, Paws.Core.Abstractions.LogLevel level = Paws.Core.Abstractions.LogLevel.Information, string? pluginName = null)
        {
            string prefix = pluginName != null ? $"[{pluginName}] " : "";
            Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] HOST_SERVICE_LOG ({level}): {prefix}{message}");
        }

        public void SendEventToUI(string eventName, object payload)
        {
            OnUiEventRequested?.Invoke(eventName, payload);
        }

        /// <summary>
        /// Gets a dynamic realm instance for the configured osu!lazer database for READ-ONLY operations.
        /// Returns null if the path is not set or the database cannot be opened.
        /// </summary>
        /// <returns>A dynamic Realm instance, or null.</returns>
        public dynamic? GetLazerDatabase()
        {
            // The return type of GetInstance is Realm, which is dynamic-friendly.
            return _lazerDbService.GetInstance();
        }

        /// <summary>
        /// Safely performs a write operation on the lazer database.
        /// Will throw a <see cref="LazerIsRunningException"/> if osu!lazer is detected to be running.
        /// Handles database connection, transactions, and cleanup.
        /// </summary>
        /// <param name="action">The action to perform within a write transaction.</param>
        public Task PerformLazerWriteAsync(Action<Realm> action)
        {
            // We can make this fully async later if needed, but for now, Task.Run
            // is perfect to move this potentially long-running work off the main thread.
            return Task.Run(() =>
            {
                // The GetWriteableInstance method now contains the process check and will throw if lazer is running.
                // We wrap the entire operation in a using statement to guarantee disposal.
                using var db = _lazerDbService.GetWriteableInstance();

                if (db == null)
                {
                    // This would happen if the DB file is corrupt or locked by something else.
                    throw new InvalidOperationException("Failed to open the lazer database for writing. It may be locked or corrupt.");
                }

                // The using statement will handle rollback on exception.
                using var transaction = db.BeginWrite();

                action(db);

                transaction.Commit();
            });
        }
    }
}