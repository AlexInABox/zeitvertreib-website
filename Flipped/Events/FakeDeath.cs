using CustomPlayerEffects;
using LabApi.Features.Wrappers;
using PlayerStatsSystem;

namespace Flipped.Events;

public class FakeDeath : IEvent
{
    private const float Duration = 30f;

    public EventType EventType { get; } = EventType.Heavenly;

    public bool CanRun(Player player)
    {
        return true;
    }

    public void Run(Player player)
    {
        Ragdoll.SpawnRagdoll(player, new UniversalDamageHandler(0f, DeathTranslations.Falldown));

        player.EnableEffect<Invisible>(1, Duration);
        player.EnableEffect<SilentWalk>(10, Duration); // 10 = 100% footstep reduction

        EventHandlers.PushUserMessage(player, "Die Münze lässt dich tot erscheinen! Nutz die Chance!");
    }
}
