using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using CustomPlayerEffects;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;

namespace CoinFlip;

public enum CoinOutcome
{
    Nothing,
    LoseHp,
    GainShield,
    RandomEffect,
    SwapPosition,
    Explode,
    TeleportScps,
    GainHp,
    TeleportRandom,
    GiveItem,
    Cuffed,
    Cancer,
}

public static class EventHandlers
{
    private static readonly System.Random Random = new();

    public static void RegisterEvents()
    {
        PlayerEvents.FlippedCoin += OnFlippedCoin;
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.FlippedCoin -= OnFlippedCoin;
    }

    private static void OnFlippedCoin(PlayerFlippedCoinEventArgs ev)
    {
        Config config = Plugin.Instance.Config!;
        Translation translation = Plugin.Instance.Translation;

        if (config.Debug)
            Logger.Debug($"[CoinFlip] FlippedCoin fired for {ev.Player.Nickname}. IsTails={ev.IsTails}");

        Player player = ev.Player;

        if (!player.IsAlive) return;
        if (!player.IsHuman) return;

        player.RemoveItem(ItemType.Coin);

        if (config.Debug)
            Logger.Debug($"[CoinFlip] Rolling outcome for {player.Nickname}.");

        CoinOutcome outcome = RollOutcome(config);

        if (config.Debug)
            Logger.Debug($"[CoinFlip] Outcome for {player.Nickname}: {outcome}");

        ApplyOutcome(player, outcome, config, translation);
    }

    private static CoinOutcome RollOutcome(Config config)
    {
        int totalWeight =
            config.WeightNothing +
            config.WeightLoseHp +
            config.WeightGainShield +
            config.WeightRandomEffect +
            config.WeightSwapPosition +
            config.WeightExplode +
            config.WeightTeleportScps +
            config.WeightGainHp +
            config.WeightTeleportRandom +
            config.WeightGiveItem +
            config.WeightCuffed +
            config.WeightCancer;

        // Guard against misconfigured zero total weight.
        if (totalWeight <= 0)
            return CoinOutcome.Nothing;

        int roll = Random.Next(totalWeight);
        int cursor = 0;

        cursor += config.WeightNothing;
        if (roll < cursor) return CoinOutcome.Nothing;

        cursor += config.WeightLoseHp;
        if (roll < cursor) return CoinOutcome.LoseHp;

        cursor += config.WeightGainShield;
        if (roll < cursor) return CoinOutcome.GainShield;

        cursor += config.WeightRandomEffect;
        if (roll < cursor) return CoinOutcome.RandomEffect;

        cursor += config.WeightSwapPosition;
        if (roll < cursor) return CoinOutcome.SwapPosition;

        cursor += config.WeightExplode;
        if (roll < cursor) return CoinOutcome.Explode;

        cursor += config.WeightTeleportScps;
        if (roll < cursor) return CoinOutcome.TeleportScps;

        cursor += config.WeightGainHp;
        if (roll < cursor) return CoinOutcome.GainHp;

        cursor += config.WeightTeleportRandom;
        if (roll < cursor) return CoinOutcome.TeleportRandom;

        cursor += config.WeightGiveItem;
        if (roll < cursor) return CoinOutcome.GiveItem;

        cursor += config.WeightCuffed;
        if (roll < cursor) return CoinOutcome.Cuffed;

        return CoinOutcome.Cancer;
    }

