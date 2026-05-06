using LabApi.Features.Wrappers;
using MEC;

namespace Flipped.Events;

public class FakeRestart : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.SendBroadcast("Der Server wird gleich neugestartet", 5, Broadcast.BroadcastFlags.Normal, true);
        Timing.CallDelayed(7f, () =>
        {
            player.Kick("Server Neustart");
        });
    }
}
