using System.Collections.Generic;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class GiveScpItem : IEvent
{
    public EventType EventType { get; } = EventType.Heavenly;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        List<ItemType> pool =
        [
            ItemType.SCP500,
            ItemType.SCP207,
            ItemType.SCP268,
            ItemType.SCP1853,
            ItemType.SCP2176,
            ItemType.SCP1576,
            ItemType.SCP330
        ];

        int index = EventHandlers.Random.Next(pool.Count);
        player.AddItem(pool[index]);
        EventHandlers.PushUserMessage(player, "Die Münze schenkt dir ein SCP-Item!! <3");
    }
}