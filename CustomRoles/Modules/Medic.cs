using System.Collections.Generic;
using LabApi.Features.Wrappers;
using MEC;
using UncomplicatedCustomRoles.API.Features.CustomModules;
using UnityEngine;
using Player = LabApi.Features.Wrappers.Player;

namespace CustomRoles.Modules;

// ReSharper disable once ClassNeverInstantiated.Global
public class Medic : CustomModule
{
    private bool _abilityActive;

    public override void Execute()
    {
        CustomRole.Player.SendHint(Plugin.Instance.Translation.AbilityUsed, 1.5f);
        Timing.RunCoroutine(HealNearbyAlliesOverTime());
        Timing.RunCoroutine(ShowHealingBubble());
    }

    private IEnumerator<float> HealNearbyAlliesOverTime()
    {
        _abilityActive = true;
        const float HEAL_AMOUNT_MAX = 80f;
        const float HEAL_DURATION = 10f;

        for (int i = 0; i < HEAL_AMOUNT_MAX; i++)
        {
            HealNearbyAllies(HEAL_AMOUNT_MAX, HEAL_DURATION);
            yield return Timing.WaitForSeconds(HEAL_DURATION / HEAL_AMOUNT_MAX);
        }

        _abilityActive = false;
    }

    private void HealNearbyAllies(float healAmountMax, float healDuration)
    {
        if (!CustomRole.Player.IsAlive) return;
        Collider[] hitColliders = Physics.OverlapSphere(CustomRole.Player.Position, 8f);

        foreach (Collider collider in hitColliders)
        {
            if (!Player.TryGet(collider.gameObject, out Player nearbyPlayer)) continue;
            if (nearbyPlayer.Faction != CustomRole.Player.Faction) continue;

            nearbyPlayer.Heal(1F);

            if (nearbyPlayer == CustomRole.Player) continue;
            nearbyPlayer.SendHint($"<color=green>Du wirst gerade von {CustomRole.Player.Nickname} geheilt!</color>",
                healAmountMax / healDuration + 1f);
        }

        CustomRole.Player.Heal(1f);
    }

    private IEnumerator<float> ShowHealingBubble()
    {
        if (CustomRole.Player.GameObject == null) yield break;

        LightSourceToy bubbleLight = LightSourceToy.Create(CustomRole.Player.GameObject.transform);
        bubbleLight.Color = Color.green;
        bubbleLight.Range = 10f;
        bubbleLight.ShadowType = LightShadows.None;
        bubbleLight.ShadowStrength = 0f;

        while (_abilityActive)
            yield return Timing.WaitForSeconds(1f);

        bubbleLight.Destroy();
    }
}