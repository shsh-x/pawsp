using Paws.Core.Abstractions;
using System;
using System.Threading.Tasks;

namespace Paws.Plugin.Dummy
{
    public class DummyPlugin : IFunctionalExplicitPlugin
    {
        private IHostServices? _hostServices;

        public Guid Id => new Guid("11223344-5566-7788-99AA-BBCCDDEEFF00"); // Fixed GUID for testing
        public string Name => "Dummy Plugin";
        public string Description => "A simple plugin for testing the Paws framework.";
        public string Version => "0.1.0";
        public string IconName => "bug_report"; // Example Material Design Icon name

        public void Initialize(IHostServices hostServices)
        {
            _hostServices = hostServices;
            _hostServices?.LogMessage("DummyPlugin Initialized!", Paws.Core.Abstractions.LogLevel.Information, Name);
        }

        public Task<object?> ExecuteCommandAsync(string commandName, object? payload)
        {
            _hostServices?.LogMessage($"ExecuteCommandAsync called: {commandName}", Paws.Core.Abstractions.LogLevel.Debug, Name);
            if (commandName == "greet")
            {
                string name = payload as string ?? "World";
                return Task.FromResult<object?>($"Hello, {name} from DummyPlugin!");
            }
            // It's often better to throw NotImplementedException or a custom exception
            // for unknown commands, rather than returning a generic message object.
            // The Host's API endpoint will catch this and return BadRequest.
             throw new NotImplementedException($"Command '{commandName}' is not implemented in DummyPlugin.");
        }
    }

    public class AnotherDummyPlugin : IFunctionalExplicitPlugin
    {
        private IHostServices? _hostServices;

        public Guid Id => new Guid("AABBCCDD-EEFF-0011-2233-445566778899");
        public string Name => "Another Dummy";
        public string Description => "Yet another amazing dummy plugin.";
        public string Version => "1.0.0";
        public string IconName => "extension";

        public void Initialize(IHostServices hostServices)
        {
            _hostServices = hostServices;
            _hostServices?.LogMessage("AnotherDummyPlugin Initialized!", Paws.Core.Abstractions.LogLevel.Information, Name);
        }
        public Task<object?> ExecuteCommandAsync(string commandName, object? payload)
        {
             _hostServices?.LogMessage($"AnotherDummy ExecuteCommandAsync: {commandName}", Paws.Core.Abstractions.LogLevel.Debug, Name);
            if (commandName == "ping")
            {
                return Task.FromResult<object?>("pong from AnotherDummy!");
            }
            throw new NotImplementedException($"Command '{commandName}' is not implemented in AnotherDummyPlugin.");
        }
    }
}