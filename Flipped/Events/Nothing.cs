using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class Nothing : IEvent
{
    public EventType EventType { get; } = EventType.Neutral;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        EventHandlers.PushUserMessage(player, "Die Münze macht.. NIX ..und löst sich in Luft auf.");
    }
}