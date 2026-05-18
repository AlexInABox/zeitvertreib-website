using System;
using CommandSystem;
using LabApi.Features.Console;

namespace Eventim.Commands;

[CommandHandler(typeof(RemoteAdminCommandHandler))]
public class CommandHandler : ICommand
{
    public string Command => "eventim";
    public string[] Aliases => ["event", "events", "even", "eventi", "eventims"];
    public string Description => "Eventim Event Manager.";

    public bool Execute(ArraySegment<string> arguments, ICommandSender sender, out string response)
    {
        response = "";

        if (arguments.Array is not { Length: > 1 })
        {
            response = ShowHelp();
            return true;
        }

        switch (arguments.Array[1])
        {
            case "list":
                response = ListEvents();
                return true;
            case "queue":
                if (arguments.Array is not { Length: > 2 })
                {
                    response = "\n<color=red><b>UNVOLLSTÄNDIGER BEFEHL</b></color>";
                    response += ShowHelp();
                    return false;
                }

                string eventName = string.Empty;
                for (int i = 2; i <= arguments.Count; i++) eventName += arguments.Array[i];
                response = QueueEvent(eventName);
                return true;
            default:
                response = "\n<color=red><b>BEFEHL NICHT GEFUNDEN</b></color>";
                response += ShowHelp();
                return false;
        }
    }

    private static string ShowHelp()
    {
        string response =
            $"\n<b>{Plugin.Instance.Name} ({Plugin.Instance.Version}) von {Plugin.Instance.Author}</b>\n\n" +
            "<b>NAME</b>\n" +
            "    eventim - Eventverwaltung für Zeitvertreib\n\n" +
            "<b>SYNOPSIS</b>\n" +
            "    eventim list\n" +
            "    eventim queue <eventName>\n\n" +
            "<b>DESCRIPTION</b>\n" +
            "    Startet und verwaltet automatisierte Events für Zeitvertreib.\n\n" +
            "<b>COMMANDS</b>\n" +
            "    list\n" +
            "        Zeigt eine Liste aller installierten und verfügbaren Events.\n\n" +
            "    queue <eventName>\n" +
            "        Setzt das angegebene Event für die nächste Runde.\n" +
            "        Falls bereits ein Event gesetzt ist, wird dieses überschrieben.\n\n" +
            "<b>NOTES</b>\n" +
            "    - Um ein geplantes Event abzubrechen, muss der Server am Rundenende\n" +
            "      manuell neugestartet werden.\n";

        return response;
    }

    private static string ListEvents()
    {
        string response = "\n<b>Alle Events:</b>\n";

        foreach (IEvent availableEvent in EventHandlers.GetAvailableEvents())
            response += "- " + availableEvent.Name + "\n";

        return response;
    }

    private static string Normalize(string s)
    {
        return s.ToLowerInvariant().Replace(" ", "");
    }

    private static string QueueEvent(string eventName)
    {
        Logger.Warn(eventName);
        foreach (IEvent availableEvent in EventHandlers.GetAvailableEvents())
        {
            if (!string.Equals(
                    Normalize(availableEvent.Name),
                    Normalize(eventName),
                    StringComparison.OrdinalIgnoreCase))
                continue;
            EventHandlers.QueueEvent(availableEvent);
            return $"<color=green><b>{eventName} wurde erfolgreich für die nächste Runde vorbereitet!</b></color>";
        }

        return
            $"<color=red><b>{eventName} konnte nicht gefunden werden!\n Eine Liste aller verfügbaren Events kannst du mit \"eventim list\" einsehen.";
    }
}