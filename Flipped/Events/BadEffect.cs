using System;
using System.Collections.Generic;
using CustomPlayerEffects;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class BadEffect : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

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
                player.EnableEffect<Blurred>(255, 15f); // Legally blind. Idiot.
            },
            () =>
            {
                player.EnableEffect<Deafened>(255, 15f); // Deaf
            },
            () =>
            {
                player.EnableEffect<Slowness>(30, 15f); // Slowww
            },
            () =>
            {
                player.EnableEffect<HeavyFooted>(255, 15f); // No more jumping!
            }
        ];
        int index = EventHandlers.Random.Next(actions.Count);

        actions[index]();
    }
}