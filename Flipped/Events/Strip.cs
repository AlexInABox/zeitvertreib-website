using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class Strip : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.ClearInventory();
        EventHandlers.PushUserMessage(player, "Die Münze stiehlt dein gesamtes Inventar! Alles weg!");
    }
}