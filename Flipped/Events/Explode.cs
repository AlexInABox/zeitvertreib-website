using LabApi.Features.Wrappers;
using MEC;
using Utils;

namespace Flipped.Events;

public class Explode : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        EventHandlers.PushUserMessage(player, "Die Münze... hat genug von dir... 💀");
        Timing.CallDelayed(3f, () =>
        {
            if (!player.IsAlive) return;
            ExplosionUtils.ServerExplode(player.ReferenceHub, ExplosionType.PinkCandy);
        });
    }
}