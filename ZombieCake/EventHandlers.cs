using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using Christmas.Scp2536;
using MEC;
using PlayerRoles;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;
using Player = LabApi.Features.Wrappers.Player;


namespace ZombieCake;

public static class EventHandlers
{
    private static CoroutineHandle _cakeDetectionLoop;

    private static readonly HttpClient Http = new();

    public static void RegisterEvents()
    {
        _cakeDetectionLoop = Timing.RunCoroutine(MainLoop());
    }

    public static void UnregisterEvents()
    {
        Timing.KillCoroutines(_cakeDetectionLoop);
    }
    
    private const int IgnoredLayers = (1 << 1) | // TransparentFX
                                      (1 << 8) | // Player
                                      (1 << 13) | // Hitbox
                                      (1 << 16) | // InvisibleCollider
                                      (1 << 17) | // Ragdoll
                                      (1 << 18) | // CCTV
                                      (1 << 27) | // Door
                                      (1 << 28) | // Skybox
                                      (1 << 29); // Fence
    
    private static IEnumerator<float> MainLoop()
    {
        while (true)
        {
            foreach (Player player in Player.ReadyList.TakeWhile(player => player.Role == RoleTypeId.Scp0492 ))
            {
                // Draw a raycast from the players eyes to see if they are looking at a cake
                Vector3 origin = player.Camera.position;
                Vector3 direction = player.Camera.forward;
                origin += direction * 0.5f; // Move the origin a bit forward to avoid hitting the player itself
                if (!Physics.Raycast(origin, direction, out RaycastHit hit, 2.8f, IgnoredLayers)) continue;
                if (Player.TryGet(hit.transform.gameObject, out _)) continue;
                
                Logger.Info("Player is looking at: " + hit.transform.name);
                Logger.Info(hit.transform.parent.name);
                
            }

            yield return Timing.WaitForSeconds(1f);
        }
    }
}