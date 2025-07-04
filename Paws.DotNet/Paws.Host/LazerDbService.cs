using Paws.Core.Abstractions;
using Realms;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Paws.Host
{
    /// <summary>
    /// Manages the connection to the osu!lazer database file.
    /// </summary>
    public class LazerDbService
    {
        private readonly ILogger<LazerDbService> _logger;
        private string? _lazerDbPath;

        public LazerDbService(ILogger<LazerDbService> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Sets the root path of the osu!lazer installation.
        /// </summary>
        public void SetLazerPath(string path)
        {
            var dbPath = Path.Combine(path, "client.realm");
            if (!File.Exists(dbPath))
            {
                _logger.LogWarning("client.realm not found at specified lazer path: {path}", path);
                _lazerDbPath = null;
                return;
            }

            _logger.LogInformation("Lazer database path set to: {dbPath}", dbPath);
            _lazerDbPath = dbPath;
        }

        /// <summary>
        /// Gets a read-only dynamic instance of the lazer Realm database.
        /// </summary>
        /// <returns>A dynamic Realm instance or null if the path is not set/valid.</returns>
        public Realm? GetInstance()
        {
            if (string.IsNullOrEmpty(_lazerDbPath))
            {
                _logger.LogWarning("Attempted to get lazer DB instance, but path is not set.");
                return null;
            }

            try
            {
                // For a dynamic realm, you should NOT specify a schema.
                // The IsDynamic flag tells Realm to discover the schema from the file.
                var config = new RealmConfiguration(_lazerDbPath)
                {
                    IsDynamic = true,
                    IsReadOnly = true,
                };

                return Realm.GetInstance(config);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to open lazer database at {path}", _lazerDbPath);
                return null;
            }
        }

        /// <summary>
        /// Gets a writeable dynamic instance of the lazer Realm database.
        /// </summary>
        /// <returns>A dynamic Realm instance or null if the path is not set/valid.</returns>
        /// <exception cref="LazerIsRunningException">Thrown if the osu!lazer process is detected.</exception>
        public Realm? GetWriteableInstance()
        {
            if (string.IsNullOrEmpty(_lazerDbPath))
            {
                _logger.LogWarning("Attempted to get writeable lazer DB instance, but path is not set.");
                return null;
            }

            // Check if lazer is running before attempting to get a write lock.
            string processName = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "osu!" : "osu";
            if (Process.GetProcessesByName(processName).Any())
            {
                throw new LazerIsRunningException();
            }

            try
            {
                // The same configuration applies here for the writeable instance.
                // No schema should be specified.
                var config = new RealmConfiguration(_lazerDbPath)
                {
                    IsDynamic = true,
                    IsReadOnly = false,
                };

                return Realm.GetInstance(config);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to open lazer database for writing at {path}", _lazerDbPath);
                return null;
            }
        }
    }
}