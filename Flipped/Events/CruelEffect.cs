using System;
using System.Collections.Generic;
using CustomPlayerEffects;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class CruelEffect : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        List<Action> actions =
        [
            () =>
            {
                player.EnableEffect<Blindness>(90, 15f); // Barely blind. 10% visibility left!
                EventHandlers.PushUserMessage(player, "Die Münze nimmt dir deine Augen...");
            },
            () =>
            {
                player.EnableEffect<Slowness>(90, 15f); // 90% Slowdown!
                EventHandlers.PushUserMessage(player, "Das Glück der Münze bricht dir deine Beine!");
            },
            () =>
            {
                player.EnableEffect<Sinkhole>(1, 15f); // Scary!
                EventHandlers.PushUserMessage(player, "Die Münze möchte dich leiden sehen!");
            },
            () =>
            {
                player.EnableEffect<Slowness>(190, 15f); // Reversed controls!!
                EventHandlers.PushUserMessage(player, "Die Münze invertiert deine Steuerung?! Lol.");
            }
        ];
        int index = EventHandlers.Random.Next(actions.Count);

        actions[index]();
    }
}