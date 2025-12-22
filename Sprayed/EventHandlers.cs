using System;
using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;
using MEC;
using Mirror;
using UnityEngine;
using UserSettings.ServerSpecific;
using Logger = LabApi.Features.Console.Logger;

namespace Sprayed;

public static class EventHandlers
{
    private static CoroutineHandle _autoRefreshSprays;

    public static void RegisterEvents()
    {
        //PlayerEvents.Joined += OnJoined;

        AudioClipStorage.LoadClip(Plugin.Instance.Config!.SpraySoundEffectPath, "spray_sound_effect");

        ServerSpecificSettingsSync.ServerOnSettingValueReceived += OnSSSReceived;

        ServerSpecificSettingBase[] extra =
        [
            new SSGroupHeader(Plugin.Instance.Translation.SprayGroupHeader),
            new SSKeybindSetting(
                Plugin.Instance.Config!.KeybindId,
                Plugin.Instance.Translation.KeybindSettingLabel,
                KeyCode.None, false, false,
                Plugin.Instance.Translation.KeybindSettingHintDescription),
            new SSDropdownSetting(
                Plugin.Instance.Config!.SpraySelectionSettingId,
                "Select Spray",
                ["No sprays available"])
        ];

        if (ServerSpecificSettingsSync.DefinedSettings == null)
            ServerSpecificSettingsSync.DefinedSettings = extra;
        else
            ServerSpecificSettingsSync.DefinedSettings =
                ServerSpecificSettingsSync.DefinedSettings.Concat(extra).ToArray();
        ServerSpecificSettingsSync.SendToAll();

        // Auto-refresh sprays
        _autoRefreshSprays = Timing.RunCoroutine(AutoRefreshSprays());
    }

    public static void UnregisterEvents()
    {
        //PlayerEvents.Joined -= OnJoined;
        ServerSpecificSettingsSync.ServerOnSettingValueReceived -= OnSSSReceived;
        Timing.KillCoroutines(_autoRefreshSprays);
    }

    private static IEnumerator<float> AutoRefreshSprays()
    {
        while (true)
        {
            _ = Utils.SetSpraysForAllUsersFromBackend();

            // Update SSSS dropdown options for all players
            yield return Timing.WaitForSeconds(0.5f);
            UpdateSprayDropdownOptions();

            yield return Timing.WaitForSeconds(14.5f);
        }
    }

    private static void UpdateSprayDropdownOptions()
    {
        foreach (Player player in Player.ReadyList.Where(p => p.IsPlayer))
            try
            {
                string[] sprayNames = ["Keine Sprays verfügbar!"];

                if (Utils.UserSprayIds.TryGetValue(player.UserId, out List<(int id, string name)> sprays) &&
                    sprays.Count > 0)
                    sprayNames = sprays.Select(s => s.name).ToArray();

                SSDropdownSetting currentDropdown = ServerSpecificSettingsSync.GetSettingOfUser<SSDropdownSetting>(
                    player.ReferenceHub,
                    Plugin.Instance.Config!.SpraySelectionSettingId);

                currentDropdown.SendDropdownUpdate(sprayNames, true, hub => hub.PlayerId == player.PlayerId);
            }
            catch (Exception ex)
            {
                Logger.Error($"Error updating spray dropdown for {player.Nickname}:  {ex}");
            }
    }

    private static void OnSSSReceived(ReferenceHub hub, ServerSpecificSettingBase ev)
    {
        if (!Player.TryGet(hub.networkIdentity, out Player player))
            return;

        switch (ev)
        {
            case SSKeybindSetting keybindSetting when
                keybindSetting.SettingId == Plugin.Instance.Config!.KeybindId &&
                keybindSetting.SyncIsPressed:
                PlaceSpray(player);
                return;
        }
    }

