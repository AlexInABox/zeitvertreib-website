using System;
using System.Collections.Generic;
using LabApi.Events.Arguments.PlayerEvents;
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
                Plugin.Instance.Translation.KeybindSettingHintDescription)
        ];

        ServerSpecificSettingBase[] existing = ServerSpecificSettingsSync.DefinedSettings ?? [];

        ServerSpecificSettingBase[] combined = new ServerSpecificSettingBase[existing.Length + extra.Length];
        existing.CopyTo(combined, 0);
        extra.CopyTo(combined, existing.Length);

        ServerSpecificSettingsSync.DefinedSettings = combined;
        ServerSpecificSettingsSync.UpdateDefinedSettings();


        // Auto-refresh sprays
        _autoRefreshSprays = Timing.RunCoroutine(AutoRefreshSprays());
    }

    public static void UnregisterEvents()
    {
        //PlayerEvents.Joined -= OnJoined;
        ServerSpecificSettingsSync.ServerOnSettingValueReceived -= OnSSSReceived;
        Timing.KillCoroutines(_autoRefreshSprays);
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        if (ev.Player.IsDummy || ev.Player.IsHost) return;

        Utils.Spray[ev.Player.UserId] = [];
        Utils.OptimizedSpray[ev.Player.UserId] = [];
    }

    private static IEnumerator<float> AutoRefreshSprays()
    {
        while (true)
        {
            _ = Utils.SetSpraysForAllUsersFromBackend();

            yield return Timing.WaitForSeconds(15f);
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

            string[] spray = Utils.Spray[player.UserId];
            if (spray == null || spray.IsEmpty())
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
            Timing.RunCoroutine(SpawnSpray(position, rotation, scale, Utils.Spray[player.UserId],
                Utils.OptimizedSpray[player.UserId], parentToUse,
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