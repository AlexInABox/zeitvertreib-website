using LabApi.Features.Wrappers;
using MEC;

namespace Flipped.Events;

public class Cuffed : IEvent
{
    private const float Duration = 30f;

    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return !player.IsDisarmed;
    }

    public void Run(Player player)
    {
        player.IsDisarmed = true;

        Timing.CallDelayed(Duration, () =>
        {
            if (player.IsAlive && player.IsDisarmed)
                player.IsDisarmed = false;
        });
    }
}