    private static void PlaceSpray(Player player)
    {
        try
        {
            if (player == null || !player.IsAlive || player.IsDisarmed) return;
            if (player.IsOnSprayCooldown()) return;

            // Get available sprays for this player
            if (!Utils.UserSprayIds.TryGetValue(player.UserId, out List<(int id, string name)> sprays) ||
                sprays.Count == 0)
            {
                player.SendHint(Plugin.Instance.Translation.NoSprayFound, 10f);
                return;
            }

            // Query the SSSS dropdown to get the selected spray index
            SSDropdownSetting dropdown =
                ServerSpecificSettingsSync.GetSettingOfUser<SSDropdownSetting>(player.ReferenceHub,
                    Plugin.Instance.Config!.SpraySelectionSettingId);

            // Get the selected spray id
            int selectedIndex = dropdown.SyncSelectionIndexRaw;

            int sprayId = sprays[selectedIndex].id;

            // Get the spray data
            if (!Utils.UserSprayData.TryGetValue(player.UserId, out Dictionary<int, string[]> playerSprays) ||
                !playerSprays.TryGetValue(sprayId, out string[] spray))
            {
                player.SendHint(Plugin.Instance.Translation.NoSprayFound, 10f);
                return;
            }

            if (spray == null || spray.IsEmpty())
            {
                player.SendHint(Plugin.Instance.Translation.NoSprayFound, 10f);
                return;
            }

            // Get optimized spray data
            if (!Utils.UserOptimizedSprayData.TryGetValue(player.UserId,
                    out Dictionary<int, string[]> optimizedSprays) ||
                !optimizedSprays.TryGetValue(sprayId, out string[] optimizedSpray))
            {
                player.SendHint(Plugin.Instance.Translation.NoSprayFound, 10f);
                return;
            }

            // Raycast from player camera
            Vector3 origin = player.Camera.position;
            Vector3 direction = player.Camera.forward;
            if (!Physics.Raycast(origin, direction, out RaycastHit hit, 2.8f, Utils.LayerMask)) return;
            if (Player.TryGet(hit.transform.gameObject, out _)) return;

            // Woah okay we hit something, let's get started by clearing the previous spray first!
            player.ClearExistingSpray();

            // Determine networked parent
            Transform parentToUse = null;
            Transform current = hit.transform;

            for (int i = 0; i < 5 && current != null; i++)
            {
                if (current.TryGetComponent(typeof(NetworkIdentity), out Component networkIdentity))
                {
                    Logger.Debug("Has NetworkIdentity - saving as parent", Plugin.Instance.Config!.Debug);
                    parentToUse = networkIdentity.transform;
                    break;
                }

                current = current.parent;
            }

            // If no networked parent found, default to null (world)
            Vector3 position = hit.point + hit.normal * 0.01f;
            Quaternion rotation = Quaternion.LookRotation(-hit.normal);
            Vector3 scale = new(0.015f, 0.01f, 1f);

            if (parentToUse != null)
            {
                position = parentToUse.InverseTransformPoint(position);
                rotation = Quaternion.Inverse(parentToUse.rotation) * rotation;
            }

            // Let's actually spawn the thing
            Timing.RunCoroutine(SpawnSpray(position, rotation, scale, spray, optimizedSpray, parentToUse,
                player.PlayerId));
            PlaySoundEffect(hit.point + hit.normal * 0.01f);

            Utils.Cooldowns[player.PlayerId] = (int)(Time.time + Plugin.Instance.Config!.CooldownDuration);
            player.SendHitMarker();
            player.SendHint(Plugin.Instance.Translation.AbilityUsed);
        }
        catch (Exception e)
        {
            Logger.Error("Exception while placing spray: " + e);
        }
    }

    private static IEnumerator<float> SpawnSpray(Vector3 basePos, Quaternion rotation, Vector3 scale, string[] spray,
        string[] optimizedSpray,
        Transform parent, int playerId)
    {
        // Calculate total height of the spray
        float totalHeight = (spray.Length - 1) * Utils.LineSpacing;

        // Start at half the total height above the hit point to center the spray
        Vector3 animationPos = basePos + rotation * Vector3.up * (totalHeight / 2);
        Vector3 optimizedPos = animationPos;
        optimizedPos -= rotation * Vector3.up * Utils.OptimizedLineSpacing / 2 - new Vector3(0, 0.011f, 0);

        List<TextToy> animationSprayTextToys = [];
        foreach (string _ in spray)
        {
            animationSprayTextToys.Add(CreateText(animationPos, scale, rotation, "", parent));

            // Move down for next line
            animationPos -= rotation * Vector3.up * Utils.LineSpacing;
        }

        Utils.ActiveSprays[playerId] = [];
        foreach (string _ in optimizedSpray)
        {
            Utils.ActiveSprays[playerId].Add(CreateText(optimizedPos, scale, rotation, "", parent));

            // Move down for chunk
            optimizedPos -= rotation * Vector3.up * Utils.OptimizedLineSpacing;
        }

        for (int i = 0; i < animationSprayTextToys.Count; i++)
        {
            animationSprayTextToys[i].TextFormat = spray[i];
            yield return Timing.WaitForOneFrame;
        }

        for (int i = 0; i < Utils.ActiveSprays[playerId].Count; i++)
        {
            TextToy textToy = Utils.ActiveSprays[playerId][i];
            textToy.TextFormat = optimizedSpray[i];
        }

        foreach (TextToy textToy in animationSprayTextToys) textToy.Destroy();
        animationSprayTextToys.Clear();
    }

    private static TextToy CreateText(Vector3 pos, Vector3 scale, Quaternion rot, string text, Transform parent)
    {
        TextToy textToy = TextToy.Create(pos, rot, scale, parent);
        textToy.DisplaySize = new Vector2(100000, 100000);
        textToy.TextFormat = text;

        //Timing.RunCoroutine(SprayLifeTime(parent, textToy));
        Timing.CallDelayed(300f, textToy.Destroy);

        return textToy;
    }

    private static void PlaySoundEffect(Vector3 pos)
    {
        AudioPlayer audioPlayer = AudioPlayer.CreateOrGet("sprayed_audioplayer" + pos.GetHashCode());
        audioPlayer.AddSpeaker("sprayed_speaker" + pos.GetHashCode(), pos, 10F, true, 5F, 1000F);
        audioPlayer.DestroyWhenAllClipsPlayed = true;
        audioPlayer.AddClip("spray_sound_effect", Plugin.Instance.Config!.Volume);

        Logger.Debug("Playing sound effect at position: " + pos, Plugin.Instance.Config!.Debug);
    }
}