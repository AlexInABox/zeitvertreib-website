using System;
using System.Collections.Generic;
using System.Linq;
using InventorySystem;
using InventorySystem.Items;
using InventorySystem.Items.Usables.Scp330;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using UnityEngine;
using Random = System.Random;
using Scp330Pickup = InventorySystem.Items.Usables.Scp330.Scp330Pickup;


namespace Eventim.Events;

public class PinataRound : IEvent
{
    private const int ItemAmount = 20;
    private static readonly Random Rng = new();

    private static readonly CandyKindID[] ValidCandyKinds = Enum.GetValues(typeof(CandyKindID))
        .Cast<CandyKindID>()
        .Where(kind => kind != CandyKindID.None)
        .ToArray();

    public string Name => "Piñata Fieber";
    public string Description => "";

    public List<string> Rules =>
    [
        // No special rules for this event :3
    ];


    public void RegisterEvents()
    {
        PlayerEvents.Dying += OnDying;
    }

    public void UnregisterEvents()
    {
        PlayerEvents.Dying -= OnDying;
    }

    private static void OnDying(PlayerDyingEventArgs ev)
    {
        //Guarante an emtpy inventory!
        ev.Player.DropAllItems();

        for (int i = 0; i < ItemAmount; i++)
        {
            Scp330Bag bag =
                ev.Player.ReferenceHub.inventory.ServerAddItem(ItemType.SCP330,
                    ItemAddReason.AdminCommand) as Scp330Bag;
            CandyKindID candy = ValidCandyKinds[Rng.Next(ValidCandyKinds.Length)];
            Scp330Item.Get(bag)!.SetCandies([candy]);
            Scp330Pickup pickup = (Scp330Pickup)bag!.ServerDropItem(true);
            pickup.NetworkExposedCandy = candy;
            pickup.Position += new Vector3(
                UnityEngine.Random.Range(-0.25f, 0.25f),
                UnityEngine.Random.Range(-0.25f, 0.25f),
                UnityEngine.Random.Range(-0.25f, 0.25f)
            );
        }

        Vector3 pos = ev.Player.Position;
        pos.y -= 0.5f;
        TimedGrenadeProjectile.SpawnActive(pos, ItemType.GrenadeHE, null, 0.1f);
    }
}