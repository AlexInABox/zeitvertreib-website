using System.Collections.Generic;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class GiveItem : IEvent
{
    public EventType EventType { get; } = EventType.Good;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        List<ItemType> pool =
        [
            ItemType.Medkit,
            ItemType.Adrenaline,
            ItemType.Painkillers,
            ItemType.Flashlight,
            ItemType.Radio,
            ItemType.GrenadeFlash,
            ItemType.KeycardMTFPrivate,
            ItemType.Coin,
        ];

        int index = EventHandlers.Random.Next(pool.Count);
        player.AddItem(pool[index]);
    }
}
