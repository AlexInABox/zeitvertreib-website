using System.Collections.Generic;
using CustomPlayerEffects;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.WarheadEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;

namespace Eventim.Events;

public class InstantNuke : IEvent
{
    public string Name => "NukeRun";

    public string Description =>
        "Kurz nach Beginn der Runde aktiviert sich sofort der \"Dead-Man-Switch\"! Versucht so schnell wie möglich aus der Facility zu entkommen :3";

    public List<string> Rules =>
    [
        "Helft euch gegenseitig zu entkommen und bekämpft dann GEMEINSAM die SCP's!"
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarted += OnRoundStarted;
        PlayerEvents.Spawned += OnPlayerSpawned;
        WarheadEvents.Starting += OnWarheadStarting;
        WarheadEvents.Stopping += OnWarheadStopping;
    }

    public void UnregisterEvents()
    {
        ServerEvents.RoundStarted -= OnRoundStarted;
        PlayerEvents.Spawned -= OnPlayerSpawned;
        WarheadEvents.Starting -= OnWarheadStarting;
        WarheadEvents.Stopping -= OnWarheadStopping;
    }

    private static void OnWarheadStarting(WarheadStartingEventArgs ev)
    {
        ev.WarheadState = ev.WarheadState with { StartTime = 120.0 };
        ev.SuppressSubtitles = true;

        foreach (Door door in Map.Doors)
        {
            door.IsOpened = true;
            door.IsLocked = true;
        }

        foreach (CheckpointDoor checkpointDoor in CheckpointDoor.List)
        {
            checkpointDoor.IsOpened = true;
            checkpointDoor.IsLocked = true;
        }

        foreach (Gate gate in Gate.List)
        {
            gate.IsOpened = true;
            gate.IsLocked = true;
        }
    }

    private static void OnWarheadStopping(WarheadStoppingEventArgs ev)
    {
        ev.IsAllowed = false;
    }

    private static void OnRoundStarted()
    {
        Timing.CallDelayed(10f, () => { Warhead.Start(); });
    }

    private static void OnPlayerSpawned(PlayerSpawnedEventArgs ev)
    {
        if (ev.Role.ServerSpawnReason != RoleChangeReason.RoundStart) return;
        // SCP079 is super lame! That's why we disable spawning :3
        if (ev.Role is { RoleTypeId: RoleTypeId.Scp079 })
            Timing.CallDelayed(Timing.WaitForOneFrame, () =>
            {
                Logger.Info($"Setting {ev.Player.DisplayName} to Scientist because they would've been SCP 079");
                ev.Player.SetRole(RoleTypeId.Scientist, RoleChangeReason.RoundStart);
            });

        // give each player some coins :3
        Timing.CallDelayed(Timing.WaitForOneFrame, () =>
        {
            for (int i = 0; i < 5; i++) ev.Player.AddItem(ItemType.Coin);
            ev.Player.EnableEffect<Invigorated>(255, 100f);
        });
    }
}