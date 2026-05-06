using LabApi.Features.Wrappers;
using UnityEngine;

namespace Flipped.Events;

public class PermanentShrink : IEvent
{
    public EventType EventType { get; } = EventType.Neutral;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        Vector3 current = player.Scale;
        player.Scale = new Vector3(current.x - 0.1f, current.y - 0.1f, current.z - 0.1f);
        EventHandlers.PushUserMessage(player, "Die Münze schrumpft dich ein bisschen... ");
    }
}
