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
                EventHandlers.PushUserMessage(player, "Die Münze verleiht dir unglaubliche Sprungkraft!!");
            },
            () =>
            {
                player.EnableEffect<NightVision>(255, 15f); // Supervision!
                EventHandlers.PushUserMessage(player, "Die Münze schenkt dir neue Augen!");
            },
            () =>
            {
                player.EnableEffect<Invisible>(1, 15f); // Nice! Invibisle!
                EventHandlers.PushUserMessage(player, "Die Münze macht dich unsichtbar! Wow..");
            },
            () =>
            {
                player.EnableEffect<MovementBoost>(30, 15f); // Speed!
                EventHandlers.PushUserMessage(player, "Die Münze macht dich voll schnell! Das ist voll cool :3");
            },
            () =>
            {
                player.EnableEffect<Fade>(200, 15f); // Barely visible
                EventHandlers.PushUserMessage(player, "Die Münze macht dich ein wenig unsichtbar :3");
            }
        ];
        int index = EventHandlers.Random.Next(actions.Count);

        actions[index]();
    }
}