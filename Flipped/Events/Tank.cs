using System;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class Tank : IEvent
{
    public EventType EventType { get; } = EventType.Heavenly;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        float newMax = Math.Min(player.MaxHealth * 2f, 400f);
        player.MaxHealth = newMax;
        player.Health = newMax;

        EventHandlers.PushUserMessage(player, "Die Münze macht deine Haut zu Stahl! Du bist unaufhaltbar!");
    }
}
