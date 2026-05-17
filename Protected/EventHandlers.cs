using System;
using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Text;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.Scp049Events;
using LabApi.Events.Arguments.Scp3114Events;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using PlayerStatsSystem;
using RueI.API;
using RueI.API.Elements;
using RueI.Utils;
using RueI.Utils.Enums;
using UnityEngine;

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
        Scp049Events.Attacking += OnSCP049Infecting;
        Scp3114Events.StrangleStarting += OnSCP3114Strangling;

        PlayerEvents.Joined += OnJoined; // Here we register the HUD!
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.Spawned -= OnSpawned;
        PlayerEvents.Hurting -= OnHurting;
        PlayerEvents.ShootingWeapon -= OnShooting;
        PlayerEvents.ThrowingProjectile -= ThrowingProjectile;
        Scp049Events.Attacking -= OnSCP049Infecting;
        Scp3114Events.StrangleStarting -= OnSCP3114Strangling;

        PlayerEvents.Joined -= OnJoined;
    }

    private static void OnSpawned(PlayerSpawnedEventArgs ev)
    {
        if (ev.Player.Role == RoleTypeId.Tutorial || !ev.Player.IsHuman) return;

        StringBuilder builder = new();
        builder.SetAlignment(AlignStyle.Left);
        builder.SetHorizontalPos(ev.Player.EdgeOffset() + 5f);
        builder.Append("<size=25><b><color=green>SPAWNSCHUTZ AKTIV</color=green></b></size>");
        builder.CloseHorizontalPos();
        builder.CloseAlign();
        BasicElement hint = new(960f, builder.ToString());
        RueDisplay.Get(ev.Player).Show(new Tag("ProtectedHintSpawnProtectedStatus" + ev.Player.PlayerId), hint);

        SpawnProtectedPlayers.TryAdd(ev.Player, 0);
        Timing.CallDelayed(20f, () =>
        {
            RueDisplay.Get(ev.Player).Remove(new Tag("ProtectedHintSpawnProtectedStatus" + ev.Player.PlayerId));
            SpawnProtectedPlayers.TryRemove(ev.Player, out _);
        });
    }

    private static void OnHurting(PlayerHurtingEventArgs ev)
    {
        if (!SpawnProtectedPlayers.ContainsKey(ev.Player)) return;

        // SpawnProtectedPlayers tank everything BUT the warhead and SCP173 necksnap.
        if (ev.DamageHandler is UniversalDamageHandler universalDamageHandler && (
                universalDamageHandler.TranslationId == DeathTranslations.Warhead.Id
                || universalDamageHandler.TranslationId == DeathTranslations.Scp173.Id)) return;

        ev.IsAllowed = false;

        // TODO: Notify the attacker with a hint, that the user they are attacking is spawn protected!
    }

    private static void OnSCP049Infecting(Scp049AttackingEventArgs ev)
    {
        if (!SpawnProtectedPlayers.ContainsKey(ev.Target)) return;

        ev.IsAllowed = false;
        // TODO: Notify the attacker with a hint, that the user they are attacking is spawn protected!
    }

    private static void OnSCP3114Strangling(Scp3114StrangleStartingEventArgs ev)
    {
        if (!SpawnProtectedPlayers.ContainsKey(ev.Target)) return;

        ev.IsAllowed = false;
        // TODO: Notify the attacker with a hint, that the user they are attacking is spawn protected!
    }

    private static void OnShooting(PlayerShootingWeaponEventArgs ev)
    {
        RueDisplay.Get(ev.Player).Remove(new Tag("ProtectedHintSpawnProtectedStatus" + ev.Player.PlayerId));
        SpawnProtectedPlayers.TryRemove(ev.Player, out _);
    }

    private static void ThrowingProjectile(PlayerThrowingProjectileEventArgs ev)
    {
        RueDisplay.Get(ev.Player).Remove(new Tag("ProtectedHintSpawnProtectedStatus" + ev.Player.PlayerId));
        SpawnProtectedPlayers.TryRemove(ev.Player, out _);
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        RueDisplay display = RueDisplay.Get(ev.Player);
        DynamicElement hint = new(935f, () =>
        {
            StringBuilder builder = new();
            builder.SetAlignment(AlignStyle.Left);

            if (ev.Player.IsGodModeEnabled)
            {
                builder.SetHorizontalPos(ev.Player.EdgeOffset() + 5f);
                builder.Append("<size=25><b><color=green>⚠ GODMODE AKTIV ⚠</color=green></b></size>");
                builder.CloseHorizontalPos();
            }

            builder.CloseAlign();
            return builder.ToString();
        })
        {
            UpdateInterval = new TimeSpan(0, 0, 0, 5)
        };

        display.Show(new Tag(), hint);
    }

    /// <summary>
    ///     Gets the offset necessary to push a hint to the edge of the screen.
    /// </summary>
    /// <param name="player">The player the offset should be calculated for.</param>
    /// <returns>The position offset needed to place the hint on the edge of the screen.</returns>
    [SuppressMessage("ReSharper", "InconsistentNaming")]
    private static float EdgeOffset(this Player player)
    {
        const float Base = 1080f - 1f; //slight padding
        const float DisplayAreaWidth = 1200f;

        float aspectRatio = player.ReferenceHub.aspectRatioSync.AspectRatio;

        return -Mathf.Min((aspectRatio * Base - DisplayAreaWidth) / 2f, DisplayAreaWidth);
    }
}