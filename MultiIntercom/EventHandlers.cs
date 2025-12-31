using System.Collections.Generic;
using System.Linq;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MapGeneration;
using MEC;
using PlayerRoles.Voice;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;
using PrimitiveObjectToy = AdminToys.PrimitiveObjectToy;

namespace MultiIntercom;

public static class EventHandlers
{
    private static CoroutineHandle _intercomLogicCoroutine;
    public static void RegisterEvents()
    {
        ServerEvents.MapGenerated += (_) =>
        {
            _intercomLogicCoroutine = Timing.RunCoroutine(IntercomLogicLoop());
        };
        
        ServerEvents.RoundRestarted += () =>
        {
            Timing.KillCoroutines(_intercomLogicCoroutine);
        };
    }

    public static void UnregisterEvents()
    {
        Timing.KillCoroutines(_intercomLogicCoroutine);
    }

    private static IEnumerator<float> IntercomLogicLoop()
    {
        Room intercomRoom = Room.Get(RoomName.EzIntercom).First();
        bool intercomWasInUse = false;
        
        
        while (true)
        {
            bool isInUse = Intercom.State == IntercomState.InUse;

            if (isInUse)
                // Only update overrides when state changes or new players enter/leave
                foreach (Player player in Player.List)
                    Intercom.TrySetOverride(player.ReferenceHub, intercomRoom.Players.Contains(player));
            else if (intercomWasInUse)
                // Disable overrides only once when leaving "InUse" state
                foreach (Player player in Player.List)
                    Intercom.TrySetOverride(player.ReferenceHub, false);

            intercomWasInUse = isInUse;
            yield return Timing.WaitForSeconds(1f);
        }
    }
}