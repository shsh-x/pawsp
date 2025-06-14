using Paws.Plugin.Cleaner.Enums;

namespace Paws.Plugin.Cleaner.Models;

public record OsuFile
{
    public required string FilePath { get; init; }
    public string Filename => Path.GetFileName(FilePath);
    public string? AudioFilename { get; set; }
    public string? BackgroundFilename { get; set; }
    public string? VideoFilename { get; set; }
    public OsuGameMode Mode { get; set; }
    // --- NEW PROPERTY ---
    public HashSet<string> StoryboardAssets { get; } = new(StringComparer.OrdinalIgnoreCase);
}