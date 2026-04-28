using System.Collections.Generic;
using System.Linq;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;
using UnityEngine;

namespace Flipped.Events;

public class SwapRole : IEvent
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
            EventHandlers.PushUserMessage(player, "Die Münze wollte deine Rolle tauschen, aber es gibt niemanden!");
            return;
        }

        Player other = candidates[EventHandlers.Random.Next(candidates.Count)];

        RoleTypeId playerRole = player.Role;
        RoleTypeId otherRole = other.Role;
        Vector3 playerPos = player.Position;
        Vector3 otherPos = other.Position;

        player.SetRole(otherRole, RoleChangeReason.RemoteAdmin, RoleSpawnFlags.None);
        other.SetRole(playerRole, RoleChangeReason.RemoteAdmin, RoleSpawnFlags.None);

        // Restore positions after role change settles
        Timing.CallDelayed(0.1f, () =>
        {
            player.Position = playerPos;
            other.Position = otherPos;
        });

        EventHandlers.PushUserMessage(player, $"Die Münze tauscht deine Rolle mit {other.Nickname}!");
        EventHandlers.PushUserMessage(other, $"{player.Nickname} wirft eine Münze und tauscht deine Rolle mit seiner!");
    }
}
