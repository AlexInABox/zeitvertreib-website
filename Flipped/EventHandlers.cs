using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using Random = System.Random;

namespace Flipped;

public static class EventHandlers
{
    public static readonly Random Random = new();
    private static readonly ConcurrentDictionary<int, string> PlayerMessage = new();

    public static void RegisterEvents()
    {
        PlayerEvents.FlippedCoin += OnFlippedCoin;
        PlayerEvents.Joined += OnJoined;
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.FlippedCoin -= OnFlippedCoin;
        PlayerEvents.Joined -= OnJoined;
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        Hint hintHud = new()
        {
            Alignment = HintAlignment.Center,
            //AutoText = _ => PlayerMessage[ev.Player.PlayerId],
            AutoText = _ => PlayerMessage.TryGetValue(ev.Player.PlayerId, out string value) ? value : "",
            YCoordinateAlign = HintVerticalAlign.Bottom,
            YCoordinate = 900,
            XCoordinate = 0,
            SyncSpeed = HintSyncSpeed.Fast
        };
        PlayerDisplay playerDisplay = PlayerDisplay.Get(ev.Player);
        playerDisplay.AddHint(hintHud);
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
        PlayerMessage.AddOrUpdate(player.PlayerId, message, (_, _) => message);
        Timing.CallDelayed(10f, () =>
        {
            // Reset the players message to nothing IF the current message still matches our "old" message at this point.
            PlayerMessage.TryUpdate(player.PlayerId, string.Empty, message);
        });
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