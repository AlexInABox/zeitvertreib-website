namespace Tracked.API;

public static class TrackedAPI
{
    public static int GetCurrentRoundNumber()
    {
        return Plugin.Instance.Config.CurrentRoundNumber;
    }
}