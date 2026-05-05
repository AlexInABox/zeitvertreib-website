using System.Collections.Generic;
using System.Linq;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Arguments.WarheadEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Enums;
using LabApi.Features.Extensions;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using UnityEngine;

namespace Eventim.Events;

public class Teamdeathmatch : IEvent
{
    private static CoroutineHandle _explosionCoroutine;

    private static readonly List<Player> MtfGroup = [];
    private static readonly List<Player> ChaosGroup = [];
    private static Vector3 _mtfSpawn;
    private static Vector3 _chaosSpawn;

    public string Name => "SCP:SL Global Offensive";

    public string Description =>
        "MTF kämpfen gegen Chaos bis nur noch ein Team übrig bleibt. AUTONUKE NACH 5 MINUTEN!!";

    public List<string> Rules =>
    [
        // No special rules for this event :3
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarting += OnRoundStarting;
        PlayerEvents.Spawned += OnPlayerSpawned;
        ServerEvents.WaveRespawning += OnWaveRespawning;
        WarheadEvents.Detonated += OnDetonated;
        WarheadEvents.Stopping += OnWarheadStopping;
        PlayerEvents.Joined += OnJoined;

        MtfGroup.Clear();
        ChaosGroup.Clear();

        RoleTypeId.NtfPrivate.TryGetRandomSpawnPoint(out _mtfSpawn, out _);
        RoleTypeId.ChaosMarauder.TryGetRandomSpawnPoint(out _chaosSpawn, out _);
    }

    public void UnregisterEvents()
    {
        ServerEvents.RoundStarting -= OnRoundStarting;
        PlayerEvents.Spawned -= OnPlayerSpawned;
        ServerEvents.WaveRespawning -= OnWaveRespawning;
        WarheadEvents.Detonated -= OnDetonated;
        WarheadEvents.Stopping -= OnWarheadStopping;
        PlayerEvents.Joined -= OnJoined;



        Timing.KillCoroutines(_explosionCoroutine);
    }

    private static void OnRoundStarting(RoundStartingEventArgs ev)
    {
        foreach (Player player in MtfGroup)
        {
            player.SetRole(RoleTypeId.NtfPrivate, RoleChangeReason.RoundStart);
            player.Position = _mtfSpawn;
        }
        foreach (Player player in ChaosGroup)
        {
            player.SetRole(RoleTypeId.ChaosRifleman, RoleChangeReason.RoundStart);
            player.Position = _chaosSpawn;
        }

        Door.List.FirstOrDefault(d => d.DoorName == DoorName.SurfaceGate)!.IsOpened = false;
        Door.List.FirstOrDefault(d => d.DoorName == DoorName.SurfaceGate)!.IsLocked = true;


        _explosionCoroutine = Timing.CallDelayed(300f, () =>
        {
            Warhead.Start();
        });
        RoleTypeId.Tutorial.TryGetRandomSpawnPoint(out Vector3 tutorialTowerPos, out _);

    }

    private static void OnPlayerSpawned(PlayerSpawnedEventArgs ev)
    {
        if (ev.Role.ServerSpawnReason != RoleChangeReason.RoundStart)
            Timing.CallDelayed(Timing.WaitForOneFrame,
                () => { ev.Player.SetRole(RoleTypeId.Spectator, RoleChangeReason.None); });
    }

    private static void OnWaveRespawning(WaveRespawningEventArgs ev)
    {
        ev.IsAllowed = false;
        
        foreach (Player player in MtfGroup.Where(p => !p.IsAlive))
        {
            player.SetRole(RoleTypeId.NtfPrivate, RoleChangeReason.RoundStart);
            player.Position = _mtfSpawn;
        }
        foreach (Player player in ChaosGroup.Where(p => !p.IsAlive))
        {
            player.SetRole(RoleTypeId.ChaosRifleman, RoleChangeReason.RoundStart);
            player.Position = _chaosSpawn;
        }
    }

    private static void OnDetonated(WarheadDetonatedEventArgs ev)
    {
        Door.List.FirstOrDefault(d => d.DoorName == DoorName.SurfaceGate)!.IsOpened = true;
        Door.List.FirstOrDefault(d => d.DoorName == DoorName.SurfaceGate)!.IsLocked = false;
    }
    
    private static void OnWarheadStopping(WarheadStoppingEventArgs ev)
    {
        ev.IsAllowed = false;
    }
    
    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        if (MtfGroup.Count > ChaosGroup.Count)
        {
            ChaosGroup.Add(ev.Player);
        }
        else
        {
            MtfGroup.Add(ev.Player);
        }
    }
}