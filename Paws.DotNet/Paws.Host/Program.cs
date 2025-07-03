using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Paws.Core.Abstractions;
using Paws.Host;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Realms; // Required for using Realm types

// This must be registered to support legacy encodings in .osu files if ever needed by a plugin.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);

// --- Service Configuration ---
builder.WebHost.UseUrls("http://localhost:5088");

builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

// Register our custom services for Dependency Injection.
builder.Services.AddSingleton<LazerDbService>();
builder.Services.AddSingleton<IHostServices, HostServices>();
builder.Services.AddSingleton<PluginManager>();

var app = builder.Build();

// --- Application Startup Logic ---
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

// --- API Endpoint Definitions ---

// --- Database Endpoints ---
app.MapPost("/api/db/set-lazer-path", (SetPathRequest request, LazerDbService dbService) =>
{
    if (string.IsNullOrWhiteSpace(request.Path))
        return Results.BadRequest("Path cannot be empty.");

    dbService.SetLazerPath(request.Path);
    return Results.Ok();
});

app.MapGet("/api/db/test-lazer-connection", (LazerDbService dbService) =>
{
    using var db = dbService.GetInstance();

    if (db == null)
    {
        return Results.Problem("Lazer database path is not set or the file is inaccessible. Please set it in Paws settings.", statusCode: 404);
    }

    try
    {
        var beatmapSets = db.DynamicApi.All("BeatmapSet");
        return Results.Ok(new { beatmapSetCount = beatmapSets.Count() });
    }
    catch (Exception ex)
    {
        return Results.Problem($"An error occurred while querying the database: {ex.Message}", statusCode: 500);
    }
});

app.MapGet("/api/db/test-lazer-write", async (IHostServices hostServices) =>
{
    try
    {
        string? modifiedSetTitle = null;

        await hostServices.PerformLazerWriteAsync(db =>
        {
            dynamic? firstSet = db.DynamicApi.All("BeatmapSet").Filter("Protected == false").FirstOrDefault();

            if (firstSet is null)
            {
                modifiedSetTitle = "No unprotected beatmap sets found to test with.";
                return;
            }

            // Perform a safe "no-op" write.
            bool originalValue = firstSet.DeletePending;
            firstSet.DeletePending = !originalValue;
            firstSet.DeletePending = originalValue;

            // Iterate the dynamic 'Beatmaps' collection to get the first item
            dynamic? firstBeatmap = null;
            foreach (var beatmap in firstSet.Beatmaps)
            {
                firstBeatmap = beatmap;
                break; // We only need the first one, so we exit the loop immediately.
            }

            // THE FIX: Use the 'firstBeatmap' variable we just created.
            modifiedSetTitle = $"Successfully performed a test write on beatmap set: {firstBeatmap?.Metadata?.Title ?? "[No Title Found]"}";
        });

        return Results.Ok(new { message = modifiedSetTitle ?? "Write operation completed, but no sets were found to modify." });
    }
    catch (Paws.Core.Abstractions.LazerIsRunningException ex)
    {
        return Results.Problem(ex.Message, statusCode: 423);
    }
    catch (Exception ex)
    {
        return Results.Problem($"An unexpected error occurred: {ex.Message}", statusCode: 500);
    }
});


// --- Plugin Endpoints ---
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

app.MapGet("/api/plugins/pending", (PluginManager pm) =>
{
    var pending = pm.GetPendingPlugins();
    return Results.Ok(pending);
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
    catch (Exception ex)
    {
        var hostServices = app.Services.GetRequiredService<IHostServices>();
        hostServices.LogMessage($"Error executing command '{request.CommandName}' on plugin '{plugin.Name}': {ex}", Paws.Core.Abstractions.LogLevel.Error);
        return Results.Problem($"An error occurred: {ex.Message}");
    }
});

// --- Run Application ---
Console.WriteLine($"Listening on http://localhost:5088");
app.Run();

// --- Supporting Record Types for API Requests ---
public record ExecuteCommandRequest(string CommandName, object? Payload);
public record SetPathRequest(string Path);