using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class SixSeven : IEvent
{
    public EventType EventType { get; } = EventType.Neutral;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.SendBroadcast("67", 600, Broadcast.BroadcastFlags.Normal, true);
    }
}