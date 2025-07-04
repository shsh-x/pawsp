using System;
using System.Threading.Tasks;
using Realms;

namespace Paws.Core.Abstractions
{
    /// <summary>
    /// Defines the set of services that the Paws host provides to all loaded plugins.
    /// This is the primary "contract" between the framework and a plugin.
    /// </summary>
    public interface IHostServices
    {
        /// <summary>
        /// Logs a message to the main Paws console output.
        /// </summary>
        /// <param name="message">The message to log.</param>
        /// <param name="level">The severity level of the message.</param>
        /// <param name="pluginName">The name of the plugin logging the message. Can be left null.</param>
        void LogMessage(string message, LogLevel level = LogLevel.Information, string? pluginName = null);

        /// <summary>
        /// Sends a custom event with a payload directly to the main Electron UI.
        /// Useful for plugins that need to trigger UI changes outside their own iframe.
        /// </summary>
        /// <param name="eventName">The name of the event for the UI to listen for.</param>
        /// <param name="payload">The data to send.</param>
        void SendEventToUI(string eventName, object payload);

        /// <summary>
        /// Gets a read-only, dynamic realm instance for the configured osu!lazer database.
        /// Returns null if the path is not set or the database cannot be opened.
        /// </summary>
        /// <returns>A dynamic Realm instance, or null.</returns>
        dynamic? GetLazerDatabase();

        /// <summary>
        /// Safely performs a write operation on the lazer database.
        /// Will throw a <see cref="LazerIsRunningException"/> if osu!lazer is detected to be running.
        /// Handles database connection, transactions, and cleanup.
        /// </summary>
        /// <param name="action">The action to perform within a write transaction on the dynamic Realm instance.</param>
        Task PerformLazerWriteAsync(Action<Realm> action);

        /// <summary>
        /// Asynchronously gets the parsed osu!stable osu!.db file.
        /// The result is cached after the first read.
        /// </summary>
        /// <returns>A parsed OsuDatabase object, or null if not found.</returns>
        Task<object?> GetStableOsuDbAsync();

        /// <summary>
        /// Asynchronously gets the parsed osu!stable scores.db file.
        /// The result is cached after the first read.
        /// </summary>
        /// <returns>A parsed ScoresDatabase object, or null if not found.</returns>
        Task<object?> GetStableScoresDbAsync();
        
        /// <summary>
        /// Safely performs an action that may write to stable database files.
        /// Provides the root path to the stable installation.
        /// Will throw a <see cref="StableIsRunningException"/> if osu!stable is detected to be running.
        /// </summary>
        /// <param name="action">The action to perform, which receives the path to the stable installation.</param>
        Task PerformStableWriteAsync(Action<string> action);
    }
}