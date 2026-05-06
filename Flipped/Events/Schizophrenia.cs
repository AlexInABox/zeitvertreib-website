using System;
using System.Collections.Generic;
using CustomPlayerEffects;
using LabApi.Features.Wrappers;
using MEC;
using UnityEngine;

namespace Flipped.Events;

public class Schizophrenia : IEvent
{
    private const float Duration = 1000f;
    private const int AudioSampleRate = 48000;

    private static readonly string[] Voices =
    [
        "Da war etwas...",
        "Du hörst die Stimmen flüstern...",
        "Hat sich da gerade etwas bewegt?",
        "Ich bin hinter dir.",
        "Der Boden knarrt...",
        "Du bist nicht allein hier.",
    ];

    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        EventHandlers.PushUserMessage(player, "Die Münze gab es nie....");
        player.EnableEffect<FogControl>(30, 0f);
        player.EnableEffect<Scanned>(2, 0f);
        player.EnableEffect<Blindness>(30, 0f);
        player.EnableEffect<Slowness>(20, 0f);
        player.EnableEffect<AmnesiaVision>(1, 0f);
        Timing.RunCoroutine(SchizophreniaLoop(player));
    }

    private static IEnumerator<float> SchizophreniaLoop(Player player)
    {
        float elapsed = 0f;

        while (elapsed < Duration && player.IsAlive)
        {
            float wait = EventHandlers.Random.Next(15, 26);
            yield return Timing.WaitForSeconds(wait);
            elapsed += wait;

            if (!player.IsAlive) break;

            // Random hallucinations
            switch (EventHandlers.Random.Next(8))
            {
                case 0:
                    player.EnableEffect<Traumatized>(220, 3.5f);
                    break;
                case 1:
                    player.EnableEffect<Flashed>(130, 1.8f);
                    player.EnableEffect<Blurred>(120, 2.5f);
                    Timing.CallDelayed(1.8f, () =>
                    {
                        player.Rotation = player.Rotation * Quaternion.Euler(0f, 180f, 0f);
                    });
                    break;
                case 2:
                    // Voice broadcast
                    string voice = Voices[EventHandlers.Random.Next(Voices.Length)];
                    player.SendBroadcast(voice, 4, Broadcast.BroadcastFlags.Normal, false);
                    break;
                case 3:
                    player.EnableEffect<Flashed>(130, 1.8f);
                    Timing.CallDelayed(1.8f, () =>
                    {
                        player.Rotation = player.Rotation * Quaternion.Euler(0f, 90f, 0f);
                    });
                    break;
                case 4:
                    player.EnableEffect<Slowness>(120, 2.5f);
                    player.EnableEffect<HeavyFooted>(140, 2.5f);
                    break;
                case 5:
                    player.EnableEffect<Blindness>(80, 3f);
                    break;
                case 6:
                    PlayHallucinatedFootsteps(player);
                    break;
                case 7:
                    player.EnableEffect<Flashed>(130, 0.5f);
                    player.EnableEffect<Blurred>(120, 2.5f);
                    Timing.CallDelayed(0.3f, () =>
                    {
                        player.Rotation = player.Rotation * Quaternion.Euler(0f, 270f, 0f);
                    });
                    break;
            }
        }
    }

    private static void PlayHallucinatedFootsteps(Player player)
    {
        int steps = EventHandlers.Random.Next(4, 9);
        float side = EventHandlers.Random.Next(2) == 0 ? 1f : -1f;

        for (int i = 0; i < steps; i++)
        {
            float delay = i * (0.25f + (float)EventHandlers.Random.NextDouble() * 0.12f);
            float dist = 3.5f + i * 0.25f;
            int capturedI = i;

            Timing.CallDelayed(delay, () =>
            {
                if (!player.IsAlive)
                    return;

                Vector3 backward = player.Rotation * Vector3.back;
                Vector3 right = player.Rotation * Vector3.right;
                float stepOffset = (capturedI % 2 == 0 ? 0.35f : 0.55f) * side;
                Vector3 spawnPos = player.Position + backward * (dist - capturedI * 0.15f) + right * stepOffset;

                SpeakerToy speaker = SpeakerToy.Create(spawnPos, Quaternion.identity, null, true);
                speaker.IsSpatial = true;
                speaker.MinDistance = 1f;
                speaker.MaxDistance = 14f;
                speaker.Volume = 0.85f;
                speaker.ValidPlayers = p => p == player;
                speaker.Play(GenerateFootstepSamples(), false, false);

                float clipDuration = 0.2f;
                Timing.CallDelayed(clipDuration + 0.1f, () =>
                {
                    if (!speaker.IsDestroyed)
                        speaker.Destroy();
                });
            });
        }
    }

    private static float[] GenerateFootstepSamples()
    {
        int sampleCount = (int)(AudioSampleRate * 0.18f);
        float[] samples = new float[sampleCount];

        for (int i = 0; i < sampleCount; i++)
        {
            float t = (float)i / AudioSampleRate;
            float envelope = (float)Math.Exp(-t * 32.0);
            float noise = (float)(EventHandlers.Random.NextDouble() * 2.0 - 1.0);
            float thud = (float)Math.Sin(2.0 * Math.PI * 85.0 * t);
            samples[i] = (noise * 0.3f + thud * 0.7f) * envelope * 0.85f;
        }

        return samples;
    }
}
