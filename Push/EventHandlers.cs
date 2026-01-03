using System.Collections.Generic;
using System.Globalization;
using CustomPlayerEffects;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MapGeneration;
using MEC;
using PlayerRoles;
using UnityEngine;
using UserSettings.ServerSpecific;
using Logger = LabApi.Features.Console.Logger;

namespace Push;

public enum Strength
{
    Weak,
    Normal,
    Extreme
}

public static class EventHandlers
{
    private static readonly Dictionary<int, float> PushCooldowns = new();
    private static readonly Dictionary<int, Strength> Strengths = new();

    private static readonly Dictionary<Strength, double> StrengthMultiplier = new()
    {
        { Strength.Weak, 0.5 },
        { Strength.Normal, 1.0 },
        { Strength.Extreme, 2.0 }
    };

    public static void RegisterEvents()
    {
        ServerSpecificSettingsSync.ServerOnSettingValueReceived += OnSSSReceived;

        ServerSpecificSettingBase[] extra =
        [
            new SSGroupHeader("Push"),
            new SSKeybindSetting(
                Plugin.Instance.Config!.KeybindId,
                Plugin.Instance.Translation.KeybindSettingLabel,
                KeyCode.None, false, false,
                Plugin.Instance.Translation.KeybindSettingHintDescription),
            new SSDropdownSetting(
                Plugin.Instance.Config!.StrengthDropdownId,
                "Wie stark möchtest du schubsen / geschubst werden?",
                ["Extrem", "Normal", "Schwach"],
                1,
                SSDropdownSetting.DropdownEntryType.Regular,
                "Wenn du \"Schwach\" einstellst, wird deine Schubskraft um 50 % reduziert, UND andere Personen schubsen dich ebenfalls nur noch halb so weit! Diese Einstellung wird erst ab der NÄCHSTEN RUNDE wirksam.")
        ];

        ServerSpecificSettingBase[] existing = ServerSpecificSettingsSync.DefinedSettings ?? [];
        ServerSpecificSettingBase[] combined = new ServerSpecificSettingBase[existing.Length + extra.Length];
        existing.CopyTo(combined, 0);
        extra.CopyTo(combined, existing.Length);
        ServerSpecificSettingsSync.DefinedSettings = combined;
        ServerSpecificSettingsSync.UpdateDefinedSettings();

        PlayerEvents.Joined += OnJoined;
    }

    public static void UnregisterEvents()
    {
        ServerSpecificSettingsSync.ServerOnSettingValueReceived -= OnSSSReceived;
    }

    private static void OnSSSReceived(ReferenceHub hub, ServerSpecificSettingBase ev)
    {
        if (!Player.TryGet(hub.networkIdentity, out Player player))
            return;

        Logger.Debug($"Player {player.Nickname} received setting: {ev.SettingId}", Plugin.Instance.Config!.Debug);

        // Check if the setting is our push keybind and if the key is pressed
        if (ev is SSKeybindSetting keybindSetting &&
            keybindSetting.SettingId == Plugin.Instance.Config!.KeybindId &&
            keybindSetting.SyncIsPressed)
            TryToPush(player);
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        Strengths[ev.Player.PlayerId] = Strength.Normal;

        Timing.CallDelayed(5f, () =>
        {
            if (!ServerSpecificSettingsSync.TryGetSettingOfUser(ev.Player.ReferenceHub,
                    Plugin.Instance.Config!.StrengthDropdownId,
                    out SSDropdownSetting setting)) return;

            if (setting.SyncSelectionIndexRaw == 0) Strengths[ev.Player.PlayerId] = Strength.Extreme;
            if (setting.SyncSelectionIndexRaw == 1) Strengths[ev.Player.PlayerId] = Strength.Normal;
            if (setting.SyncSelectionIndexRaw == 2) Strengths[ev.Player.PlayerId] = Strength.Weak;

            Logger.Debug("Player " + ev.Player.Nickname + " has " + Strengths[ev.Player.PlayerId] + " selected!");
        });
    }


