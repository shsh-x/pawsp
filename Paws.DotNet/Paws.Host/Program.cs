using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Paws.Core.Abstractions;
using Paws.Host;
using System;
using System.Linq;           // Add this for LINQ Select

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5088");

// Register HostServices and PluginManager
builder.Services.AddSingleton<IHostServices, HostServices>();
builder.Services.AddSingleton<PluginManager>(); // PluginManager will be created once

builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

// Load plugins after the app is built but before it runs
// This ensures services like IHostEnvironment (used by PluginManager indirectly) are available.
var pluginManager = app.Services.GetRequiredService<PluginManager>();
pluginManager.LoadPlugins(); // <<< LOAD PLUGINS HERE

Console.WriteLine("Paws.Host C# Backend starting..."); // Moved this message after plugin loading attempt

app.MapGet("/api/health", () => {
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] GET /api/health requested");
    return Results.Ok(new { Status = "Healthy", Timestamp = DateTime.UtcNow });
});

app.MapGet("/api/plugins", (PluginManager pm) => { // Inject PluginManager
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] GET /api/plugins requested");
    var plugins = pm.GetLoadedPlugins()
                    .Select(p => new { p.Id, p.Name, p.IconName, p.Description, p.Version }) // Select only what UI needs
                    .ToList();
    return Results.Ok(plugins);
});

// Placeholder for executing plugin commands
app.MapPost("/api/plugins/{pluginId}/execute", async (Guid pluginId, ExecuteCommandRequest request, PluginManager pm) =>
{
    var plugin = pm.GetPluginById(pluginId);
    if (plugin == null)
    {
        return Results.NotFound(new { Message = $"Plugin with ID {pluginId} not found." });
    }

    try
    {
        // Ensure request.CommandName is not null or empty
        if (string.IsNullOrEmpty(request.CommandName))
        {
            return Results.BadRequest(new { Message = "CommandName is required." });
        }
        var result = await plugin.ExecuteCommandAsync(request.CommandName, request.Payload);
        return Results.Ok(result);
    }
    catch (NotImplementedException)
    {
        return Results.BadRequest(new { Message = $"Command '{request.CommandName}' is not implemented by plugin '{plugin.Name}'." });
    }
    catch (Exception ex)
    {
        // Log the full exception server-side
        var hostServices = app.Services.GetRequiredService<IHostServices>();
        hostServices.LogMessage($"Plugin '{plugin.Name}' received unknown command: '{request.CommandName}'", Paws.Core.Abstractions.LogLevel.Warning);
        return Results.Problem($"An error occurred while executing the command: {ex.Message}");
    }
});

Console.WriteLine($"Listening on http://localhost:5088");
Console.WriteLine("Send SIGINT (Ctrl+C) or SIGTERM to shutdown.");

app.Run();

// Define a record for the request body of execute command
public record ExecuteCommandRequest(string CommandName, object? Payload);