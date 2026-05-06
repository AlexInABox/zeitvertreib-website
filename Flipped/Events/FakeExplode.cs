using CustomPlayerEffects;
using LabApi.Features.Wrappers;
using PlayerStatsSystem;
using UnityEngine;

namespace Flipped.Events;

public class FakeExplode : IEvent
{
    private const float Duration = 30f;

    public EventType EventType { get; } = EventType.Heavenly;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        Vector3 position = player.Position;

        Ragdoll.SpawnRagdoll(player, new UniversalDamageHandler(0f, DeathTranslations.Explosion));

        player.EnableEffect<Invisible>(1, Duration);
        player.EnableEffect<SilentWalk>(10, Duration);

        TimedGrenadeProjectile.PlayEffect(position, ItemType.GrenadeHE);

        EventHandlers.PushUserMessage(player, "Du scheinst explodiert zu sein... aber du lebst noch?!");
    }
}
