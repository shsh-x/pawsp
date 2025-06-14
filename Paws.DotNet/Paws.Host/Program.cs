using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Paws.Core.Abstractions;
using Paws.Host;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

// This must be registered to support legacy encodings in .osu files
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5088");
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddSingleton<IHostServices, HostServices>();
builder.Services.AddSingleton<PluginManager>();

var app = builder.Build();

var pluginManager = app.Services.GetRequiredService<PluginManager>();

// Get the list of approved plugin GUIDs from the command line arguments
var approvedGuids = new List<string>();
if (args.Length > 0)
{
    var guidsJson = args[0];
    try
    {
        approvedGuids = JsonSerializer.Deserialize<List<string>>(guidsJson) ?? new List<string>();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error deserializing approved GUIDs: {ex.Message}");
    }
}

// Load only the approved plugins
pluginManager.LoadPlugins(approvedGuids);

Console.WriteLine("Paws.Host C# Backend starting...");

// API endpoint to get the list of LOADED plugins
app.MapGet("/api/plugins", (PluginManager pm) =>
{
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] GET /api/plugins requested");
    var loadedPlugins = pm.GetLoadedPlugins();
    var allManifests = pm.GetDiscoveredPluginManifests();

    var result = loadedPlugins.Select(p => {
        var manifest = allManifests.FirstOrDefault(m => m.Id.Equals(p.Id.ToString(), StringComparison.OrdinalIgnoreCase));
        return new { p.Id, p.Name, p.IconName, p.Description, p.Version, Ui = manifest?.Ui };
    }).ToList();

    return Results.Ok(result);
});

// API endpoint to get plugins that were discovered but ARE NOT loaded
app.MapGet("/api/plugins/pending", (PluginManager pm) =>
{
    var pending = pm.GetPendingPlugins();
    return Results.Ok(pending);
});

// API endpoint to execute a command on a specific plugin
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
    catch (Exception ex)
    {
        var hostServices = app.Services.GetRequiredService<IHostServices>();
        hostServices.LogMessage($"Error executing command '{request.CommandName}' on plugin '{plugin.Name}': {ex}", Paws.Core.Abstractions.LogLevel.Error);
        return Results.Problem($"An error occurred: {ex.Message}");
    }
});


Console.WriteLine($"Listening on http://localhost:5088");
app.Run();

// Record used for the /execute endpoint
public record ExecuteCommandRequest(string CommandName, object? Payload);