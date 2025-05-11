// Paws.DotNet/Paws.Core.Abstractions/IPlugin.cs
using System;

namespace Paws.Core.Abstractions
{
    public interface IPlugin
    {
        Guid Id { get; } // Unique identifier for the plugin
        string Name { get; }
        string Description { get; }
        string Version { get; }
    }
}