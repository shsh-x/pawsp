using Paws.Plugin.Cleaner.Enums;

namespace Paws.Plugin.Cleaner.Models;

public record CleanerParams
{

    public int MaxThreads { get; init; } = 1;

    // We now take the main osu! path, not the songs path
    public required string OsuPath { get; init; }

    public List<OsuGameMode> DeleteModes { get; init; } = new();
    
    public bool DeleteStoryboards { get; init; }
    public bool DeleteVideos { get; init; }
    public bool DeleteSkinHitsounds { get; init; }
    public bool DeleteSkinGraphics { get; init; }

    // This now holds asset FILENAMES, not full paths. e.g., { ".png": "white.png" }
    public Dictionary<string, string>? BackgroundReplacement { get; init; }
}