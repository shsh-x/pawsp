using Paws.Core.Abstractions;
using Paws.Plugin.Cleaner.Models;

namespace Paws.Plugin.Cleaner.Services;

public class CleanerService
{
    private readonly CleanerParams _params;
    private readonly IHostServices _logger;
    private readonly string _songsPath;
    private readonly string _osuAssetsPath;
    private readonly string _internalAssetsPath;

    public CleanerService(CleanerParams cleanerParams, IHostServices logger, string internalAssetsPath)
    {
        _params = cleanerParams;
        _logger = logger;
        _songsPath = Path.Combine(cleanerParams.OsuPath, "Songs");
        _osuAssetsPath = Path.Combine(cleanerParams.OsuPath, "PawsAssets");
        _internalAssetsPath = internalAssetsPath;
    }

    public (int processed, int deleted, int errors) StartClean()
    {
        if (!Directory.Exists(_songsPath))
        {
            _logger.LogMessage($"Songs folder not found at '{_songsPath}'", LogLevel.Error, "Cleaner");
            return (0, 0, 1);
        }

        if (_params.BackgroundReplacement != null)
        {
            Directory.CreateDirectory(_osuAssetsPath);
        }
        
        var allFolders = Directory.GetDirectories(_songsPath).ToList();
        _logger.LogMessage($"Found {allFolders.Count} total folders to process.", LogLevel.Information, "Cleaner");
        
        var parallelOptions = new ParallelOptions
        {
            MaxDegreeOfParallelism = _params.MaxThreads > 0 ? _params.MaxThreads : -1
        };

        long progressCounter = 0;
        int processedCount = 0;
        int deletedCount = 0;
        int errorCount = 0;

        Parallel.ForEach(allFolders, parallelOptions, folderPath =>
        {
            long currentProgress = Interlocked.Increment(ref progressCounter);
            double progressPercentage = ((double)currentProgress / allFolders.Count) * 100.0;
            _logger.LogMessage($"[PROGRESS] {progressPercentage:F2}", LogLevel.Trace, "Cleaner");

            try
            {
                if (CleanFolder(folderPath))
                {
                    Interlocked.Increment(ref deletedCount);
                }
                else
                {
                    Interlocked.Increment(ref processedCount);
                }
            }
            catch (Exception ex)
            {
                _logger.LogMessage($"Critical error cleaning folder '{folderPath}': {ex.Message}", LogLevel.Error, "Cleaner");
                Interlocked.Increment(ref errorCount);
            }
        });
        
        _logger.LogMessage($"Cleaning finished. Processed: {processedCount}, Deleted: {deletedCount}, Errors: {errorCount}", LogLevel.Information, "Cleaner");
        return (processedCount, deletedCount, errorCount);
    }

