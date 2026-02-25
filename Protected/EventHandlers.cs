using System.Collections.Concurrent;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;

namespace Protected;

public static class EventHandlers
{
    private static readonly ConcurrentDictionary<Player, byte> SpawnProtectedPlayers = new();

    public static void RegisterEvents()
    {
        PlayerEvents.Spawned += OnSpawned;
        PlayerEvents.Hurting += OnHurting;
        PlayerEvents.ShootingWeapon += OnShooting;
        PlayerEvents.ThrowingProjectile += ThrowingProjectile;
        
        PlayerEvents.Joined += OnJoined; // Here we register the HUD!
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.Spawned -= OnSpawned;
        PlayerEvents.Hurting -= OnHurting;
        PlayerEvents.ShootingWeapon -= OnShooting;
        PlayerEvents.ThrowingProjectile -= ThrowingProjectile;
        
        PlayerEvents.Joined -= OnJoined;
    }

    private static void OnSpawned(PlayerSpawnedEventArgs ev)
    {
        if (ev.Player.Role == RoleTypeId.Tutorial || !ev.Player.IsHuman) return;

        SpawnProtectedPlayers.TryAdd(ev.Player, 0);
        Timing.CallDelayed(20f, () =>  SpawnProtectedPlayers.TryRemove(ev.Player, out _));
    }

    private static void OnHurting(PlayerHurtingEventArgs ev)
    {
        if (!SpawnProtectedPlayers.ContainsKey(ev.Player)) return;
        
        ev.IsAllowed = false;

        // TODO: Notify the attacker with a hint, that the user they are attacking is spawn protected!
    }

    private static void OnShooting(PlayerShootingWeaponEventArgs ev)
    {
        SpawnProtectedPlayers.TryRemove(ev.Player, out _);
    }
    
    private static void ThrowingProjectile(PlayerThrowingProjectileEventArgs ev)
    {
        SpawnProtectedPlayers.TryRemove(ev.Player, out _);
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        Hint protectedState = new()
        {
            Alignment = HintAlignment.Left,
            AutoText = _ =>
            {
                string hint = string.Empty;
                if (SpawnProtectedPlayers.ContainsKey(ev.Player))
                {
                    hint = $"<size=25><b><color=green>SPAWNSCHUTZ AKTIV</color=green></b></size>\n";
                }

                if (ev.Player.IsGodModeEnabled)
                {
                    hint = $"<size=25><b><color=green>⚠ GODMODE AKTIV ⚠</color=green></b></size>\n";
                }
               
                return hint;
            },
            YCoordinateAlign = HintVerticalAlign.Top,
            YCoordinate = 30,
            XCoordinate = (int)(-540f * ev.Player.ReferenceHub.aspectRatioSync.AspectRatio + 600f),
            SyncSpeed = HintSyncSpeed.Slowest
        };
        PlayerDisplay playerDisplay = PlayerDisplay.Get(ev.Player);
        playerDisplay.AddHint(protectedState);
    }
}