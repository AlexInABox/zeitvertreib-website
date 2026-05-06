using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class OneHp : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return player.Health > 1f;
    }

    public void Run(Player player)
    {
        player.Health = 1f;
        EventHandlers.PushUserMessage(player, "Die Münze lässt dich am seidenen Faden hängen... 1 HP. Viel Glück.");
    }
}
