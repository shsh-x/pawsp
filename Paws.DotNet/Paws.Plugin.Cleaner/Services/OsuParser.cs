using System.Text;
using System.Text.RegularExpressions;
using Paws.Plugin.Cleaner.Models;
using Paws.Plugin.Cleaner.Enums; // <<< THIS IS THE FIX. The missing 'using' directive.

namespace Paws.Plugin.Cleaner.Services;

public static class OsuParser
{
    private static readonly Regex BgRegex = new(@"^0,0,""?(?<filename>.+?)\""?(?:,|$)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex VideoRegex = new(@"^(?:Video|1),\d+,""?(?<filename>.+?)\""?(?:,|$)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex SbAssetRegex = new(@"^(?:Sprite|Animation|Sample),.+?,""?(?<filename>.+?\.(?:png|jpe?g|mp3|wav|ogg))""?", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Encoding[] PossibleEncodings = {
        Encoding.UTF8,
        Encoding.GetEncoding("iso-8859-1"),
        Encoding.GetEncoding(1251),
        Encoding.GetEncoding(1252),
    };

    public static OsuFile? ParseOsuFile(string filePath)
    {
        try
        {
            var osuFile = new OsuFile { FilePath = filePath };
            string[] lines = ReadFileWithEncodings(filePath);
            bool inEventsSection = false;

            foreach (var line in lines)
            {
                var trimmedLine = line.Trim();
                if (string.IsNullOrEmpty(trimmedLine) || trimmedLine.StartsWith("//")) continue;

                if (trimmedLine.StartsWith("[Events]", StringComparison.OrdinalIgnoreCase)) { inEventsSection = true; continue; }
                if (trimmedLine.StartsWith("[")) { inEventsSection = false; continue; }

                if (trimmedLine.StartsWith("AudioFilename:", StringComparison.OrdinalIgnoreCase))
                {
                    osuFile.AudioFilename = trimmedLine.Split(':', 2)[1].Trim();
                }
                else if (trimmedLine.StartsWith("Mode:", StringComparison.OrdinalIgnoreCase))
                {
                    if (int.TryParse(trimmedLine.Split(':', 2)[1].Trim(), out var modeInt))
                    {
                        osuFile.Mode = (OsuGameMode)modeInt;
                    }
                }
                else if (inEventsSection)
                {
                    var bgMatch = BgRegex.Match(trimmedLine);
                    if (bgMatch.Success)
                    {
                        osuFile.BackgroundFilename = bgMatch.Groups["filename"].Value;
                        continue;
                    }

                    var videoMatch = VideoRegex.Match(trimmedLine);
                    if (videoMatch.Success)
                    {
                        osuFile.VideoFilename = videoMatch.Groups["filename"].Value;
                        continue;
                    }
                    
                    var sbAssetMatch = SbAssetRegex.Match(trimmedLine);
                    if (sbAssetMatch.Success)
                    {
                        osuFile.StoryboardAssets.Add(sbAssetMatch.Groups["filename"].Value);
                    }
                }
            }
            return osuFile;
        }
        catch { return null; }
    }
    
    public static HashSet<string> ParseOsbFileAssets(string folderPath)
    {
        var assets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var osbFiles = Directory.GetFiles(folderPath, "*.osb");

        if (osbFiles.Length == 0) return assets;

        try
        {
            string[] lines = ReadFileWithEncodings(osbFiles[0]);
            foreach (var line in lines)
            {
                var match = SbAssetRegex.Match(line.Trim());
                if (match.Success)
                {
                    assets.Add(match.Groups["filename"].Value);
                }
            }
        }
        catch { /* Fail silently */ }
        
        return assets;
    }

    private static string[] ReadFileWithEncodings(string filePath)
    {
        foreach (var encoding in PossibleEncodings)
        {
            try { return File.ReadAllLines(filePath, encoding); }
            catch (DecoderFallbackException) { continue; }
        }
        throw new Exception($"Could not read file {filePath} with any of the supported encodings.");
    }
}