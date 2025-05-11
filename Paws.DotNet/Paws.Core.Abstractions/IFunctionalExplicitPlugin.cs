// Paws.DotNet/Paws.Core.Abstractions/IFunctionalExplicitPlugin.cs
using System.Threading.Tasks;

namespace Paws.Core.Abstractions
{
    public interface IFunctionalExplicitPlugin : IPlugin
    {
        /// <summary>
        /// Name of the icon to display in the UI (e.g., Material Design Icon name).
        /// </summary>
        string IconName { get; }

        /// <summary>
        /// Called by the host when the plugin is loaded.
        /// </summary>
        void Initialize(IHostServices hostServices);

        /// <summary>
        /// A generic method for the UI to send commands to the plugin.
        /// The plugin defines its own commands and payload/response structures.
        /// </summary>
        /// <param name="commandName">The name of the command to execute.</param>
        /// <param name="payload">Optional data for the command.</param>
        /// <returns>A task representing the asynchronous operation, with an optional result.</returns>
        Task<object?> ExecuteCommandAsync(string commandName, object? payload);
    }
}