using System;

namespace Paws.Core.Abstractions
{
    /// <summary>
    /// Thrown when a write operation is attempted on the lazer database while the osu!lazer process is running.
    /// </summary>
    public class LazerIsRunningException : InvalidOperationException
    {
        public LazerIsRunningException() : base("Cannot perform write operation while osu!lazer is running. Please close the game and try again.")
        {
        }
    }
}