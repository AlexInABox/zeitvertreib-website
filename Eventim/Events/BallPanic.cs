using System.Collections.Generic;
using System.Linq;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Extensions;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using UnityEngine;

namespace Eventim.Events;

public class BallPanic : IEvent
{
    private static CoroutineHandle _mainLoop;

    public string Name => "Bälle Panik";

    public string Description =>
        "Alle Spieler haben unendlich viele SCP-018 (roter Ball) und müssen sich gegenseitig Umbringen. Die letzte lebende Person gewinnt!";

    public List<string> Rules =>
    [
        // No special rules for this event :3
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarting += OnRoundStarting;
        PlayerEvents.Spawned += OnPlayerSpawned;
        ServerEvents.WaveRespawning += OnWaveRespawning;
        PlayerEvents.Death += OnPlayerDeath;
    }

    public void UnregisterEvents()
    {
        ServerEvents.RoundStarting -= OnRoundStarting;
        PlayerEvents.Spawned -= OnPlayerSpawned;
        ServerEvents.WaveRespawning -= OnWaveRespawning;
        PlayerEvents.Death -= OnPlayerDeath;
        Timing.KillCoroutines(_mainLoop);
    }

    private static void OnRoundStarting(RoundStartingEventArgs ev)
    {
        List<Player> allPlayers = Player.ReadyList.ToList();
        RoleTypeId.Tutorial.TryGetRandomSpawnPoint(out Vector3 tutorialTowerPos, out _);

        foreach (Player player in allPlayers)
        {
            player.SetRole(RoleTypeId.ClassD, RoleChangeReason.RoundStart);
            player.Position = tutorialTowerPos;
            player.MaxHealth = 1000f;
            player.Health = 1000f;
        }

        _mainLoop = Timing.RunCoroutine(MainLoop());
        Round.IsLocked = true;
    }

    private static IEnumerator<float> MainLoop()
    {
        while (true)
        {
            foreach (Player player in Player.ReadyList.Where(p => p.IsHuman && !p.IsDummy))
            {
                int ballCount = player.Items.Count(item => item.Base.ItemTypeId == ItemType.SCP018);

                if (ballCount > 0) continue;

                player.AddItem(ItemType.SCP018);
            }

            yield return Timing.WaitForSeconds(2f);
        }
    }

    private static void OnPlayerSpawned(PlayerSpawnedEventArgs ev)
    {
        // We don't allow LateJoins or WaveSpawns or thelike in this gamemode!
        if (ev.Role.ServerSpawnReason != RoleChangeReason.RoundStart)
            Timing.CallDelayed(Timing.WaitForOneFrame,
                () => { ev.Player.SetRole(RoleTypeId.Spectator, RoleChangeReason.None); });
    }

    private static void OnWaveRespawning(WaveRespawningEventArgs ev)
    {
        ev.IsAllowed = false;
    }

    private static void OnPlayerDeath(PlayerDeathEventArgs ev)
    {
        if (Player.ReadyList.Count(p => p.IsAlive && p != ev.Player) > 1) return;

        foreach (Pickup pickup in Map.Pickups) pickup.Destroy();
        Round.IsLocked = false;
    }
}