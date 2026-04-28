using LabApi.Features.Wrappers;
using MEC;
using UnityEngine;

namespace Flipped.Events;

public class Shrink : IEvent
{
    private const float Duration = 30f;

    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        Vector3 originalScale = player.Scale;
        player.Scale = new Vector3(0.4f, 0.4f, 0.4f);
        EventHandlers.PushUserMessage(player, "Die Münze schrumpft dich! Schau mal, wie klein du bist!");

        Timing.CallDelayed(Duration, () =>
        {
            if (!player.IsAlive) return;
            player.Scale = originalScale;
        });
    }
}
