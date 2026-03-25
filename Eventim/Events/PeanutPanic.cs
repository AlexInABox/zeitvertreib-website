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

public class PeanutPanic : IEvent
{
    public string Name => "PeanutPanik";

    public string Description =>
        "Ich glaube das wirst du nicht überleben...";

    public List<string> Rules =>
    [
        // No special rules for this event :3
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarting += OnRoundStarting;
        PlayerEvents.Spawned += OnPlayerSpawned;
        ServerEvents.WaveRespawning += OnWaveRespawning;
    }

    public void UnregisterEvents()
    {
        ServerEvents.RoundStarting -= OnRoundStarting;
        PlayerEvents.Spawned -= OnPlayerSpawned;
        ServerEvents.WaveRespawning -= OnWaveRespawning;
    }

    private static void OnRoundStarting(RoundStartingEventArgs ev)
    {
        List<Player> allPlayers = Player.ReadyList.ToList();
        Player selectedScp173Player = allPlayers.PullRandomItem();
        RoleTypeId.Tutorial.TryGetRandomSpawnPoint(out Vector3 tutorialTowerPos, out _);

        selectedScp173Player.SetRole(RoleTypeId.Scp173, RoleChangeReason.RoundStart);
        selectedScp173Player.Position = tutorialTowerPos;

        foreach (Player player in allPlayers)
        {
            player.SetRole(RoleTypeId.ClassD, RoleChangeReason.RoundStart);
            player.Position = tutorialTowerPos;
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
}