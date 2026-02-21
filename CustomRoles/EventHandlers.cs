using System;
using System.Collections.Generic;
using System.Linq;
using Cassie;
using CustomRoles.Modules;
using Footprinting;
using InventorySystem.Items;
using InventorySystem.Items.Firearms.Modules;
using InventorySystem.Items.Firearms.ShotEvents;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Arguments.WarheadEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using PlayerStatsSystem;
using UncomplicatedCustomRoles.API.Features;
using UncomplicatedCustomRoles.Extensions;
using UnityEngine;
using UserSettings.ServerSpecific;
using Logger = LabApi.Features.Console.Logger;

namespace CustomRoles;

public static class EventHandlers
{
    private static readonly Dictionary<int, long> EffectCooldowns = new();
    private static readonly List<Player> DeathSquadPlayersToDisintegrateOnDeath = [];
    private static CoroutineHandle _detonatedCoroutineHandle;

    public static void RegisterEvents()
    {
        ServerSpecificSettingsSync.ServerOnSettingValueReceived += OnSSSReceived;

        ServerSpecificSettingBase[] extra =
        [
            new SSGroupHeader("Custom Rollen"),
            new SSKeybindSetting(
                Plugin.Instance.Config!.KeybindId,
                "Medic - Heilaura",
                KeyCode.None, true, false,
                "Hiermit heilst du dich selbst und Teammitglieder in deiner Umgeben!")
        ];
        
        if (ServerSpecificSettingsSync.DefinedSettings == null)
            ServerSpecificSettingsSync.DefinedSettings = extra;
        else
            ServerSpecificSettingsSync.DefinedSettings =
                ServerSpecificSettingsSync.DefinedSettings.Concat(extra).ToArray();
        ServerSpecificSettingsSync.SendToAll();
        

        
        PlayerEvents.Spawned += OnSpawned;
        PlayerEvents.Dying += OnDying;
        PlayerEvents.Death += OnDeath;
        WarheadEvents.Detonated += OnDetonated;
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;
        ServerEvents.RoundEnded += OnRoundEnded;
    }

    public static void UnregisterEvents()
    {
        ServerSpecificSettingsSync.ServerOnSettingValueReceived -= OnSSSReceived;
        PlayerEvents.Spawned -= OnSpawned;
        PlayerEvents.Dying -= OnDying;
        PlayerEvents.Death -= OnDeath;
        WarheadEvents.Detonated -= OnDetonated;
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
        ServerEvents.RoundEnded -= OnRoundEnded;

        Timing.KillCoroutines(_detonatedCoroutineHandle);

    }

    private static void OnWaitingForPlayers()
    {
        EffectCooldowns.Clear();
        DeathSquadPlayersToDisintegrateOnDeath.Clear();
        Timing.KillCoroutines(_detonatedCoroutineHandle);
    }

    private static void OnRoundEnded(RoundEndedEventArgs ev)
    {
        EffectCooldowns.Clear();
        DeathSquadPlayersToDisintegrateOnDeath.Clear();
        Timing.KillCoroutines(_detonatedCoroutineHandle);
    }

    private static void OnSSSReceived(ReferenceHub hub, ServerSpecificSettingBase ev)
    {
        if (!Player.TryGet(hub.networkIdentity, out Player player))
            return;

        // Check if the setting is the keybind setting and if it is pressed
        if (ev is SSKeybindSetting keybindSetting &&
            keybindSetting.SettingId == Plugin.Instance.Config!.KeybindId &&
            keybindSetting.SyncIsPressed)
            UseMedicAbility(player);
    }

    private static void OnSpawned(PlayerSpawnedEventArgs ev)
    {
        // We have to wait for UCR to finish initializing the players custom role
        Timing.CallDelayed(1f, () =>
        {
            if (!ev.Player.TryGetSummonedInstance(out SummonedCustomRole role))
                return;

            if (role.TryGetModule(out PinkCandy pinkCandyModule))
                pinkCandyModule.Execute();

            if (role.TryGetModule(out Deathsquad deathSquadModule))
                deathSquadModule.Execute();
        });
    }

    private static void OnDying(PlayerDyingEventArgs ev)
    {
        if (!ev.Player.TryGetSummonedInstance(out SummonedCustomRole role)) return;
        if (!role.TryGetModule(out Deathsquad _)) return;

        ev.Player.ClearInventory();
        DeathSquadPlayersToDisintegrateOnDeath.Add(ev.Player);
    }

    private static void OnDeath(PlayerDeathEventArgs ev)
    {
        if (!DeathSquadPlayersToDisintegrateOnDeath.Contains(ev.Player)) return;

        DeathSquadPlayersToDisintegrateOnDeath.Remove(ev.Player);
        Ragdoll ragdoll = Ragdoll.List.LastOrDefault(x => x.Base.NetworkInfo.OwnerHub == ev.Player.ReferenceHub);
        if (ragdoll == null)  return;
        Footprint shooter = new();
        if (ev.Attacker != null) shooter = new Footprint(ev.Attacker.ReferenceHub);

        ragdoll.DamageHandler = new DisruptorDamageHandler(new DisruptorShotEvent(ItemIdentifier.None, shooter,
            DisruptorActionModule.FiringState.FiringSingle), Vector3.up, 999f);

        ragdoll.IsConsumed = true;
    }

    private static void OnDetonated(WarheadDetonatedEventArgs ev)
    {
        Timing.KillCoroutines(_detonatedCoroutineHandle);
        _detonatedCoroutineHandle = Timing.CallDelayed(100f, () =>
        {
            int mtfWaveTokens = RespawnWaves.PrimaryMtfWave!.RespawnTokens;
            int chaosWaveTokens = RespawnWaves.PrimaryChaosWave!.RespawnTokens;
            if (Player.List.All(player => player.IsAlive)) return;

            if (mtfWaveTokens > 0 && chaosWaveTokens > 0)
            {
                Logger.Info("Would've spawned Deathsquad but this is the Ticket status:");
                Logger.Info("MTF Tokens: " + mtfWaveTokens + " | Chaos Tokens: " + chaosWaveTokens);
                return;
            }

            Announcer.Message(new CassieTtsPayload("pitch_0,8 THE jam_50_9 CASSIESYSTEM HAS BEEN jam_50_3 DEACTIVATED BY THE O5 jam_60_4 KILL SQUAD", "C.A.S.S.I.E. has been DEACTIVATED, by the O6 DEATHSQUAD."));

            foreach (Player player in Player.ReadyList.Where(player => player.Role == RoleTypeId.Spectator))
            {
                player.SetCustomRole(4050);
            }
        });
    }

    private static void UseMedicAbility(Player player)
    {
        if (!player.TryGetSummonedInstance(out SummonedCustomRole role))
            return;

        if (!role.TryGetModule(out Medic module))
            return;

        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (EffectCooldowns.TryGetValue(player.PlayerId, out long cooldownMs) && cooldownMs > nowMs)
        {
            double remaining = (cooldownMs - nowMs) / 1000.0;
            player.SendHint($"<color=yellow>Medic Fähigkeit ist gerade im Cooldown! ({remaining:F1}s)</color>", 1.5f);
            return;
        }

        module.Execute();
        player.SendHint(Plugin.Instance.Translation.AbilityUsed, 1.5f);
        EffectCooldowns[player.PlayerId] = nowMs + 70000; // 70s in ms
    }
}