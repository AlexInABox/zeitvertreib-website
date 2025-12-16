using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using CommandSystem;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using PlayerRoles;
using Zeitvertreib.Types;

namespace Swapped.Commands;

[CommandHandler(typeof(ClientCommandHandler))]
public class Swap : ICommand
{
    public string Command => "swap";
    public string[] Aliases => [];
    public string Description => "Wechsle zu einer anderen SCP-Rolle!";

    public bool Execute(ArraySegment<string> arguments, ICommandSender sender, out string response)
    {
        if (!Plugin.Instance.SwapEnabled)
        {
            response = "Du kannst deine Rolle nur in den ersten 40 Sekunden der Runde wechseln!";
            return false;
        }

        if (sender == null)
        {
            response = "Nur Spieler können diesen Befehl verwenden.";
            return false;
        }

        Player player = Player.Get(sender);
        if (player == null)
        {
            response = "Spieler nicht gefunden.";
            return false;
        }

        if (arguments.Count < 1)
        {
            response = "Bitte gib eine SCP-Nummer an, z. B.: \".swap 173\"";
            return false;
        }

        if (!Plugin.Instance.PlayersThatCanUseSwap.Contains(player))
        {
            response = "Du bist kein SCP und kannst daher deine Rolle nicht wechseln!";
            return false;
        }

        string arg = arguments.Array?[1] ?? string.Empty;
        response = "";

        if (arg.Contains("173"))
        {
            _ = SwapPlayerToScp(player, RoleTypeId.Scp173);
            return true;
        }

        if (arg.Contains("939"))
        {
            _ = SwapPlayerToScp(player, RoleTypeId.Scp939);
            return true;
        }

        if (arg.Contains("079"))
        {
            _ = SwapPlayerToScp(player, RoleTypeId.Scp079);
            return true;
        }

        if (arg.Contains("049"))
        {
            _ = SwapPlayerToScp(player, RoleTypeId.Scp049);
            return true;
        }

        if (arg.Contains("096"))
        {
            _ = SwapPlayerToScp(player, RoleTypeId.Scp096);
            return true;
        }

        if (arg.Contains("106"))
        {
            _ = SwapPlayerToScp(player, RoleTypeId.Scp106);
            return true;
        }

        if (arg.Contains("3114"))
        {
            _ = SwapPlayerToScp(player, RoleTypeId.Scp3114);
            return true;
        }

        response = "Bitte gib eine gültige SCP-Rolle an!";
        return false;
    }

    private static async Task SwapPlayerToScp(Player player, RoleTypeId role)
    {
        if (player.Role == role)
        {
            player.SendConsoleMessage($"Du bist bereits {role}!", "red");
            return;
        }

        if (!Plugin.Instance.AvailableScps.Contains(role))
        {
            player.SendConsoleMessage($"Die Rolle {role} ist bereits belegt oder nicht verfügbar.", "red");
            return;
        }

        // Remove role from swappable pool while the request is loading
        Plugin.Instance.AvailableScps = Plugin.Instance.AvailableScps
            .Where(r => r != role)
            .ToArray();

        //Remove player from being able to resubmit a swap request
        Plugin.Instance.PlayersThatCanUseSwap =
            Plugin.Instance.PlayersThatCanUseSwap.Where(p => p != player).ToArray();


        try
        {
            string url = $"{Plugin.Instance.Config!.EndpointUrl}/swapped/";
            Logger.Debug($"Sende Swap-POST-Anfrage an: {url}");

            SwappedRequest request = new SwappedRequest
            {
                Userid = player.UserId,
                Price = Plugin.Instance.RoleCosts[role],
            };
            string jsonBody = request.ToJson();

            using HttpClient client = new();
            client.DefaultRequestHeaders.Add("Authorization", "Bearer " + Plugin.Instance.Config!.ApiKey);
            StringContent content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
            HttpResponseMessage response = await client.PostAsync(url, content);

            if (response.StatusCode != HttpStatusCode.OK)
            {
                Logger.Debug(
                    $"Swap-Anfrage für {player.Nickname} fehlgeschlagen (Statuscode: {response.StatusCode})");

                //Reset original state
                Plugin.Instance.AvailableScps = Plugin.Instance.AvailableScps
                    .Append(role)
                    .ToArray();
                Plugin.Instance.PlayersThatCanUseSwap = Plugin.Instance.PlayersThatCanUseSwap
                    .Append(player)
                    .ToArray();

                player.SendConsoleMessage("Du hast nicht genug ZVC, um deine Rolle zu wechseln!", "red");
                return;
            }

            Logger.Info("Swap-Anfrage erfolgreich (200 OK).");
        }
        catch (Exception ex)
        {
            Logger.Error($"Fehler beim Senden der Swap-Anfrage für {player.Nickname} ({player.UserId}): {ex}");

            // Reset original state
            Plugin.Instance.AvailableScps = Plugin.Instance.AvailableScps
                .Append(role)
                .ToArray();
            Plugin.Instance.PlayersThatCanUseSwap = Plugin.Instance.PlayersThatCanUseSwap
                .Append(player)
                .ToArray();


            player.SendConsoleMessage(
                "Ein unerwarteter Fehler ist aufgetreten! Bitte versuche es in der nächsten Runde erneut.",
                "red");
            return;
        }


        player.SendConsoleMessage($"Rolle erfolgreich gewechselt! -{Plugin.Instance.RoleCosts[role]} ZVC");
        player.Role = role;
    }
}