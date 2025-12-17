using System.Linq;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Events.Handlers;
using LabApi.Features.Wrappers;
using MEC;
using PlayerRoles;

namespace Swapped;

public static class EventHandlers
{
    public static void RegisterEvents()
    {
        ServerEvents.RoundStarted += OnRoundStarted;


        // Feel free to add more event registrations here
    }

    public static void UnregisterEvents()
    {
        ServerEvents.RoundStarted -= OnRoundStarted;
    }

    private static void OnRoundStarted()
    {
        Timing.CallDelayed(1f, () =>
        {
            Player[] listOfScps = Player.ReadyList
                .Where(p => p.IsAlive && !p.IsHost && p.IsSCP).ToArray();

            Plugin.Instance.PlayersThatCanUseSwap = listOfScps;

            Plugin.Instance.AvailableScps = new[]
                {
                    RoleTypeId.Scp049, RoleTypeId.Scp079, RoleTypeId.Scp096,
                    RoleTypeId.Scp106, RoleTypeId.Scp173, RoleTypeId.Scp939, RoleTypeId.Scp3114
                }
                .Except(listOfScps.Select(p => p.Role))
                .ToArray();

            if (listOfScps.Length == 0)
                Plugin.Instance.AvailableScps = Plugin.Instance.AvailableScps
                    .Where(r => r != RoleTypeId.Scp079)
                    .ToArray();


            if (Plugin.Instance.AvailableScps.Length == 0)
                return;


            foreach (Player player in listOfScps)
            {
                string hintText =
                    "<align=left><color=#ff5555>Du bist ein SCP</color> und kannst deine aktuelle Rolle (<color=#ffff55>"
                    + player.Role + "</color>) <color=#55ff55>TAUSCHEN</color>!\n" +
                    "Öffne dazu die Konsole (Taste <color=#aaaaff>ö</color>) und schreibe <color=#55ffff>\".swap {scpnummer}\"</color>.\n" +
                    "Dieser Vorgang kostet wertvolle <color=#ffaa00>Zeitvertreib Punkte (ZVC)</color>, abhängig von der Rolle, die du wählst!\n\n" +
                    "<b>Verfügbare Rollen & Kosten:</b>\n";

                foreach (RoleTypeId role in Plugin.Instance.AvailableScps)
                    if (Plugin.Instance.RoleCosts.TryGetValue(role, out int cost))
                        hintText += $"<color=#ff5555>{role}</color> -> <color=#ffaa00>{cost} ZVC</color>\n";

                Hint hint = new()
                {
                    Alignment = HintAlignment.Left,
                    Text = hintText,
                    YCoordinateAlign = HintVerticalAlign.Top,
                    YCoordinate = 200,
                    XCoordinate = (int)(-540f * player.ReferenceHub.aspectRatioSync.AspectRatio + 600f) + 50,
                    SyncSpeed = HintSyncSpeed.UnSync,
                    Id = "swapped"
                };
                PlayerDisplay playerDisplay = PlayerDisplay.Get(player);
                playerDisplay.AddHint(hint);

                Timing.CallDelayed(35f, () => { playerDisplay.RemoveHint("swapped"); });
            }

            Plugin.Instance.SwapEnabled = true;
            Timing.CallDelayed(40f, () => { Plugin.Instance.SwapEnabled = false; });
        });
    }
}