    private bool CleanFolder(string folderPath)
    {
        // 1. Parse all .osu files
        var allOsuFiles = Directory.GetFiles(folderPath, "*.osu")
                                   .Select(OsuParser.ParseOsuFile)
                                   .Where(f => f != null)
                                   .ToList();

        if (allOsuFiles.Count == 0)
        {
            Directory.Delete(folderPath, true);
            return true;
        }

        // 2. Determine which .osu files to keep and which to delete
        var filesToDelete = allOsuFiles.Where(f => _params.DeleteModes.Contains(f!.Mode)).ToList();
        var filesToKeep = allOsuFiles.Except(filesToDelete).ToList();

        if (filesToKeep.Count == 0)
        {
            Directory.Delete(folderPath, true);
            return true;
        }
        
        foreach (var file in filesToDelete) File.Delete(file!.FilePath);

        // 3 & 4. Build a master list of files to KEEP
        var assetsToKeep = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        
        // Add files from difficulties we are keeping
        foreach(var file in filesToKeep)
        {
            if (file!.AudioFilename != null) assetsToKeep.Add(file.AudioFilename);
            if (file!.BackgroundFilename != null) assetsToKeep.Add(file.BackgroundFilename);
            if (file!.VideoFilename != null) assetsToKeep.Add(file.VideoFilename);
            foreach(var sbAsset in file.StoryboardAssets) assetsToKeep.Add(sbAsset);
        }
        
        // Add storyboard assets from .osb if we are keeping storyboards
        if (!_params.DeleteStoryboards)
        {
            var osbAssets = OsuParser.ParseOsbFileAssets(folderPath);
            foreach(var asset in osbAssets) assetsToKeep.Add(asset);
        }
        
        // 5. Delete everything else based on toggles
        foreach (var entryPath in Directory.EnumerateFileSystemEntries(folderPath))
        {
            var fileName = Path.GetFileName(entryPath);
            var extension = Path.GetExtension(fileName).ToLowerInvariant();

            // Always keep the .osu files that survived the mode filter
            if (extension == ".osu" && filesToKeep.Any(f => f!.Filename.Equals(fileName, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            if (assetsToKeep.Contains(fileName)) continue;

            bool shouldDelete = false;
            if (_params.DeleteVideos && (extension == ".mp4" || extension == ".avi" || extension == ".flv")) shouldDelete = true;
            if (_params.DeleteStoryboards && extension == ".osb") shouldDelete = true;
            if (_params.DeleteSkinHitsounds && (extension == ".wav" || extension == ".ogg" || extension == ".mp3")) shouldDelete = true;
            if (_params.DeleteSkinGraphics && (extension == ".png" || extension == ".jpg" || extension == ".jpeg")) shouldDelete = true;

            if (shouldDelete)
            {
                try
                {
                    if (File.Exists(entryPath)) File.Delete(entryPath);
                    else if (Directory.Exists(entryPath)) Directory.Delete(entryPath, true);
                }
                catch (Exception ex)
                {
                    _logger.LogMessage($"Could not delete item '{fileName}': {ex.Message}", LogLevel.Warning, "Cleaner");
                }
            }
        }

        // 6. Final sweep for empty folders
        try
        {
            var subdirectories = Directory.GetDirectories(folderPath);
            foreach (var subDirectory in subdirectories)
            {
                // Check if the directory is empty
                if (!Directory.EnumerateFileSystemEntries(subDirectory).Any())
                {
                    Directory.Delete(subDirectory);
                }
            }
        }
        catch(Exception ex)
        {
             _logger.LogMessage($"Error during empty folder cleanup: {ex.Message}", LogLevel.Warning, "Cleaner");
        }


        // 9. Handle background replacement with symlinks
        if (_params.BackgroundReplacement != null)
        {
            HandleBackgrounds(folderPath, filesToKeep!);
        }
        
        return false;
    }

    private void HandleBackgrounds(string folderPath, List<OsuFile> filesToKeep)
    {
        if (_params.BackgroundReplacement == null) return;
        
        var uniqueBackgrounds = filesToKeep.Select(f => f!.BackgroundFilename)
                                           .Where(f => f != null)
                                           .Distinct(StringComparer.OrdinalIgnoreCase)
                                           .ToList();
        foreach (var bgFile in uniqueBackgrounds)
        {
            var originalBgPath = Path.Combine(folderPath, bgFile!);
            var extension = Path.GetExtension(bgFile!).ToLowerInvariant();

            if (_params.BackgroundReplacement.TryGetValue(extension, out var assetName))
            {
                var assetDestinationPath = Path.Combine(_osuAssetsPath, assetName);
                try
                {
                    if (!File.Exists(assetDestinationPath))
                    {
                        var assetSourcePath = Path.Combine(_internalAssetsPath, assetName);
                        if (File.Exists(assetSourcePath))
                        {
                            File.Copy(assetSourcePath, assetDestinationPath, true);
                        }
                        else
                        {
                            _logger.LogMessage($"Source asset '{assetName}' not found in app assets. Cannot create symlink.", LogLevel.Error, "Cleaner");
                            continue;
                        }
                    }

                    if (File.Exists(originalBgPath)) File.Delete(originalBgPath);
                    File.CreateSymbolicLink(originalBgPath, assetDestinationPath);
                }
                catch (Exception ex)
                {
                    _logger.LogMessage($"Failed to create symlink for '{bgFile}': {ex.Message}", LogLevel.Error, "Cleaner");
                }
            }
        }
    }
}