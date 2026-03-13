using System.Collections.Generic;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using PlayerRoles.PlayableScps.Scp3114;
using Respawning.Objectives;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;

namespace Eventim.Events;

public class LightsOut : IEvent
{
    public string Name => "Dunkelheit";

    public string Description =>
        "Aufgrund von erhöten Serverkosten, müssen wir heute um Strom zu sparen die Lichter in der Facility ausgeschaltet lassen!";

    public List<string> Rules =>
    [
        // No special rules for this event :3
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarted += OnRoundStarted;
        PlayerEvents.Spawned += OnPlayerSpawned;
    }

    public void UnregisterEvents()
    {
        ServerEvents.RoundStarted -= OnRoundStarted;
        PlayerEvents.Spawned -= OnPlayerSpawned;
    }

    private static void OnRoundStarted()
    {
        Map.TurnOffLights();
    }

    private static void OnPlayerSpawned(PlayerSpawnedEventArgs ev)
    {
        // SCP173 is super unfair in this game mode! That's why we disable their spawning :3
        if (ev.Role is { ServerSpawnReason: RoleChangeReason.RoundStart, RoleTypeId: RoleTypeId.Scp173 })
            Timing.CallDelayed(Timing.WaitForOneFrame, () =>
            {
                Logger.Info($"Setting {ev.Player.DisplayName} to Scientist because they would've been SCP 173");
                ev.Player.SetRole(RoleTypeId.Scientist, RoleChangeReason.RoundStart);
            });


        // DisableAllEffects doest remove the initial night vision of SCP's, and I cant figure out how to do that!
        // in-game I would click "Clear all effects" on an scp and then give them NightVision. But this code here doesnt simulate that :shrug:
        /*
        if (ev.Player is { IsSCP: true, Role: not RoleTypeId.Scp079 })
        {
            ev.Player.DisableAllEffects();
            ev.Player.EnableEffect<NightVision>(intensity: 4);
        }
        */
        Timing.RunCoroutine(ShowAura(ev.Player));
    }


    private static IEnumerator<float> ShowAura(Player player)
    {
        if (player.Role is RoleTypeId.Scp079) yield break;
        LightSourceToy auraLight = LightSourceToy.Create(player.GameObject!.transform);
        auraLight.Color = player.Role.GetRoleColor();
        auraLight.Range = 5f;
        auraLight.Intensity = 0.95f;
        auraLight.ShadowType = LightShadows.None;

        while (player.IsAlive)
        {
            // This allows SCP3114 to also copy their victims auraLight!
            Color auraColor = player.Role.GetRoleColor();
            if (player.RoleBase is Scp3114Role { Disguised: true } scp3114Role)
                auraColor = scp3114Role.CurIdentity.StolenRole.GetRoleColor();
            auraLight.Color = auraColor;
            yield return Timing.WaitForSeconds(1f);
        }

        auraLight.Destroy();
    }
}