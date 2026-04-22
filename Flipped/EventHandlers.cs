using System;
using System.Collections.Generic;
using System.Linq;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using Random = System.Random;

namespace Flipped;

public static class EventHandlers
{
    public static Random Random = new();

    public static void RegisterEvents()
    {
        PlayerEvents.FlippedCoin += OnFlippedCoin;
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.FlippedCoin -= OnFlippedCoin;
    }

    private static void OnFlippedCoin(PlayerFlippedCoinEventArgs ev)
    {
        // Heads: 50% Neutral, 35% Bad,  15% Cruel
        // Tails: 50% Neutral, 35% Good, 15% Heavenly
        int roll = Random.Next(100);

        EventType eventType = roll switch
        {
            < 50 => EventType.Neutral,
            < 85 => ev.IsTails ? EventType.Good : EventType.Bad,
            _ => ev.IsTails ? EventType.Heavenly : EventType.Cruel
        };

        List<IEvent> selectedEvents = GetAvailableEvents().Where(e => e.EventType == eventType).ToList();
        IEvent selectedEvent = selectedEvents[Random.Next(selectedEvents.Count)];

        if (selectedEvent.CanRun(ev.Player))
        {
            selectedEvent.Run(ev.Player);
            ev.CoinItem.DropItem().Destroy();
        }
    }

    private static List<IEvent> GetAvailableEvents()
    {
        return typeof(IEvent).Assembly
            .GetTypes()
            .Where(t =>
                t.IsClass &&
                !t.IsAbstract &&
                t.Namespace == "Flipped.Events" &&
                typeof(IEvent).IsAssignableFrom(t))
            .Select(t => (IEvent)Activator.CreateInstance(t)!)
            .ToList();
    }
}

public enum EventType
{
    Cruel,
    Bad,
    Neutral,
    Good,
    Heavenly
}

public interface IEvent
{
    EventType EventType { get; }
    bool CanRun(Player player);
    void Run(Player player);
}