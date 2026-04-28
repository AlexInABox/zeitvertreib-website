using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class CoinCollection : IEvent
{
    public EventType EventType { get; } = EventType.Neutral;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        player.AddItem(ItemType.Coin);
        player.AddItem(ItemType.Coin);
        player.AddItem(ItemType.Coin);
        EventHandlers.PushUserMessage(player, "Die Münze schenkt dir... mehr Münzen. Natürlich.");
    }
}
