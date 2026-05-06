using LabApi.Features.Wrappers;
using UnityEngine;

namespace Flipped.Events;

public class BallParty : IEvent
{
    private const int BallCount = 5;

    public EventType EventType { get; } = EventType.Bad;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        for (int i = 0; i < BallCount; i++) TimedGrenadeProjectile.SpawnActive(player.Position, ItemType.SCP018, player);

        EventHandlers.PushUserMessage(player, "Die Münze lädt eine Ballparty ein... direkt bei dir!");
    }
}