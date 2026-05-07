using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class CureAll : IEvent
{
    public EventType EventType { get; } = EventType.Heavenly;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.DisableAllEffects();
        EventHandlers.PushUserMessage(player, "Die Münze heilt dich von allem! Du bist gerettet!");
    }
}