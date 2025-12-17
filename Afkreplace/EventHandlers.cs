using System;
using System.Collections.Generic;
using System.Linq;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using UnityEngine;
using Random = System.Random;

namespace afkreplace;

public static class EventHandlers
{
    private const int WarnTime = 90;
    private const int ReplaceTime = 100;
    private static readonly Dictionary<int, long> LastActivity = new();
    private static readonly Dictionary<int, Vector3> LastPosition = new();
    private static readonly Dictionary<int, Quaternion> LastRotation = new();
    private static readonly Dictionary<int, Vector2> LastLookRotation = new();
    private static CoroutineHandle _coroutineHandle;
    private static readonly Random Rnd = new();


    public static void RegisterEvents()
    {
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;
        PlayerEvents.Left += OnLeft;
        _coroutineHandle = Timing.RunCoroutine(MainLoop());
    }

    public static void UnregisterEvents()
    {
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
        PlayerEvents.Left -= OnLeft;
        Timing.KillCoroutines(_coroutineHandle);
    }

    private static void OnWaitingForPlayers()
    {
        LastActivity.Clear();
    }

    private static void OnLeft(PlayerLeftEventArgs ev)
    {
        LastActivity.Remove(ev.Player.PlayerId);
        LastPosition.Remove(ev.Player.PlayerId);
        LastRotation.Remove(ev.Player.PlayerId);
        LastLookRotation.Remove(ev.Player.PlayerId);
    }

    private static bool HasMoved(Player player)
    {
        return Vector3.Distance(player.Position, LastPosition[player.PlayerId]) > 0.01f ||
               Quaternion.Angle(player.Rotation, LastRotation[player.PlayerId]) > 1f ||
               Vector2.Distance(player.LookRotation, LastLookRotation[player.PlayerId]) > 1f;
    }

    private static IEnumerator<float> MainLoop()
    {
        while (true)
        {
            foreach (Player player in Player.ReadyList)
            {
                EnsurePlayerTracked(player);

                if (HasMoved(player))
                {
                    LastActivity[player.PlayerId] = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    LastPosition[player.PlayerId] = player.Position;
                    LastRotation[player.PlayerId] = player.Rotation;
                    LastLookRotation[player.PlayerId] = player.LookRotation;
                }

                if (player.Role is RoleTypeId.Spectator or RoleTypeId.Tutorial or RoleTypeId.Overwatch
                    or RoleTypeId.Scp079 or RoleTypeId.None or RoleTypeId.Destroyed or RoleTypeId.Filmmaker)
                    continue;

                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                long inactive = now - LastActivity[player.PlayerId];

                if (inactive is >= WarnTime and < ReplaceTime)
                {
                    player.ClearBroadcasts();
                    player.SendBroadcast(
                        "<size=40><color=#FFAA00><b>⚠ Bist du AFK?</b></color></size>\n\n" +
                        "<size=30><color=#FFFFFF>Du wirst in <b>10 Sekunden</b> durch einen Zuschauer ersetzt.</color></size>",
                        10
                    );
                }
                else if (inactive >= ReplaceTime)
                {
                    ReplacePlayerWithSpectator(player);
                    break;
                }
            }


            yield return Timing.WaitForSeconds(10f);
        }
        // ReSharper disable once IteratorNeverReturns
    }

    private static void ReplacePlayerWithSpectator(Player afkPlayer)
    {
        List<Player> spectators = Player.ReadyList.Where(p => p.Role == RoleTypeId.Spectator).ToList();
        Player randomSpectator = null;
        if (spectators.Count > 0) randomSpectator = spectators[Rnd.Next(spectators.Count)];

        if (randomSpectator != null)
        {
            randomSpectator.Role = afkPlayer.Role;
            randomSpectator.Rotation = afkPlayer.Rotation;
            randomSpectator.ArtificialHealth = afkPlayer.ArtificialHealth;
            randomSpectator.Health = afkPlayer.Health;
            randomSpectator.HumeShield = afkPlayer.HumeShield;
            randomSpectator.HumeShieldRegenCooldown = afkPlayer.HumeShieldRegenCooldown;
            randomSpectator.HumeShieldRegenRate = afkPlayer.HumeShieldRegenRate;
            randomSpectator.IsDisarmed = afkPlayer.IsDisarmed;
            randomSpectator.DisarmedBy = afkPlayer.DisarmedBy;
            randomSpectator.LookRotation = afkPlayer.LookRotation;
            randomSpectator.Position = afkPlayer.Position;
            randomSpectator.MaxArtificialHealth = afkPlayer.MaxArtificialHealth;
            randomSpectator.MaxHealth = afkPlayer.MaxHealth;
            randomSpectator.MaxHumeShield = afkPlayer.MaxHumeShield;
            randomSpectator.Scale = afkPlayer.Scale;
            randomSpectator.StaminaRemaining = afkPlayer.StaminaRemaining;

            randomSpectator.ClearInventory();
            foreach (Item afkPlayerItem in afkPlayer.Items) randomSpectator.AddItem(afkPlayerItem.Type);

            foreach (KeyValuePair<ItemType, ushort> ammo in afkPlayer.Ammo)
                randomSpectator.AddAmmo(ammo.Key, ammo.Value);
            randomSpectator.CurrentItem = afkPlayer.CurrentItem;
            afkPlayer.ClearInventory();

            randomSpectator.ClearBroadcasts();
            randomSpectator.SendBroadcast(
                "<size=45><color=#55FFFF><b>AFK-Ersetzung</b></color></size>\n" +
                "<size=32><color=#FFFFFF>Du wurdest als Ersatz für einen</color> <color=#FF5555><b>inaktiven Spieler</b></color> <color=#FFFFFF>eingesetzt.</color></size>",
                30
            );
        }

        afkPlayer.DropEverything();
        afkPlayer.Role = RoleTypeId.Spectator;

        afkPlayer.ClearBroadcasts();
        afkPlayer.SendBroadcast(
            "<size=45><color=#FF5555><b>⚠ Inaktivität erkannt!</b></color></size>\n" +
            "<size=32><color=#FFFFFF>Du wurdest durch einen</color> <color=#55FFFF><b>zufälligen Zuschauer</b></color> <color=#FFFFFF>ersetzt.</color></size>",
            30
        );
    }

    private static void EnsurePlayerTracked(Player player)
    {
        if (!LastActivity.ContainsKey(player.PlayerId))
        {
            LastActivity[player.PlayerId] = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            LastPosition[player.PlayerId] = player.Position;
            LastRotation[player.PlayerId] = player.Rotation;
            LastLookRotation[player.PlayerId] = player.LookRotation;
        }
    }
}