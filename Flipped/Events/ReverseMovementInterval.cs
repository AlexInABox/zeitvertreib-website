using System.Collections.Generic;
using CustomPlayerEffects;
using LabApi.Features.Wrappers;
using MEC;

namespace Flipped.Events;

public class ReverseMovementInterval : IEvent
{
    private const float TotalDuration = 60f;

    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        EventHandlers.PushUserMessage(player, "Die Münze spielt mit deinen Beinen, sie wissen nicht mehr was sie tun!");
        Timing.RunCoroutine(IntervalLoop(player));
    }

    private static IEnumerator<float> IntervalLoop(Player player)
    {
        float elapsed = 0f;

        while (elapsed < TotalDuration && player.IsAlive)
        {
            float onTime = EventHandlers.Random.Next(2, 6);
            player.EnableEffect<Slowness>(200, onTime);
            yield return Timing.WaitForSeconds(onTime);
            elapsed += onTime;

            if (!player.IsAlive || elapsed >= TotalDuration) break;

            float offTime = EventHandlers.Random.Next(2, 6);
            yield return Timing.WaitForSeconds(offTime);
            elapsed += offTime;
        }
    }
}