    private static void ApplyOutcome(Player player, CoinOutcome outcome, Config config, Translation translation)
    {
        switch (outcome)
        {
            case CoinOutcome.Nothing:
                player.SendHint(translation.NothingMessage, 5f);
                break;

            case CoinOutcome.LoseHp:
                if (player.Health <= config.HpLossAmount + 1f)
                {
                    if (!TryKillPlayer(player))
                        player.Health = -1f;

                    player.SendHint(
                        translation.LoseHpMessage.Replace("$amount$", config.HpLossAmount.ToString("0")),
                        5f);
                    break;
                }

                player.Health = Math.Max(1f, player.Health - config.HpLossAmount);
                player.SendHint(
                    translation.LoseHpMessage.Replace("$amount$", config.HpLossAmount.ToString("0")),
                    5f);
                break;

            case CoinOutcome.GainShield:
                player.ArtificialHealth += config.ShieldGainAmount;
                player.EnableEffect<Concussed>(1, 3f);
                player.SendHint(
                    translation.GainShieldMessage.Replace("$amount$", config.ShieldGainAmount.ToString("0")),
                    5f);
                break;

            case CoinOutcome.RandomEffect:
                string effectName = ApplyRandomEffect(player, config.EffectDuration);
                player.SendHint(
                    translation.RandomEffectMessage.Replace("$effect$", effectName),
                    5f);
                break;

            case CoinOutcome.SwapPosition:
                ApplySwapPosition(player, translation);
                break;

            case CoinOutcome.Explode:
                player.SendHint(translation.ExplodeMessage, 3f);
                // Short delay so the player sees the hint before the explosion.
                Timing.CallDelayed(0.5f, () =>
                {
                    if (player.IsAlive)
                        TimedGrenadeProjectile.SpawnActive(player.Position, ItemType.GrenadeHE, owner: player, timeOverride: 0d);
                });
                break;

            case CoinOutcome.TeleportScps:
                ApplyTeleportScps(player, translation);
                break;

            case CoinOutcome.GainHp:
                player.Heal(config.HpGainAmount);
                player.EnableEffect<Bleeding>(1, 4f);
                player.SendHint(
                    translation.GainHpMessage.Replace("$amount$", config.HpGainAmount.ToString("0")),
                    5f);
                break;

            case CoinOutcome.TeleportRandom:
                ApplyTeleportRandom(player, translation);
                break;

            case CoinOutcome.GiveItem:
                ApplyGiveItem(player, translation);
                break;

            case CoinOutcome.Cuffed:
                player.IsDisarmed = true;
                player.SendHint(translation.CuffedMessage, 5f);
                Timing.CallDelayed(config.CuffDuration, () =>
                {
                    if (player.IsAlive && player.IsDisarmed)
                        player.IsDisarmed = false;
                });
                break;

            case CoinOutcome.Cancer:
                player.EnableEffect<Poisoned>(1, 1000f);
                player.SendHint(translation.CancerMessage, 6f);
                break;
        }
    }

    private static string ApplyRandomEffect(Player player, float duration)
    {
        // Cases 0-8 are negative effects (full duration).
        // Cases 9-10 are positive effects (60% duration).
        int index = Random.Next(11);
        float goodDuration = duration * 0.6f;

        switch (index)
        {
            case 0:
                player.EnableEffect<Flashed>(1);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<Flashed>(); });
                return "Blindheit";

