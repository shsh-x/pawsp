using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Paws.Core.Abstractions;
using Paws.Host;
using System;
using System.Linq;
using System.Text; // << ADD THIS using statement
using System.Text.Json.Serialization;

// --- START OF THE FIX ---
// This MUST be the first line of executable code to register the encoding providers.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
// --- END OF THE FIX ---

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5088");

builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddSingleton<IHostServices, HostServices>();
builder.Services.AddSingleton<PluginManager>();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

var pluginManager = app.Services.GetRequiredService<PluginManager>();
pluginManager.LoadPlugins();

Console.WriteLine("Paws.Host C# Backend starting...");

app.MapGet("/api/health", () => {
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] GET /api/health requested");
    return Results.Ok(new { Status = "Healthy", Timestamp = DateTime.UtcNow });
});

app.MapGet("/api/plugins", (PluginManager pm) => {
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] GET /api/plugins requested");
    var plugins = pm.GetLoadedPlugins()
                    .Select(p => new { p.Id, p.Name, p.IconName, p.Description, p.Version })
                    .ToList();
    return Results.Ok(plugins);
});

app.MapPost("/api/plugins/{pluginId}/execute", async (Guid pluginId, ExecuteCommandRequest request, PluginManager pm) =>
{
    var plugin = pm.GetPluginById(pluginId);
    if (plugin == null)
    {
        return Results.NotFound(new { Message = $"Plugin with ID {pluginId} not found." });
    }

    try
    {
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
        var hostServices = app.Services.GetRequiredService<IHostServices>();
        hostServices.LogMessage($"Error executing command '{request.CommandName}' for plugin '{plugin.Name}': {ex}", Paws.Core.Abstractions.LogLevel.Error);
        return Results.Problem($"An error occurred while executing the command: {ex.Message}");
    }
});

Console.WriteLine($"Listening on http://localhost:5088");
Console.WriteLine("Send SIGINT (Ctrl+C) or SIGTERM to shutdown.");

app.Run();

public record ExecuteCommandRequest(string CommandName, object? Payload);