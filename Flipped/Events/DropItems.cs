using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class DropItems : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return player.Items.Any();
    }

    public void Run(Player player)
    {
        List<Item> items = player.Items.ToList();
        foreach (Item item in items)
        {
            player.DropItem(item);
        }

        EventHandlers.PushUserMessage(player, "Die Münze reißt dir alles aus den Händen!");
    }
}
