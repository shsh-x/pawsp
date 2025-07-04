using System;

namespace Paws.Core.Abstractions
{
    /// <summary>
    /// Thrown when a write operation is attempted on the stable database files while the osu! process is running.
    /// </summary>
    public class StableIsRunningException : InvalidOperationException
    {
        public StableIsRunningException() : base("Cannot perform write operation while osu!stable is running. Please close the game and try again.")
        {
        }
    }
}