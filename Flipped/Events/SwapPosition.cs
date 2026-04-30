using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;
using PlayerRoles;

namespace Flipped.Events;

public class SwapPosition : IEvent
{
    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        if (player.TryGetEffect("PocketCorroding", out _))
            return false;

        return Player.ReadyList.Any(p => p.IsAlive && !p.IsSCP && p != player && p.Role != RoleTypeId.Tutorial && !p.TryGetEffect("PocketCorroding", out _));
    }

    public void Run(Player player)
    {
        List<Player> possiblePlayers = Player.ReadyList
            .Where(p => p.IsAlive && !p.IsSCP && p != player && p.Role != RoleTypeId.Tutorial && !p.TryGetEffect("PocketCorroding", out _)).ToList();
        Player playerToSwitchWith = possiblePlayers[EventHandlers.Random.Next(0, possiblePlayers.Count)];


        (playerToSwitchWith.Position, player.Position) = (player.Position, playerToSwitchWith.Position);
        (playerToSwitchWith.Rotation, player.Rotation) = (player.Rotation, playerToSwitchWith.Rotation);
        (playerToSwitchWith.LookRotation, player.LookRotation) = (player.LookRotation, playerToSwitchWith.LookRotation);

        EventHandlers.PushUserMessage(player, $"Die Münze tauscht deine Position mit {playerToSwitchWith.Nickname}...");
        EventHandlers.PushUserMessage(playerToSwitchWith,
            $"{player.Nickname} wirft eine Münze und tauscht seine Position mit dir!");
    }
}