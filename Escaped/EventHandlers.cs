using System.Collections.Generic;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using PlayerRoles;
using UnityEngine;

namespace Escaped;

public static class EventHandlers
{
    public static void RegisterEvents()
    {
        ServerEvents.MapGenerated += _ =>
        {
            Bounds escapeBounds = Map.DefaultEscapeZone;

            GameObject triggerObject = new("BoundsTrigger")
            {
                transform =
                {
                    position = escapeBounds.center
                }
            };

            BoxCollider box = triggerObject.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.size = escapeBounds.size;

            triggerObject.AddComponent<EscapedTriggerListener>();
        };
    }

    public static void UnregisterEvents()
    {
    }
}

public class EscapedTriggerListener : MonoBehaviour
{
    private static readonly Dictionary<RoleTypeId, RoleTypeId> ConvertList = new()
    {
        { RoleTypeId.NtfCaptain, RoleTypeId.ChaosRepressor },
        { RoleTypeId.NtfSergeant, RoleTypeId.ChaosRifleman },
        { RoleTypeId.NtfSpecialist, RoleTypeId.ChaosMarauder },
        { RoleTypeId.NtfPrivate, RoleTypeId.ChaosConscript },
        { RoleTypeId.FacilityGuard, RoleTypeId.ChaosConscript }
    };

    private void OnTriggerEnter(Collider other)
    {
        if (!Player.TryGet(other.gameObject, out Player player)) return;
        if (!player.IsDisarmed) return;

        foreach (KeyValuePair<RoleTypeId, RoleTypeId> kv in ConvertList)
        {
            if (kv.Key == player.Role)
            {
                player.SetRole(kv.Value, RoleChangeReason.Escaped);
                break;
            }

            if (kv.Value == player.Role)
            {
                player.SetRole(kv.Key, RoleChangeReason.Escaped);
                break;
            }
        }
    }
}