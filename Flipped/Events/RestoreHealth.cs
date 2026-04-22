using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class RestoreHealth : IEvent
{
    public EventType EventType { get; } = EventType.Heavenly;

    public bool CanRun(Player player)
    {
        return player.Health < player.MaxHealth;
    }

    public void Run(Player player)
    {
        player.Health = player.MaxHealth;
    }
}