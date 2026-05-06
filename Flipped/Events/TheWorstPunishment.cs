using LabApi.Features.Wrappers;
using MEC;

namespace Flipped.Events;

public class TheWorstPunishment : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return false;
    }

    public void Run(Player player)
    {
        EventHandlers.PushUserMessage(player,
            "Die Münze verbannt dich in die Hölle. Einem der schlimmsten Orte auf diesem Planeten...");
        Timing.CallDelayed(5f, () => { player.RedirectToServer(7200); });
        player.ClearBroadcasts();
    }
}