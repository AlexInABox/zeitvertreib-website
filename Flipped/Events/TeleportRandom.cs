using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class TeleportRandom : IEvent
{
    public EventType EventType { get; } = EventType.Neutral;

    public bool CanRun(Player player)
    {
        // Only run if there are any alive players!
        return Player.ReadyList.Any(p => p.IsAlive && !p.IsSCP && p != player);
    }

    public void Run(Player player)
    {
        List<Player> possiblePlayersToTpTo = Player.ReadyList.Where(p => p.IsSCP).ToList();
        Player playerToTpTo = possiblePlayersToTpTo[EventHandlers.Random.Next(0, possiblePlayersToTpTo.Count)];

        player.Position = playerToTpTo.Position;
    }
}