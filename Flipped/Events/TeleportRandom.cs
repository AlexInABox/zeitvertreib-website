using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;
using PlayerRoles;

namespace Flipped.Events;

public class TeleportRandom : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        // Only run if there are any alive players!
        return Player.ReadyList.Any(p => p.IsAlive && !p.IsSCP && p != player && p.Role != RoleTypeId.Tutorial);
    }

    public void Run(Player player)
    {
        List<Player> possiblePlayersToTpTo = Player.ReadyList
            .Where(p => p.IsAlive && !p.IsSCP && p != player && p.Role != RoleTypeId.Tutorial).ToList();
        Player playerToTpTo = possiblePlayersToTpTo[EventHandlers.Random.Next(0, possiblePlayersToTpTo.Count)];

        player.Position = playerToTpTo.Position;
        EventHandlers.PushUserMessage(player, $"Die Münze teleportiert dich zu {playerToTpTo.Nickname}...");
        EventHandlers.PushUserMessage(playerToTpTo, $"Ein Münzwurf teleportiert {player.Nickname} zu dir!!");
    }
}