using System.Collections.Generic;
using System.Linq;
using CustomPlayerEffects;
using MEC;
using PlayerRoles;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;
using Player = LabApi.Features.Wrappers.Player;


namespace ZombieCake;

public static class EventHandlers
{
    private static CoroutineHandle _cakeDetectionLoop;

    public static void RegisterEvents()
    {
        _cakeDetectionLoop = Timing.RunCoroutine(MainLoop());
    }

    public static void UnregisterEvents()
    {
        Timing.KillCoroutines(_cakeDetectionLoop);
    }

    private static IEnumerator<float> MainLoop()
    {
        while (true)
        {
            foreach (Player player in Player.ReadyList.TakeWhile(player => player.Role == RoleTypeId.Scp0492))
            {
                // Draw a raycast from the players eyes to see if they are looking at a cake
                Vector3 origin = player.Camera.position;
                Vector3 direction = player.Camera.forward;
                origin += direction * 0.5f; // Move the origin a bit forward to avoid hitting the player itself
                if (!Physics.Raycast(origin, direction, out RaycastHit hit, 2.8f, Physics.AllLayers)) continue;
                if (Player.TryGet(hit.transform.gameObject, out _)) continue;

                if (hit.transform.parent.name != "cake") continue;

                if (player.TryGetEffect("Scp559Effect", out _)) continue;
                
                player.SendHitMarker();
                Timing.CallDelayed(0.5f, () => player.SendHitMarker());
                Timing.CallDelayed(1f, () => player.SendHitMarker());
                Timing.CallDelayed(1.25f, () => player.SendHitMarker());
                Timing.CallDelayed(1.35f, () => player.SendHitMarker());
                
                player.EnableEffect<Scp559Effect>();
                player.EnableEffect<MovementBoost>(10);

                Logger.Debug("Granted cake effects to " + player.Nickname);
            }

            yield return Timing.WaitForSeconds(1f);
        }
    }
}