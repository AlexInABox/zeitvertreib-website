using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;
using PlayerRoles;

namespace Flipped.Events;

public class InventoryScramble : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return Player.ReadyList.Any(p =>
            p.IsAlive && !p.IsSCP && p != player && p.Role != RoleTypeId.Tutorial);
    }

    public void Run(Player player)
    {
        List<Player> candidates = Player.ReadyList
            .Where(p => p.IsAlive && !p.IsSCP && p != player && p.Role != RoleTypeId.Tutorial)
            .ToList();

        if (candidates.Count == 0)
        {
            EventHandlers.PushUserMessage(player, "Die Münze wollte dein Inventar tauschen, aber es gibt niemanden!");
            return;
        }

        Player other = candidates[EventHandlers.Random.Next(candidates.Count)];

        List<ItemType> playerItems = player.Items.Select(i => i.Type).ToList();
        List<ItemType> otherItems = other.Items.Select(i => i.Type).ToList();

        player.ClearInventory();
        other.ClearInventory();

        foreach (ItemType item in otherItems) player.AddItem(item);
        foreach (ItemType item in playerItems) other.AddItem(item);

        EventHandlers.PushUserMessage(player, $"Die Münze tauscht dein Inventar mit {other.Nickname}!");
        EventHandlers.PushUserMessage(other, $"{player.Nickname} wirft eine Münze und tauscht dein Inventar mit seinem!");
    }
}
