using System.Collections.Generic;
using System.Linq;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using PlayerRoles;
using RueI.API;
using RueI.API.Elements;
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

            BasicElement disableHint = new(10f, "<size=18>Proximity Chat: <color=red>DEAKTIVIERT</color></size>");
            RueDisplay.Get(player).Show(new Tag("ProximityStatus" + player.PlayerId), disableHint);
            return;
        }

        ActiveSpeakers[player] = SpeakerToyPool.Rent(
            SpeakerToyPool.NextAvailableId,
            new SpeakerSettings { IsSpatial = true, Volume = 10f, MinDistance = 1f, MaxDistance = 15f },
            player.GameObject!.transform
        );
        BasicElement enableHint = new(10f, "<size=18>Proximity Chat: <color=green>AKTIVIERT</color></size>");
        RueDisplay.Get(player).Show(new Tag("ProximityStatus" + player.PlayerId), enableHint);
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
        PlayerEvents.ChangedRole += OnChangedRole;
    }

    public static void UnregisterEvents()
    {
        ServerSpecificSettingsSync.ServerOnSettingValueReceived -= OnSSSReceived;
        PlayerEvents.SendingVoiceMessage -= OnSendingVoiceMessage;
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
        PlayerEvents.ChangedRole -= OnChangedRole;
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

    private static void OnChangedRole(PlayerChangedRoleEventArgs ev)
    {
        if (ev.NewRole.Team != Team.SCPs)
        {
            RueDisplay.Get(ev.Player).SetVisible(new Tag("ProximityStatus" + ev.Player.PlayerId), false);
        }
        else
        {
            if (ActiveSpeakers.TryGetValue(ev.Player, out SpeakerToy _))
            {
                BasicElement enableHint = new(10f, "<size=18>Proximity Chat: <color=green>AKTIVIERT</color></size>");
                RueDisplay.Get(ev.Player).Show(new Tag("ProximityStatus" + ev.Player.PlayerId), enableHint);
            }
            else
            {
                BasicElement disableHint = new(10f,
                    "<size=18>Proximity Chat: <color=red>DEAKTIVIERT</color></size>");
                RueDisplay.Get(ev.Player).Show(new Tag("ProximityStatus" + ev.Player.PlayerId), disableHint);
            }

            RueDisplay.Get(ev.Player).SetVisible(new Tag("ProximityStatus" + ev.Player.PlayerId), true);
        }
    }
}