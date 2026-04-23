using CustomPlayerEffects;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class Cancer : IEvent
{
    private const float Duration = 1000f;

    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.EnableEffect<Concussed>(1, Duration);
        player.EnableEffect<Disabled>(1, Duration);
        player.EnableEffect<Hemorrhage>(1, Duration);
        player.EnableEffect<Poisoned>(1, Duration);
        EventHandlers.PushUserMessage(player, "Die Münze beschert dich mit Krebs. Wie schrecklich...");
    }
}