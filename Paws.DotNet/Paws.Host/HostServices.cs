using System;
// We intentionally do not add "using Paws.Core.Abstractions;" to avoid ambiguity.
// We will use the full name for the types from that namespace instead.

namespace Paws.Host
{
    // The delegate and event that will allow us to talk back to Program.cs
    public delegate void UiEventRequestHandler(string eventName, object payload);

    // We explicitly implement Paws.Core.Abstractions.IHostServices
    public class HostServices : Paws.Core.Abstractions.IHostServices
    {
        // This event will be subscribed to in Program.cs
        public event UiEventRequestHandler? OnUiEventRequested;

        // --- FIX ---
        // We now use the full type name 'Paws.Core.Abstractions.LogLevel'
        // to tell the compiler exactly which one we mean.
        public void LogMessage(string message, Paws.Core.Abstractions.LogLevel level = Paws.Core.Abstractions.LogLevel.Information, string? pluginName = null)
        {
            string prefix = pluginName != null ? $"[{pluginName}] " : "";
            Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] HOST_SERVICE_LOG ({level}): {prefix}{message}");
        }

        // This method was added in the previous step and is correct.
        public void SendEventToUI(string eventName, object payload)
        {
            // Invoke the event, which will be handled in Program.cs to send the IPC message
            OnUiEventRequested?.Invoke(eventName, payload);
        }
    }
}