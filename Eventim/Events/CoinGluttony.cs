using System.Collections.Generic;
using System.Linq;
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

public class CoinGluttony : IEvent
{
    private static CoroutineHandle _mainLoop;
    public string Name => "Münzenwahn";

    public string Description =>
        "Alle Spieler haben unendlich viele Münzen in ihrem Inventar!";

    public List<string> Rules =>
    [
        "Teamtrolling ist erlaubt.",
        "Grundloses Töten ist erlaubt."
    ];

    public void RegisterEvents()
    {
        ServerEvents.RoundStarted += OnRoundStarted;
    }

    public void UnregisterEvents()
    {
        ServerEvents.RoundStarted -= OnRoundStarted;
        Timing.KillCoroutines(_mainLoop);
    }


    private static void OnRoundStarted()
    {
        _mainLoop = Timing.RunCoroutine(MainLoop());
    }

    private static IEnumerator<float> MainLoop()
    {
        while (true)
        {
            foreach (Player player in Player.ReadyList.Where(p => p.IsHuman && !p.IsDummy))
            {
                int coinCount = player.Items.Count(item => item.Base.ItemTypeId == ItemType.Coin);

                if (coinCount > 0) continue;

                player.AddItem(ItemType.Coin);
            }

            yield return Timing.WaitForSeconds(2f);
        }
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