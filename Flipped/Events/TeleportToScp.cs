using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class TeleportToScp : IEvent
{
    public EventType EventType { get; } = EventType.Cruel;

    public bool CanRun(Player player)
    {
        // Only run if there are any scp's!
        return Player.ReadyList.Any(p => p.IsSCP);
    }

    public void Run(Player player)
    {
        List<Player> possibleScpsToTpTo = Player.ReadyList.Where(p => p.IsSCP).ToList();
        Player scpToTpTo = possibleScpsToTpTo[EventHandlers.Random.Next(0, possibleScpsToTpTo.Count)];

        player.Position = scpToTpTo.Position;
    }
}