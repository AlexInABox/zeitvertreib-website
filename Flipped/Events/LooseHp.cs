using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class LooseHp : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.Damage(player.Health * 0.1f, "Münzwurf");
    }
}