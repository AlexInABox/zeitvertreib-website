using System;
using System.Collections.Generic;
using System.Linq;
using Cassie;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Extensions;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using UnityEngine;

namespace Eventim.Events;

public class TooManyPeanuts : IEvent
{
    private static readonly System.Random Rng = new();

    public string Name => "Too Many Peanuts!";

    public string Description =>
        "Die Hälfte der Spieler spawnen als SCP-173! Die restlichen Spieler werden Guards, aber ohne Ausweg...";

    public List<string> Rules =>
    [
        "Versuche zu überleben!"
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

    private static readonly RoleTypeId[] HczSpawnPoints =
    [
        RoleTypeId.Scp096,
        RoleTypeId.Scp939
    ];

    private static void OnRoundStarting(RoundStartingEventArgs ev)
    {
        List<Player> allPlayers = Player.ReadyList.ToList();
        int scpCount = Math.Max(1, allPlayers.Count / 2);

        for (int i = 0; i < scpCount; i++)
        {
            Player scp = allPlayers.PullRandomItem();
            scp.SetRole(RoleTypeId.Scp173, RoleChangeReason.RoundStart);
        }

        foreach (Player guard in allPlayers)
        {
            // Each guard spawns at a random HCZ location
            RoleTypeId spawnRole = HczSpawnPoints[Rng.Next(HczSpawnPoints.Length)];
            spawnRole.TryGetRandomSpawnPoint(out Vector3 hczPos, out _);
            guard.SetRole(RoleTypeId.FacilityGuard, RoleChangeReason.RoundStart);
            guard.Position = hczPos;
            guard.AddItem(ItemType.Radio);
        }

        // Play CASSIE announcement
        Announcer.Message(new CassieTtsPayload(
            "$PITCH_0.7 attention all personnel, kill all ALIVE scp 1 7 3 IMMEDIATELY, LETHALFORCEAUTHORIZED",
            "Attention all personnel, kill all alive SCP-173 immediately. Lethal force authorized."));

        // Seal all checkpoint doors to lock down the Heavy Containment Zone
        foreach (CheckpointDoor checkpointDoor in CheckpointDoor.List)
        {
            checkpointDoor.IsOpened = false;
            checkpointDoor.IsLocked = true;
        }

        // Destroy all map pickups after items finish spawning
        Timing.CallDelayed(1f, () =>
        {
            foreach (Pickup pickup in Map.Pickups)
                pickup.Destroy();
        });
    }

    private static void OnPlayerSpawned(PlayerSpawnedEventArgs ev)
    {
        // Block late-joins and wave respawns from participating
        if (ev.Role.ServerSpawnReason != RoleChangeReason.RoundStart)
        {
            Timing.CallDelayed(Timing.WaitForOneFrame,
                () => ev.Player.SetRole(RoleTypeId.Spectator, RoleChangeReason.None));
            return;
        }

        // Only arm guards — SCPs keep their natural abilities
        if (ev.Role is not { RoleTypeId: RoleTypeId.FacilityGuard }) return;

        Timing.CallDelayed(Timing.WaitForOneFrame, () =>
        {
            // Clear default guard inventory
            foreach (Item item in ev.Player.Items.ToList())
                ev.Player.RemoveItem(item);

            // Give either a MicroHID or a Particle Disruptor
            ItemType weapon = Rng.Next(2) == 0 ? ItemType.MicroHID : ItemType.ParticleDisruptor;
            ev.Player.AddItem(weapon);
            ev.Player.AddItem(ItemType.Radio);
        });
    }

    private static void OnWaveRespawning(WaveRespawningEventArgs ev)
    {
        ev.IsAllowed = false;
    }
}
