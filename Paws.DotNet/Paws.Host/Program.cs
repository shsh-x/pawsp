using Microsoft.AspNetCore.Mvc;
using Paws.Core.Abstractions;
using Paws.Host;
using System.Text;
using System.Text.Json;

// Must be registered to support legacy encodings in .osu files.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);

// --- Service Configuration ---
builder.WebHost.UseUrls("http://localhost:5088");

// Register Paws services as singletons to persist for the app's lifetime.
builder.Services.AddSingleton<LazerDbService>();
builder.Services.AddSingleton<StableDbService>();
builder.Services.AddSingleton<PluginRepositoryService>(); // For the plugin store
builder.Services.AddSingleton<PluginManager>();
builder.Services.AddSingleton<IHostServices, HostServices>();
builder.Services.AddHttpClient(); // For PluginRepositoryService

var app = builder.Build();

// --- Plugin Loading ---
var pluginManager = app.Services.GetRequiredService<PluginManager>();
var logger = app.Services.GetRequiredService<ILogger<Program>>();

var approvedGuids = new List<string>();
if (args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
{
    try
    {
        approvedGuids = JsonSerializer.Deserialize<List<string>>(args[0]) ?? new List<string>();
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error deserializing approved plugin GUIDs from command line.");
    }
}
pluginManager.DiscoverAndLoadPlugins(approvedGuids);

logger.LogInformation("Paws.Host C# Backend started successfully.");

// --- API Endpoints ---

var api = app.MapGroup("/api");

// --- Path Management Endpoints ---
var pathsApi = api.MapGroup("/paths");
pathsApi.MapPost("/stable", ([FromBody] SetPathRequest req, StableDbService service) => {
    service.SetStablePath(req.Path);
    return Results.Ok();
});
pathsApi.MapPost("/lazer", ([FromBody] SetPathRequest req, LazerDbService service) => {
    service.SetLazerPath(req.Path);
    return Results.Ok();
});


// --- Plugin Management Endpoints ---
var pluginsApi = api.MapGroup("/plugins");

pluginsApi.MapGet("/loaded", (PluginManager pm) => {
    // Return a DTO (Data Transfer Object) to control the data shape.
    var result = pm.GetLoadedPlugins().Select(p => {
        var manifest = pm.GetDiscoveredPlugins().FirstOrDefault(m => m.Id.Equals(p.Id.ToString(), StringComparison.OrdinalIgnoreCase));
        return new { p.Id, p.Name, p.Version, p.Description, Ui = manifest?.Ui };
    });
    return Results.Ok(result);
});

pluginsApi.MapGet("/discovered", (PluginManager pm) => Results.Ok(pm.GetDiscoveredPlugins()));
pluginsApi.MapGet("/pending", (PluginManager pm) => Results.Ok(pm.GetPendingPlugins()));

pluginsApi.MapPost("/execute/{pluginId}", async (Guid pluginId, [FromBody] ExecuteCommandRequest req, PluginManager pm) => {
    var plugin = pm.GetPluginById(pluginId);
    if (plugin == null) return Results.NotFound($"Plugin with ID {pluginId} not found or not loaded.");
    if (string.IsNullOrEmpty(req.CommandName)) return Results.BadRequest("CommandName is required.");
    
    try
    {
        var result = await plugin.ExecuteCommandAsync(req.CommandName, req.Payload);
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

// Endpoint for the future plugin store feature
pluginsApi.MapGet("/store", async (PluginRepositoryService repoService) => {
    var availablePlugins = await repoService.GetAvailablePluginsAsync();
    return Results.Ok(availablePlugins);
});

app.Run();

// --- API Request/Response Records ---
public record SetPathRequest(string Path);
public record ExecuteCommandRequest(string CommandName, object? Payload);