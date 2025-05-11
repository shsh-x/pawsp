// Paws.DotNet/Paws.Core.Abstractions/IHostServices.cs
namespace Paws.Core.Abstractions
{
    public interface IHostServices
    {
        void LogMessage(string message, LogLevel level = LogLevel.Information, string? pluginName = null);
        // Potentially add methods to get configuration, shared resources etc.
    }
}