// Paws.DotNet/Paws.Core.Abstractions/IHostServices.cs
using System;
using System.Threading.Tasks;
using Realms;

namespace Paws.Core.Abstractions
{
    public interface IHostServices
    {
        /// <summary>
        /// Logs a message to the main process console.
        /// </summary>
        /// <param name="message">The message to log.</param>
        /// <param name="level">The severity level of the log.</param>
        /// <param name="pluginName">The name of the plugin logging the message.</param>
        void LogMessage(string message, LogLevel level = LogLevel.Information, string? pluginName = null);

        /// <summary>
        /// Sends an event with a payload directly to the Electron UI.
        /// </summary>
        /// <param name="eventName">The name of the event for the UI to listen for.</param>
        /// <param name="payload">The data to send.</param>
        void SendEventToUI(string eventName, object payload);

        /// <summary>
        /// Gets a dynamic, read-only realm instance for the configured osu!lazer database.
        /// This is safe to use even when lazer is running.
        /// Returns null if the path is not set or the database cannot be opened.
        /// </summary>
        /// <returns>A dynamic, read-only Realm instance, or null.</returns>
        dynamic? GetLazerDatabase();

        /// <summary>
        /// Safely performs a write operation on the lazer database.
        /// Will throw a <see cref="LazerIsRunningException"/> if osu!lazer is detected to be running.
        /// Handles database connection, transactions, and cleanup.
        /// </summary>
        /// <param name="action">The action to perform within a write transaction. The provided Realm instance is dynamic.</param>
        Task PerformLazerWriteAsync(Action<Realm> action);
    }
}