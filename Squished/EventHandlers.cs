using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using PlayerStatsSystem;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;

namespace Squished;

public static class EventHandlers
{
    public static void RegisterEvents()
    {
        AudioClipStorage.LoadClip(Plugin.Instance.Config!.BonkSoundEffectPath, "squished_sound_effect");
        PlayerEvents.Hurting += OnHurting;
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.Hurting -= OnHurting;
    }

    private static void OnHurting(PlayerHurtingEventArgs ev)
    {
        if (!(ev.DamageHandler is UniversalDamageHandler universalDamageHandler &&
              universalDamageHandler.TranslationId == DeathTranslations.Falldown.Id)) return;
        float fallDamageDealt = universalDamageHandler.Damage;

        int bonkCount = 0;
        Collider[] hitColliders = Physics.OverlapSphere(ev.Player.Position, 1f);
        foreach (Collider collider in hitColliders)
            if (Player.TryGet(collider.gameObject, out Player player))
            {
                if (player.PlayerId == ev.Player.PlayerId || player.IsGodModeEnabled) continue;
                DamageHandlerBase damageHandler =
                    new CustomReasonDamageHandler("Zerquetscht von " + ev.Player.Nickname + "!", fallDamageDealt);
                player.Damage(damageHandler);
                bonkCount++;
            }

        PlaySoundEffect(ev.Player.Position, bonkCount);
    }

    private static void PlaySoundEffect(Vector3 pos, int bonkCount)
    {
        if (bonkCount <= 0) return;
        AudioPlayer audioPlayer = AudioPlayer.CreateOrGet("squished_audioplayer" + pos.GetHashCode());
        audioPlayer.AddSpeaker("squished_speaker" + pos.GetHashCode(), pos, 8F + bonkCount, true, 3F, 25F);
        audioPlayer.DestroyWhenAllClipsPlayed = true;
        audioPlayer.AddClip("squished_sound_effect", Plugin.Instance.Config!.Volume);

        Logger.Debug("Playing sound effect at position: " + pos);
    }
}