using System.Collections.Generic;
using System.Linq;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using PlayerRoles;
using SecretLabNAudio.Core;
using SecretLabNAudio.Core.Pools;
using UnityEngine;
using UserSettings.ServerSpecific;
using VoiceChat;
using VoiceChat.Networking;

namespace Proximity;

public static class EventHandlers
{
    private static Dictionary<Player, SpeakerToy> ActiveSpeakers { get; } = [];

    /// <summary>Gets whether the player has Proximity Chat enabled.</summary>
    /// <param name="player">The player to check.</param>
    /// <returns>If the player has Proximity Chat enabled.</returns>
    private static bool IsScpProximityChatEnabled(this Player player)
    {
        return ActiveSpeakers.ContainsKey(player);
    }

    /// <summary>
    ///     Toggles SCP Proximity Chat for the specified player.
    ///     If the player is present in <see cref="ActiveSpeakers" />, their speaker is returned to the pool and the entry is
    ///     removed.
    ///     Otherwise, a new spatial speaker is rented and added to <see cref="ActiveSpeakers" />.
    /// </summary>
    /// <param name="player">The player to toggle Proximity Chat for.</param>
    private static void ToggleScpProximityChat(this Player player)
    {
        if (player.Role.GetTeam() != Team.SCPs) return;

        if (ActiveSpeakers.TryGetValue(player, out SpeakerToy speaker))
        {
            SpeakerToyPool.Return(speaker);
            ActiveSpeakers.Remove(player);
            return;
        }

        ActiveSpeakers[player] = SpeakerToyPool.Rent(
            SpeakerToyPool.NextAvailableId,
            new SpeakerSettings { IsSpatial = true, Volume = 10f, MinDistance = 1f, MaxDistance = 15f },
            player.GameObject!.transform
        );
    }


    public static void RegisterEvents()
    {
        ServerSpecificSettingBase[] extra =
        [
            new SSGroupHeader("SCP Proximity Chat"),
            new SSKeybindSetting(
                Plugin.Instance.Config!.KeybindId,
                "SCP-Proximity-Chat umschalten",
                KeyCode.LeftAlt, true, false,
                "Aktiviere/deaktiviere den Proximity-Chat, während du ein SCP bist.")
        ];

        ServerSpecificSettingsSync.DefinedSettings ??= []; // (null-coalescing assignment operator)
        ServerSpecificSettingsSync.DefinedSettings = ServerSpecificSettingsSync.DefinedSettings.Concat(extra).ToArray();
        ServerSpecificSettingsSync.SendToAll();

        ServerSpecificSettingsSync.ServerOnSettingValueReceived += OnSSSReceived;
        PlayerEvents.SendingVoiceMessage += OnSendingVoiceMessage;
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;
        PlayerEvents.Joined += OnJoined;
    }

    public static void UnregisterEvents()
    {
        ServerSpecificSettingsSync.ServerOnSettingValueReceived -= OnSSSReceived;
        PlayerEvents.SendingVoiceMessage -= OnSendingVoiceMessage;
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
        PlayerEvents.Joined -= OnJoined;
    }

    private static void OnSSSReceived(ReferenceHub hub, ServerSpecificSettingBase ev)
    {
        if (!Player.TryGet(hub.networkIdentity, out Player player))
            return;

        // Check if the setting is our keybind and if the key is pressed
        if (ev is SSKeybindSetting keybindSetting &&
            keybindSetting.SettingId == Plugin.Instance.Config!.KeybindId &&
            keybindSetting.SyncIsPressed)
            player.ToggleScpProximityChat();
    }

    private static void OnSendingVoiceMessage(PlayerSendingVoiceMessageEventArgs ev)
    {
        if (ev.Message.Channel != VoiceChatChannel.ScpChat || !ev.Player.IsScpProximityChatEnabled()) return;

        ev.Player.VoiceModule!.CurrentChannel = VoiceChatChannel.Proximity;

        AudioMessage message = new(ActiveSpeakers[ev.Player].ControllerId, ev.Message.Data, ev.Message.DataLength);

        foreach (Player player in Player.ReadyList)
            if (player != ev.Player)
                player.Connection.Send(message);
    }

    private static void OnWaitingForPlayers()
    {
        ActiveSpeakers.Clear();
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        Hint hintHud = new()
        {
            Alignment = HintAlignment.Center,
            AutoText = _ =>
            {
                if (ev.Player.Role.GetTeam() != Team.SCPs) return string.Empty;
                string hint = ev.Player.IsScpProximityChatEnabled()
                    ? "<size=18>Proximity Chat: <color=green>AKTIVIERT</color></size>"
                    : "<size=18>Proximity Chat: <color=red>DEAKTIVIERT</color></size>";

                return hint;
            },
            YCoordinateAlign = HintVerticalAlign.Bottom,
            YCoordinate = 1080,
            XCoordinate = 0,
            SyncSpeed = HintSyncSpeed.Slow
        };
        PlayerDisplay playerDisplay = PlayerDisplay.Get(ev.Player);
        playerDisplay.AddHint(hintHud);
    }
}