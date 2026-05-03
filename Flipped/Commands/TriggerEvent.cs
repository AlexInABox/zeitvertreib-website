using System;
using System.Collections.Generic;
using System.Linq;
using CommandSystem;
using LabApi.Features.Wrappers;

namespace Flipped.Commands;

[CommandHandler(typeof(RemoteAdminCommandHandler))]
public class TriggerEvent : ICommand
{
    public string Command => "flipped";
    public string[] Aliases => ["flip"];
    public string Description => "Trigger a Flipped coin event on a player.";

    public bool Execute(ArraySegment<string> arguments, ICommandSender sender, out string response)
    {
        if (arguments.Count < 2)
        {
            response = ShowHelp();
            return false;
        }

        string playerArg = arguments.Array![1];
        string eventArg = arguments.Array[2];

        Player target = Player.ReadyList.FirstOrDefault(p =>
            p.Nickname.Equals(playerArg, StringComparison.OrdinalIgnoreCase) ||
            p.PlayerId.ToString() == playerArg);

        if (target == null)
        {
            response = $"Spieler '{playerArg}' nicht gefunden.";
            return false;
        }

        List<IEvent> allEvents = EventHandlers.GetAvailableEvents();
        IEvent selectedEvent = allEvents.FirstOrDefault(e =>
            e.GetType().Name.Equals(eventArg, StringComparison.OrdinalIgnoreCase));

        if (selectedEvent == null)
        {
            string available = string.Join(", ", allEvents.Select(e => e.GetType().Name));
            response = $"Event '{eventArg}' nicht gefunden.\nVerfügbar: {available}";
            return false;
        }

        if (!selectedEvent.CanRun(target))
        {
            response =
                $"Event '{selectedEvent.GetType().Name}' kann derzeit nicht auf {target.Nickname} angewendet werden.";
            return false;
        }

        selectedEvent.Run(target);
        response = $"Event '{selectedEvent.GetType().Name}' wurde auf {target.Nickname} angewendet.";
        return true;
    }

    private static string ShowHelp()
    {
        List<IEvent> allEvents = EventHandlers.GetAvailableEvents();
        string eventList = string.Join(", ", allEvents.Select(e => e.GetType().Name));
        return
            "\n<b>flipped <Spieler> <Event></b>\n" +
            "    Löst ein Flipped-Event manuell auf einen Spieler aus.\n\n" +
            "<b>Beispiel:</b>\n" +
            "    flipped peanutmow Tank\n" +
            "    flipped 3 Cancer\n\n" +
            "<b>Verfügbare Events:</b>\n" +
            $"    {eventList}";
    }
}