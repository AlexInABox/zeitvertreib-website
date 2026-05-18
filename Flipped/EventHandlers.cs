using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using RueI.API;
using RueI.API.Elements;
using RueI.Utils;
using Random = System.Random;

namespace Flipped;

public static class EventHandlers
{
    public static readonly Random Random = new();

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
        if (ev.CoinItem.LastFlipTime is not null) return; //If this coin already has a LastFlipTime it cant be reused!
        // Heads: 40% Neutral, 45% Bad,  15% Cruel
        // Tails: 40% Neutral, 45% Good, 15% Heavenly
        int roll = Random.Next(100);

        EventType eventType = roll switch
        {
            < 40 => EventType.Neutral,
            < 85 => ev.IsTails ? EventType.Good : EventType.Bad,
            _ => ev.IsTails ? EventType.Heavenly : EventType.Cruel
        };

        List<IEvent> selectedEvents =
            GetAvailableEvents().Where(e => e.EventType == eventType && e.CanRun(ev.Player)).ToList();
        IEvent selectedEvent = selectedEvents[Random.Next(selectedEvents.Count)];

        Timing.CallDelayed(2.2f, () => //2.2f is the sweetspot for the coinflip animation to play!
        {
            selectedEvent.Run(ev.Player);
            ev.CoinItem.DropItem().Destroy();
        });
    }

    public static List<IEvent> GetAvailableEvents()
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

    public static void PushUserMessage(Player player, string message)
    {
        RueDisplay display = RueDisplay.Get(player);
        StringBuilder builder = new();

        builder.SetSize(30f);
        builder.AppendLine(message);
        builder.CloseSize();

        BasicElement hint = new(100f, builder.ToString());

        display.Show(new Tag("FlippedHint:" + player.PlayerId), hint, 10f);
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