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
            },
            () =>
            {
                player.EnableEffect<Slowness>(90, 15f); // 90% Slowdown!
            },
            () =>
            {
                player.EnableEffect<Sinkhole>(1, 15f); // Scary!
            }
        ];
        int index = EventHandlers.Random.Next(actions.Count);

        actions[index]();
    }
}