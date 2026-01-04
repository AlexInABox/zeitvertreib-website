using System.Collections.Generic;
using LabApi.Features.Wrappers;
using MEC;
using UncomplicatedCustomRoles.API.Features.CustomModules;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;


namespace CustomRoles.Modules;

// ReSharper disable once ClassNeverInstantiated.Global
public class Deathsquad : CustomModule
{
    public override void Execute()
    {
        Timing.RunCoroutine(ShowAura());
    }

    private IEnumerator<float> ShowAura()
    {
        if (CustomRole.Player.GameObject == null) yield break;

        Logger.Info("Showing Deathsquad Aura");
        LightSourceToy auraLight = LightSourceToy.Create(CustomRole.Player.GameObject.transform);
        auraLight.Color = Color.blue;
        auraLight.Range = 3f;
        auraLight.Intensity = 0.8f;
        auraLight.ShadowType = LightShadows.None;
        auraLight.ShadowStrength = 0f;
        auraLight.GameObject.transform.SetParent(CustomRole.Player.GameObject.transform);

        while (CustomRole.Player.IsAlive) yield return Timing.WaitForSeconds(1f);
        auraLight.Destroy();
    }
}