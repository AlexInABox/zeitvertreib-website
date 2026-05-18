using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class Kick : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.Kick("Das Glück der Münze kickt dich vom Server ^^");
    }
}