    private static void TryToPush(Player pushingPlayer)
    {
        // Check if pushingPlayer is a human and not handcuffed
        if ((!pushingPlayer.IsHuman && pushingPlayer.Role != RoleTypeId.Scp0492) || pushingPlayer.IsDisarmed)
        {
            Logger.Debug($"{pushingPlayer.Nickname} is not a human (or zombie) or is disarmed.",
                Plugin.Instance.Config!.Debug);
            return;
        }

        // Check if the pushingPlayer is on cooldown
        float currentTime = Time.time;
        if (PushCooldowns.TryGetValue(pushingPlayer.PlayerId, out float lastPushTime) &&
            currentTime - lastPushTime < 10f)
        {
            float remainingCooldown = 10f - (currentTime - lastPushTime);
            remainingCooldown = Mathf.Round(remainingCooldown * 10f) / 10f;

            // Show cooldown hint to pushingPlayer
            pushingPlayer.SendHint(
                Plugin.Instance.Translation.PlayerPushCooldownHint.Replace("$remainingCooldown$",
                    remainingCooldown.ToString(CultureInfo.CurrentCulture)),
                Plugin.Instance.Config!.PlayerPushHintDuration
            );

            Logger.Debug("Player is on cooldown for pushing.", Plugin.Instance.Config!.Debug);
            return;
        }

        // Get the pushingPlayer's position and the direction they are facing
        Vector3 pushingPlayerPosition = pushingPlayer.Camera.position;
        Vector3 forwardDirection = pushingPlayer.Camera.forward;

        // Check what the pushingPlayer is looking at with a raycast
        if (!Physics.Raycast(pushingPlayerPosition, forwardDirection, out RaycastHit raycastHit, 1.5f,
                ~((1 << 1) | (1 << 13) | (1 << 16) | (1 << 28))))
            return;

        // No player was hit
        if (!Player.TryGet(raycastHit.transform.gameObject, out Player targetedPlayer)) return;

        if (pushingPlayer == targetedPlayer)
        {
            Logger.Debug("Player tried to push themselves.", Plugin.Instance.Config!.Debug);
            return;
        }

        forwardDirection.y = 0;


        Strength targetStrength = Strengths[targetedPlayer.PlayerId];
        Strength pushingStrength = Strengths[targetedPlayer.PlayerId];
        Strength weakestStrength = targetStrength < pushingStrength ? targetStrength : pushingStrength;
        bool isDangerousRoom = targetedPlayer.Room is { Name: RoomName.EzGateA } or { Name: RoomName.Hcz106 };

        double multiplier = StrengthMultiplier[isDangerousRoom ? Strength.Weak : weakestStrength];

        Timing.RunCoroutine(ApplyPushForce(targetedPlayer, forwardDirection.normalized, multiplier));

        // Show hint to the pushingPlayer
        pushingPlayer.SendHint(
            Plugin.Instance.Translation.PlayerPushSuccessfulHint.Replace("$player$", targetedPlayer.Nickname),
            Plugin.Instance.Config!.PlayerPushHintDuration);

        // Show hint to the targetedPlayer
        targetedPlayer.SendHint(
            Plugin.Instance.Translation.PlayerGotPushedHint.Replace("$player$", pushingPlayer.Nickname),
            Plugin.Instance.Config!.PlayerGotPushedHintDuration);

        // Update the player's cooldown time
        PushCooldowns[pushingPlayer.PlayerId] = currentTime;
    }

    private static IEnumerator<float> ApplyPushForce(Player player, Vector3 direction,
        double pushStrengthMultiplier = 1.0)
    {
        float pushDistance = Plugin.Instance.Config!.PushForce; // total push distance
        const float pushDuration = 0.000000000001f; // sweet spot for push timing

        const int mask = (1 << 0) // Default
                         | (1 << 25) // OnlyWorldCollision
                         | (1 << 27) // Door
                         | (1 << 29); // Fence

        player.EnableEffect<Ensnared>(); // Freeze the users movement

        double steps = 20 * pushStrengthMultiplier;

        for (int i = 0; i < steps; i++)
        {
            if (Physics.Raycast(player.Position, direction, 1f, mask))
            {
                Logger.Debug("Can't push since wall.", Plugin.Instance.Config!.Debug);
                break;
            }

            // Apply the push force by updating position
            player.Position += direction * (pushDistance / 50);
            yield return Timing.WaitForSeconds(pushDuration / 50);
        }

        player.DisableEffect<Ensnared>(); // Unfreeze the users movement

        Logger.Debug($"Push duration per step: {pushDuration / 50}", Plugin.Instance.Config!.Debug);
        Logger.Debug("Push force applied", Plugin.Instance.Config!.Debug);
    }
}