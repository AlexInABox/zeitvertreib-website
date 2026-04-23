using System;
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
        List<(ItemType Type, string Name)> pool =
        [
            (ItemType.Medkit,            "Verbandskasten"),
            (ItemType.Adrenaline,        "Adrenalin"),
            (ItemType.Painkillers,       "Schmerzmittel"),
            (ItemType.Flashlight,        "Taschenlampe"),
            (ItemType.Radio,             "Radio"),
            (ItemType.GrenadeFlash,      "Blendgranate"),
            (ItemType.KeycardMTFPrivate, "MTF-Private-Schlüsselkarte"),
            (ItemType.Coin,              "Münze"),
        ];

        int index = EventHandlers.Random.Next(pool.Count);
        player.AddItem(pool[index].Type);
    }
}
