using System.Collections.Generic;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using UnityEngine;

namespace Eventim.Events;

public class PinataRound : IEvent
{
    public string Name => "Piñata Fieber";
    public string Description => "";
    public List<string> Rules =>
    [
        // No special rules for this event :3
    ];
    
    public void RegisterEvents()
    {
        PlayerEvents.Death += OnDeath;
    }
    
    public void UnregisterEvents()
    {
        PlayerEvents.Death -= OnDeath;
    }
    
    private static void OnDeath(PlayerDeathEventArgs ev)
    {
        int itemAmount = 5; // default for now
        
        while (itemAmount > 0)
        {
            Pickup item = Pickup.Create(ItemType.Adrenaline, ev.Player.Position, ev.Player.Rotation);
            
            if (item == null || item.Rigidbody == null || ev.Player.GameObject == null)
                continue;
            
            item.Rigidbody.AddForce(ev.Player.GameObject.transform.forward * 0.8f + Vector3.up * 0.4f, ForceMode.Impulse);
            
            itemAmount--;
        }
    }
}