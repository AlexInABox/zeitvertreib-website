using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;

namespace Flipped.Events;

public class SwapPosition : IEvent
{
    public EventType EventType { get; } = EventType.Neutral;

    public bool CanRun(Player player)
    {
        // Only run if this player is not the only one alive.
        return Player.ReadyList.Any(p => p.IsAlive && !p.IsSCP && p != player);
    }

    public void Run(Player player)
    {
        List<Player> possiblePlayers = Player.ReadyList.Where(p => p.IsAlive && p != player).ToList();
        Player playerToSwitchWith = possiblePlayers[EventHandlers.Random.Next(0, possiblePlayers.Count)];


        (playerToSwitchWith.Position, player.Position) = (player.Position, playerToSwitchWith.Position);
        (playerToSwitchWith.Rotation, player.Rotation) = (player.Rotation, playerToSwitchWith.Rotation);
        (playerToSwitchWith.LookRotation, player.LookRotation) = (player.LookRotation, playerToSwitchWith.LookRotation);
    }
}