            case 1:
                player.EnableEffect<Concussed>(1);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<Concussed>(); });
                return "Benommenheit";

            case 2:
                player.EnableEffect<Deafened>(1);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<Deafened>(); });
                return "Taubheit";

            case 3:
                player.EnableEffect<Exhausted>(1);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<Exhausted>(); });
                return "Erschöpfung";

            case 4:
                player.EnableEffect<Slowness>(200, duration);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<Slowness>(); });
                return "Extremverlangsamung";

            case 5:
                player.EnableEffect<HeavyFooted>(1);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<HeavyFooted>(); });
                return "Schwerfälligkeit";

            case 6:
                player.EnableEffect<Burned>(1);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<Burned>(); });
                return "Verbrennung";

            case 7:
                player.EnableEffect<Poisoned>(1);
                Timing.CallDelayed(duration, () => { if (player.IsAlive) player.DisableEffect<Poisoned>(); });
                return "Vergiftung";

            case 8:
                player.EnableEffect<MovementBoost>(25);
                Timing.CallDelayed(goodDuration, () => { if (player.IsAlive) player.DisableEffect<MovementBoost>(); });
                return "Geschwindigkeitsschub";

            case 9:
                player.EnableEffect<MovementBoost>(25);
                Timing.CallDelayed(goodDuration, () => { if (player.IsAlive) player.DisableEffect<MovementBoost>(); });
                return "Geschwindigkeitsschub";

            case 10:
                player.EnableEffect<Lightweight>(1);
                Timing.CallDelayed(goodDuration, () => { if (player.IsAlive) player.DisableEffect<Lightweight>(); });
                return "Leichtfüßigkeit";

            default: // case 10
                player.EnableEffect<Invisible>(1);
                Timing.CallDelayed(goodDuration, () => { if (player.IsAlive) player.DisableEffect<Invisible>(); });
                return "Unsichtbarkeit";
        }
    }

    private static void ApplySwapPosition(Player player, Translation translation)
    {
        List<Player> candidates = Player.List
            .Where(p => p.IsAlive && !p.IsHost && p != player)
            .ToList();

        if (candidates.Count == 0)
        {
            player.SendHint(translation.SwapNoTargetMessage, 5f);
            return;
        }

        Player target = candidates[Random.Next(candidates.Count)];

        Vector3 myPos = player.Position;
        Vector3 targetPos = target.Position;

        player.Position = targetPos;
        target.Position = myPos;

        player.EnableEffect<Concussed>(1, 3f);
        target.EnableEffect<Concussed>(1, 3f);

        player.SendHint(
            translation.SwapMessage.Replace("$player$", target.Nickname),
            5f);
        target.SendHint(
            translation.SwapMessage.Replace("$player$", player.Nickname),
            5f);
    }

    private static void ApplyTeleportScps(Player player, Translation translation)
    {
        Vector3 playerPos = player.Position;

        List<Player> scps = Player.List
            .Where(p => p.IsAlive && p.IsSCP)
            .ToList();

        foreach (Player scp in scps)
            scp.Position = playerPos;

        player.SendHint(translation.TeleportScpsMessage, 5f);
    }

    private static void ApplyTeleportRandom(Player player, Translation translation)
    {
        List<Player> candidates = Player.List
            .Where(p => p.IsAlive && !p.IsHost && p != player)
            .ToList();

        if (candidates.Count == 0)
        {
            player.SendHint(translation.TeleportRandomNoTargetMessage, 5f);
            return;
        }

        Player target = candidates[Random.Next(candidates.Count)];
        player.Position = target.Position;
        player.EnableEffect<Flashed>(1, 1.5f);

        player.SendHint(
            translation.TeleportRandomMessage.Replace("$player$", target.Nickname),
            5f);
    }

    private static void ApplyGiveItem(Player player, Translation translation)
    {
        ItemType[] pool = new[]
        {
            ItemType.Medkit,
            ItemType.Adrenaline,
            ItemType.Coin,
            ItemType.Painkillers,
            ItemType.Radio,
            ItemType.KeycardMTFPrivate,
            ItemType.KeycardMTFOperative,
            ItemType.KeycardMTFCaptain,
            ItemType.SCP330,
            ItemType.SCP1507Tape,
            ItemType.GunCOM15,
            ItemType.GrenadeFlash,
            ItemType.Flashlight,
        };

        string[] names = new[]
        {
            "Verbandskasten",
            "Adrenalin",
            "Münze",
            "Schmerzmittel",
            "Radio",
            "MTF-Privat-Schlüsselkarte",
            "MTF-Operative-Schlüsselkarte",
            "MTF-Captain-Schlüsselkarte",
            "SCP-330",
            "SCP-1507 Tape",
            "COM-15",
            "Blendgranate",
            "Taschenlampe",
        };

        int index = Random.Next(pool.Length);
        player.AddItem(pool[index]);

        player.SendHint(
            translation.GiveItemMessage.Replace("$item$", names[index]),
            5f);
    }

    private static bool TryKillPlayer(Player player)
    {
        MethodInfo[] methods = player.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        MethodInfo killMethod = methods.FirstOrDefault(m => m.Name == "Kill" && m.GetParameters().Length == 0)
            ?? methods.FirstOrDefault(m => m.Name == "Kill" && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType == typeof(bool));

        if (killMethod == null)
            return false;

        object[] parameters = killMethod.GetParameters().Length == 0 ? Array.Empty<object>() : new object[] { false };
        killMethod.Invoke(player, parameters);
        return true;
    }
}
