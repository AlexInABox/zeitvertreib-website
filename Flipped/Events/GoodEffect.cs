using System;
using System.Collections.Generic;
using CustomPlayerEffects;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class GoodEffect : IEvent
{
    public EventType EventType { get; } = EventType.Good;

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
                player.EnableEffect<Lightweight>(150, 15f); // Bunny bunny bunny!
            },
            () =>
            {
                player.EnableEffect<NightVision>(255, 15f); // Supervision!
            },
            () =>
            {
                player.EnableEffect<Invisible>(1, 15f); // Nice! Invibisle!
            },
            () =>
            {
                player.EnableEffect<MovementBoost>(30, 15f); // Speed!
            },
            () =>
            {
                player.EnableEffect<Fade>(200, 15f); // Barely visible
            }
        ];
        int index = EventHandlers.Random.Next(actions.Count);

        actions[index]();
    }
}