using System;
using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;
using MEC;

namespace Eventim.Events;

public class RandomItems : IEvent
{
    private static readonly Random Rng = new();

    private static readonly ItemType[] ValidItems = Enum.GetValues(typeof(ItemType))
        .Cast<ItemType>()
        .Where(item =>
            item != ItemType.None &&
            !item.ToString().StartsWith("Ammo"))
        .ToArray();

    private static CoroutineHandle _coroutineHandle;

    public string Name => "randomItems";

    public string Description =>
        "Alle 10 Sekunden erhalt jeder Spieler ein zufalliges Item! Was erwartet dich wohl?";

    public List<string> Rules =>
    [
        // No special rules for this event :3
    ];

    public void RegisterEvents()
    {
        _coroutineHandle = Timing.RunCoroutine(ItemLoop());
    }

    public void UnregisterEvents()
    {
        Timing.KillCoroutines(_coroutineHandle);
    }

    private static IEnumerator<float> ItemLoop()
    {
        while (true)
        {
         
           // Wait for 10 seconds before continuing:
           yield return Timing.WaitForSeconds(10f);

            // Give items
            foreach (Player player in Player.ReadyList.Where(p => p.IsHuman && !p.IsDummy))
            {
                ItemType randomItem = ValidItems[Rng.Next(ValidItems.Length)];
                player.AddItem(randomItem);
            }
        }
    }
}
