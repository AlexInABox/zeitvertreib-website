using System.Linq;
using LabApi.Events.Handlers;

namespace zvupdater;

public static class EventHandlers
{
    public static void RegisterEvents()
    {
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;


        // Feel free to add more event registrations here
    }

    public static void UnregisterEvents()
    {
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
    }
    
    private static void OnWaitingForPlayers()
    {
        LabApi.Loader.PluginLoader.Plugins.First().Key.
    }

    
}