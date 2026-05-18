using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Text;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using RueI.API;
using RueI.API.Elements;
using RueI.Utils;
using RueI.Utils.Enums;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;
using Random = System.Random;

namespace Eventim;

public static class EventHandlers
{
    private const int EventInterval = 10;
    private static int _passedRoundsCounter;
    private static readonly Random Rng = new();

    private static IEvent _currentEvent;
    private static IEvent _queuedEvent;


    public static void RegisterEvents()
    {
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;
        ServerEvents.RoundStarted += OnRoundStarted;
        ServerEvents.RoundRestarted += OnRoundRestarted;
        ServerEvents.RoundEnding += OnRoundEnding;
        PlayerEvents.Joined += OnPlayerJoined;
    }

    public static void UnregisterEvents()
    {
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
        ServerEvents.RoundStarted -= OnRoundStarted;
        ServerEvents.RoundRestarted -= OnRoundRestarted;
        ServerEvents.RoundEnding -= OnRoundEnding;
        PlayerEvents.Joined -= OnPlayerJoined;
    }

    private static void OnWaitingForPlayers()
    {
        _passedRoundsCounter++;
        if (_queuedEvent is null) return;
        _currentEvent = _queuedEvent;
        _queuedEvent = null;

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

    private static void OnRoundEnding(RoundEndingEventArgs ev)
    {
        if ((_passedRoundsCounter + 1) % EventInterval != 0) return;
        QueueEvent(GetAvailableEvents()[Rng.Next(GetAvailableEvents().Count)]);
    }

    private static void OnRoundRestarted()
    {
        _currentEvent?.UnregisterEvents();
        _currentEvent = null;
    }

    private static void OnPlayerJoined(PlayerJoinedEventArgs ev)
    {
        if (_currentEvent is null) return;

        RueDisplay display = RueDisplay.Get(ev.Player);
        StringBuilder builder = new();
        builder.SetAlignment(AlignStyle.Left);
        builder.SetLineHeight(15f);
        builder.SetHorizontalPos(ev.Player.EdgeOffset());
        builder.Append($"<size=25><b><color=green>{_currentEvent.Name} EVENT</color></b></size>\n");
        builder.CloseHorizontalPos();
        builder.AppendLine(
            $"<size=15><b><color=white>{Wrap(_currentEvent.Description, 40, ev.Player.EdgeOffset())}</color></b></size>");
        if (_currentEvent.Rules.Count > 0)
        {
            builder.AddLinebreak();
            builder.SetHorizontalPos(ev.Player.EdgeOffset());
            builder.AppendLine("<size=15><b><color=yellow>REGELN:</color></b></size>");
            builder.CloseHorizontalPos();
            int ruleCounter = 1;
            foreach (string rule in _currentEvent.Rules)
            {
                builder.SetHorizontalPos(ev.Player.EdgeOffset());
                builder.Append($"<size=15><b>{ruleCounter}. {Wrap(rule, 40, ev.Player.EdgeOffset() + 20f)}</b></size>");
                builder.CloseHorizontalPos();
                builder.AddLinebreak();
                ruleCounter++;
            }
        }

        builder.CloseLineHeight();
        builder.CloseAlign();

        BasicElement hint = new(800f, builder.ToString());

        display.Show(new Tag(), hint);
    }

    private static string Wrap(string text, int maxLineLength, float horizontalPosition)
    {
        string[] words = text.Split(' ');
        string line = "";
        StringBuilder result = new();

        foreach (string word in words)
            if (line.Length + word.Length + 1 > maxLineLength)
            {
                result.SetHorizontalPos(horizontalPosition);
                result.AppendLine(line);
                result.CloseHorizontalPos();
                line = word;
            }
            else
            {
                line = string.IsNullOrEmpty(line) ? word : $"{line} {word}";
            }

        if (!string.IsNullOrEmpty(line))
        {
            result.SetHorizontalPos(horizontalPosition);
            result.AppendLine(line);
            result.CloseHorizontalPos();
        }

        return result.ToString();
    }

    public static void QueueEvent(IEvent ev)
    {
        _queuedEvent = ev;

        foreach (Player player in Player.ReadyList)
            player.SendBroadcast(
                $"<size=40><color=yellow><b>⚠ Nächste Runde findet das Event \"{ev.Name}\" statt!</b></color></size>",
                30, Broadcast.BroadcastFlags.Normal, true);
    }

    public static List<IEvent> GetAvailableEvents()
    {
        return typeof(IEvent).Assembly
            .GetTypes()
            .Where(t =>
                t.IsClass &&
                !t.IsAbstract &&
                t.Namespace == "Eventim.Events" &&
                typeof(IEvent).IsAssignableFrom(t))
            .Select(t => (IEvent)Activator.CreateInstance(t)!)
            .ToList();
    }

    /// <summary>
    ///     Gets the offset necessary to push a hint to the edge of the screen.
    /// </summary>
    /// <param name="player">The player the offset should be calculated for.</param>
    /// <returns>The position offset needed to place the hint on the edge of the screen.</returns>
    [SuppressMessage("ReSharper", "InconsistentNaming")]
    private static float EdgeOffset(this Player player)
    {
        const float Base = 1080f - 1f; //slight padding
        const float DisplayAreaWidth = 1200f;

        float aspectRatio = player.ReferenceHub.aspectRatioSync.AspectRatio;

        return -Mathf.Min((aspectRatio * Base - DisplayAreaWidth) / 2f, DisplayAreaWidth);
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