using System.Collections.Generic;
using LabApi.Features.Wrappers;
using MEC;
using UnityEngine;

namespace Flipped.Events;

public class IceWalk : IEvent
{
    private const float Duration = 45f;

    private const float InertiaMultiplier = 1.6f;

    private const float FrictionPerSecond = 0.55f;

    private const float SlideDeadzone = 0.003f;

    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return player.IsAlive;
    }

    public void Run(Player player)
    {
        EventHandlers.PushUserMessage(player, "Die Münze macht den Boden glatt wie Eis!");
        Timing.RunCoroutine(IceLoop(player));
    }

    private static IEnumerator<float> IceLoop(Player player)
    {
        float elapsed = 0f;
        Vector3 lastPos = player.Position;
        Vector3 slide = Vector3.zero;
        Vector3 lastApplied = Vector3.zero;

        while (elapsed < Duration && player.IsAlive)
        {
            yield return Timing.WaitForOneFrame;
            float dt = Timing.DeltaTime;
            elapsed += dt;

            if (!player.IsAlive)
                break;

            Vector3 currentPos = player.Position;

            Vector3 fullDelta = currentPos - lastPos;
            float playerInputX = fullDelta.x - lastApplied.x;
            float playerInputZ = fullDelta.z - lastApplied.z;

            slide.x += playerInputX * InertiaMultiplier;
            slide.z += playerInputZ * InertiaMultiplier;

            float friction = Mathf.Pow(FrictionPerSecond, dt);
            slide.x *= friction;
            slide.z *= friction;

            Vector3 toApply = new Vector3(slide.x, 0f, slide.z);
            if (toApply.magnitude < SlideDeadzone)
            {
                slide = Vector3.zero;
                toApply = Vector3.zero;
            }

            if (toApply != Vector3.zero)
                player.Move(toApply);

            lastApplied = toApply;
            lastPos = currentPos;
        }
    }
}
