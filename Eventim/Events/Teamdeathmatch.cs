using System;
using System.Collections.Generic;
using System.Linq;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Arguments.WarheadEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Enums;
using LabApi.Features.Extensions;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using Respawning;
using Respawning.Objectives;
using UnityEngine;

namespace Eventim.Events;

public class Teamdeathmatch : IEvent
{
    private static CoroutineHandle _explosionCoroutine;
    private static CoroutineHandle _respawnCoroutine;
    private static readonly string MtfColor = RoleTypeId.NtfCaptain.GetRoleColor().ToHex();
    private static readonly string ChaosColor = RoleTypeId.ChaosRepressor.GetRoleColor().ToHex();

    private static readonly List<Player> MtfGroup = [];
    private static readonly List<Player> ChaosGroup = [];
    private static Vector3 _mtfSpawn;
    private static Vector3 _chaosSpawn;
    private static long _lastRespawn;
    private static float _respawnInterval = 98f;

    public string Name => "Team Deathmatch";

    public string Description =>
        "MTF kämpfen gegen Chaos bis nur noch ein Team übrig bleibt. AUTONUKE NACH 5 MINUTEN!!";

    public List<string> Rules =>
    [
        "Spieler dürfen/können sich nicht ergeben!"
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarting += OnRoundStarting;
        PlayerEvents.Spawned += OnPlayerSpawned;
        ServerEvents.WaveRespawning += OnWaveRespawning;
        WarheadEvents.Detonated += OnDetonated;
        WarheadEvents.Stopping += OnWarheadStopping;
        PlayerEvents.Joined += OnJoined;
        PlayerEvents.Left += OnLeft;

        MtfGroup.Clear();
        ChaosGroup.Clear();
        _lastRespawn = 0;
        _respawnInterval = 98f;
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
        PlayerEvents.Left -= OnLeft;

        Timing.KillCoroutines(_explosionCoroutine);
        Timing.KillCoroutines(_respawnCoroutine);
    }

    private static void OnRoundStarting(RoundStartingEventArgs ev)
    {
        SpawnTeams(false);

        Door.List.FirstOrDefault(d => d.DoorName == DoorName.SurfaceGate)!.IsOpened = false;
        Door.List.FirstOrDefault(d => d.DoorName == DoorName.SurfaceGate)!.IsLocked = true;


        _explosionCoroutine = Timing.CallDelayed(300f, () => { Warhead.Start(); });

        _respawnCoroutine = Timing.RunCoroutine(RespawnCoroutine());

        RespawnTokensManager.AvailableRespawnsLeft = 0;
        if (RespawnWaves.MiniMtfWave != null) RespawnWaves.MiniMtfWave.IsForcefullyPaused = true;
        if (RespawnWaves.MiniChaosWave != null) RespawnWaves.MiniChaosWave.IsForcefullyPaused = true;
        if (RespawnWaves.PrimaryChaosWave != null) RespawnWaves.PrimaryChaosWave.IsForcefullyPaused = true;
        if (RespawnWaves.PrimaryMtfWave != null) RespawnWaves.PrimaryMtfWave.IsForcefullyPaused = true;
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

        SpawnTeams(true);
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
            ChaosGroup.Add(ev.Player);
        else
            MtfGroup.Add(ev.Player);


        Hint respawnTimer = new()
        {
            Alignment = HintAlignment.Center,
            AutoText = _ =>
            {
                int mtfAlive = MtfGroup.Count(p => p.IsAlive);
                int chaosAlive = ChaosGroup.Count(p => p.IsAlive);
                float elapsed = _lastRespawn == 0 ? 0 : DateTimeOffset.UtcNow.ToUnixTimeSeconds() - _lastRespawn;
                int timeUntilNextSpawn = (int)Math.Round(_respawnInterval - elapsed) + 2; //+2 so it looks better!

                string hint =
                    $"<size=18><color={MtfColor}>MTF: <b>{mtfAlive}</b></color> | <color={ChaosColor}>Chaos: <b>{chaosAlive}</b></color>\n" +
                    $"<size=22><b><color=green>Respawn in: {timeUntilNextSpawn} Sekunden</color></b></size>";

                return hint;
            },
            YCoordinateAlign = HintVerticalAlign.Bottom,
            YCoordinate = 1080,
            XCoordinate = 0,
            SyncSpeed = HintSyncSpeed.Slow
        };
        PlayerDisplay playerDisplay = PlayerDisplay.Get(ev.Player);
        playerDisplay.AddHint(respawnTimer);
    }

    private static void OnLeft(PlayerLeftEventArgs ev)
    {
        MtfGroup.Remove(ev.Player);
        ChaosGroup.Remove(ev.Player);
    }

    private static void SpawnTeams(bool spectatorsOnly)
    {
        _lastRespawn = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        _respawnInterval += 20f;
        foreach (Player player in MtfGroup.Where(p => !spectatorsOnly || !p.IsAlive))
        {
            player.SetRole(RoleTypeId.NtfCaptain, RoleChangeReason.RoundStart);
            player.Position = _mtfSpawn;
        }

        foreach (Player player in ChaosGroup.Where(p => !spectatorsOnly || !p.IsAlive))
        {
            player.SetRole(RoleTypeId.ChaosRepressor, RoleChangeReason.RoundStart);
            player.Position = _chaosSpawn;
            player.MaxHealth = 150f;
            player.Health = 150f;
        }
    }

    private static IEnumerator<float> RespawnCoroutine()
    {
        while (true)
        {
            yield return Timing.WaitForSeconds(2f);
            float elapsed = _lastRespawn == 0 ? 0 : DateTimeOffset.UtcNow.ToUnixTimeSeconds() - _lastRespawn;

            if (elapsed < _respawnInterval) continue;


            SpawnTeams(true);
        }
    }
}