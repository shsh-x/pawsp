using System;

namespace Paws.Host
{
    public class HostServices : Paws.Core.Abstractions.IHostServices 
    {
        public void LogMessage(string message, Paws.Core.Abstractions.LogLevel level = Paws.Core.Abstractions.LogLevel.Information, string? pluginName = null)
        {
            string prefix = pluginName != null ? $"[{pluginName}] " : "";
            Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] HOST_SERVICE_LOG ({level}): {prefix}{message}");
        }
    }
}