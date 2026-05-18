using LabApi.Features.Wrappers;
using MEC;

namespace Flipped.Events;

public class Cuffed : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.IsDisarmed = true;

        Timing.CallDelayed(30f, () => { player.IsDisarmed = false; });
        EventHandlers.PushUserMessage(player, "Die Münze liebt es dich gefesselt zu sehen ^^");
    }
}