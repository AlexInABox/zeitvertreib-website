using System;
using System.Collections.Generic;
using CustomPlayerEffects;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class HeavenlyEffect : IEvent
{
    public EventType EventType { get; } = EventType.Heavenly;

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
                player.EnableEffect<MovementBoost>(50, 15f); // Superspeed!
            }
        ];
        int index = EventHandlers.Random.Next(actions.Count);

        actions[index]();
    }
}