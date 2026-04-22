using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class GainHp : IEvent
{
    public EventType EventType { get; } = EventType.Good;

    public bool CanRun(Player player)
    {
        return player.Health < player.MaxHealth;
    }

    public void Run(Player player)
    {
        player.Heal(player.MaxHealth * 0.1f);
    }
}