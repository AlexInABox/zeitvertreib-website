using System;
using System.Collections.Generic;
using System.Linq;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using MEC;

namespace Eventim;

public static class EventHandlers
{
    private const int EventInterval = 10;
    private static int _passedRoundsCounter;
    private static readonly Random Rng = new();

    private static IEvent _currentEvent;


    public static void RegisterEvents()
    {
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;
        ServerEvents.RoundStarted += OnRoundStarted;
        ServerEvents.RoundRestarted += OnRoundRestarted;
        PlayerEvents.Joined += OnPlayerJoined;
    }

    public static void UnregisterEvents()
    {
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
        ServerEvents.RoundStarted -= OnRoundStarted;
        ServerEvents.RoundRestarted -= OnRoundRestarted;
        PlayerEvents.Joined -= OnPlayerJoined;
    }

    private static void OnWaitingForPlayers()
    {
        _passedRoundsCounter++;

        if (_passedRoundsCounter % EventInterval != 0) return;

        List<IEvent> events = typeof(IEvent).Assembly
            .GetTypes()
            .Where(t =>
                t.IsClass &&
                !t.IsAbstract &&
                t.Namespace == "Eventim.Events" &&
                typeof(IEvent).IsAssignableFrom(t))
            .Select(t => (IEvent)Activator.CreateInstance(t)!)
            .ToList();

        _currentEvent = events[Rng.Next(events.Count)];


        _currentEvent.RegisterEvents();

        Logger.Debug($"Registered events for event {_currentEvent.Name}");
    }

    private static void OnRoundStarted()
    {
        if ((_passedRoundsCounter + 1) % EventInterval != 0) return;

        Timing.CallDelayed(15f, () =>
        {
            foreach (Player player in Player.ReadyList)
                player.SendBroadcast(
                    "<size=40><color=yellow><b>⚠ Nächste Runde findet ein automatisiertes Event statt</b></color></size>",
                    20, Broadcast.BroadcastFlags.Normal, true);
        });
    }

    private static void OnRoundRestarted()
    {
        _currentEvent?.UnregisterEvents();
        _currentEvent = null;
    }

    private static void OnPlayerJoined(PlayerJoinedEventArgs ev)
    {
        Hint eventInfoHud = new()
        {
            Alignment = HintAlignment.Left,
            AutoText = _ =>
            {
                string hint = string.Empty;
                if (_currentEvent is null) return hint;

                string description = Wrap(_currentEvent.Description, 40);
                hint =
                    $"""
                     <size=25><b><color=green>{_currentEvent.Name} EVENT</color></b></size>
                     <size=15><b><color=white>{description}</color></b></size>
                     """;

                if (_currentEvent.Rules.Count > 0)
                {
                    string rules = string.Join(
                        "\n",
                        _currentEvent.Rules.Select((rule, i) => $"<size=15><b>{i + 1}. {Wrap(rule, 40)}</b></size>")
                    );

                    hint +=
                        $"""

                         <size=15><b><color=yellow>REGELN:</color></b></size>
                         {rules}
                         """;
                }

                return hint;
            },
            YCoordinateAlign = HintVerticalAlign.Top,
            YCoordinate = 200,
            XCoordinate = (int)(-540f * ev.Player.ReferenceHub.aspectRatioSync.AspectRatio + 600f) + 5,
            SyncSpeed = HintSyncSpeed.Slowest
        };
        PlayerDisplay playerDisplay = PlayerDisplay.Get(ev.Player);
        playerDisplay.AddHint(eventInfoHud);
    }

    private static string Wrap(string text, int maxLineLength)
    {
        string[] words = text.Split(' ');
        string line = "";
        List<string> result = new();

        foreach (string word in words)
            if (line.Length + word.Length + 1 > maxLineLength)
            {
                result.Add(line);
                line = word;
            }
            else
            {
                line = string.IsNullOrEmpty(line) ? word : $"{line} {word}";
            }

        if (!string.IsNullOrEmpty(line))
            result.Add(line);

        return string.Join("\n", result);
    }
}

public interface IEvent
{
    string Name { get; }

    string Description { get; }
    List<string> Rules { get; }

    void RegisterEvents();
    void UnregisterEvents();
}