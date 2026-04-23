using System;
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
        List<(ItemType Type, string Name)> pool =
        [
            (ItemType.SCP500,  "SCP-500"),
            (ItemType.SCP207,  "SCP-207"),
            (ItemType.SCP268,  "SCP-268"),
            (ItemType.SCP1853, "SCP-1853"),
            (ItemType.SCP2176, "SCP-2176"),
            (ItemType.SCP1576, "SCP-1576"),
            (ItemType.SCP330,  "SCP-330"),
        ];

        int index = EventHandlers.Random.Next(pool.Count);
        player.AddItem(pool[index].Type);
    }
}
