using CustomPlayerEffects;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class FlippedMovement : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.EnableEffect<Slowness>(200, 30f); // Inverted movement speed
        EventHandlers.PushUserMessage(player, "Die Münze verdreht dir deine Beine!");
    }
}
