// Paws.DotNet/Paws.Core.Abstractions/IHostServices.cs
namespace Paws.Core.Abstractions
{
    public interface IHostServices
    {
        void LogMessage(string message, LogLevel level = LogLevel.Information, string? pluginName = null);

        /// <summary>
        /// Sends an event with a payload directly to the Electron UI.
        /// </summary>
        /// <param name="eventName">The name of the event for the UI to listen for.</param>
        /// <param name="payload">The data to send.</param>
        void SendEventToUI(string eventName, object payload);
    }
}