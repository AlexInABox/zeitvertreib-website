using LabApi.Features.Wrappers;

namespace Proximity.API;

public static class ProximityAPI
{
    public static bool IsProximityVoiceChatEnabled(Player player) => player.IsScpProximityChatEnabled();
}