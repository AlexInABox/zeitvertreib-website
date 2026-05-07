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
                EventHandlers.PushUserMessage(player, "Das Glück der Münze klaut dir deine Brille :(");
            },
            () =>
            {
                player.EnableEffect<Deafened>(255, 15f); // Deaf
                EventHandlers.PushUserMessage(player, "Das Glück der Münze nimmt dir deine Ohren...");
            },
            () =>
            {
                player.EnableEffect<Slowness>(30, 15f); // Slowww
                EventHandlers.PushUserMessage(player, "Die Münze fällt dir auf die Füße! >.<");
            },
            () =>
            {
                player.EnableEffect<HeavyFooted>(255, 15f); // No more jumping!
                EventHandlers.PushUserMessage(player, "Die Münze nimmt dir deine Sprungkraft...");
            }
        ];
        int index = EventHandlers.Random.Next(actions.Count);

        actions[index]();
    }
}