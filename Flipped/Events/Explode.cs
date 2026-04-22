using LabApi.Features.Wrappers;
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
        ExplosionUtils.ServerExplode(player.ReferenceHub, ExplosionType.PinkCandy);
    }
}