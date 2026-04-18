using LabApi.Events.Handlers;

namespace Informed;

public static class EventHandlers
{
    public static void RegisterEvents()
    {
        PlayerEvents.Joined += Utils.SendHeaderToPlayer;
        //Utils.RegisterSSSS();
    }

    public static void UnregisterEvents()
    {
    }
}