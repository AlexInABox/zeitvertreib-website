using CustomPlayerEffects;
using LabApi.Features.Wrappers;
using UnityEngine;

namespace Flipped.Events;

public class PermanentFat : IEvent
{
    public EventType EventType { get; } = EventType.Good;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        Vector3 current = player.Scale;
        player.Scale = new Vector3(1.2f, current.y, 1.237f);

        player.MaxHealth = player.MaxHealth * 2f;

        player.EnableEffect<Slowness>(30, 9999f);
        player.EnableEffect<HeavyFooted>(30, 9999f);

        EventHandlers.PushUserMessage(player, "Die Münze macht dich fett! Zu viel Kuchen...");
    }
}