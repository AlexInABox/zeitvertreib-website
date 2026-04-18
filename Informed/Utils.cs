using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using TMPro;
using UserSettings.ServerSpecific;

namespace Informed;

public static class Utils
{
    public static async void SendHeaderToPlayer(PlayerJoinedEventArgs ev)
    {
        ServerSpecificSettingBase[] extra;
        string loginSecret = await ev.Player.GetLoginSecret();

        if (loginSecret == string.Empty)
            extra =
            [
                new SSTextArea(Plugin.Instance.Config!.Id,
                    "<size=250%><color=#E6D9F8><b>Das ist <color=#B562F8>Z</color><color=#B86BF8>e</color><color=#BB74F8>i</color><color=#BE7DF8>t</color><color=#C186F8>v</color><color=#C48FF8>e</color><color=#C798F8>r</color><color=#CAA1F8>t</color><color=#CDAAF8>r</color><color=#D0B3F8>e</color><color=#D3BCF8>i</color><color=#D6C5F8>b</color>!</b></color></size>\n" +
                    "<color=#CBB5F8>Hier ist dein </color><link=\"https://zeitvertreib.vip/dashboard\"><size=130%><color=#9A6BFA><b>--><mark=#E6D9F811><u>LOGIN BUTTON</u></mark><--</b></color></size></link><color=#CBB5F8> für unsere Website:</color>\n\n" +
                    "<size=120%><b><color=#E6D9F8>Auf unserer Website kannst du:</color></b></size>\n" +
                    "<color=#CBB5F8>- ein eigenes <b>Spray</b> erstellen</color>\n" +
                    "<color=#CBB5F8>- deinen <b>Coin-Stand</b> ansehen</color>\n" +
                    "<color=#CBB5F8>- Coins für <b>Perks</b> einlösen</color>\n" +
                    "<color=#CBB5F8>- deine <b>Stats</b> verfolgen</color>\n" +
                    "<color=#CBB5F8>- vieles <b>mehr</b> entdecken</color>\n\n" +
                    $"<size=95%><color=#E6D9F8><b>Hallo</b> <color=#9A6BFA>{ev.Player.Nickname}</color><b>, willkommen auf dem Server!</b></color></size>\n" +
                    "<size=85%><color=#CBB5F8>Hier unten kannst du <b>Keybinds</b> für alle <b>Zeitvertreib Features</b> einstellen.</color></size>",
                    SSTextArea.FoldoutMode.NotCollapsable, null, TextAlignmentOptions.Center)
            ];
        else
            extra =
            [
                new SSTextArea(Plugin.Instance.Config!.Id,
                    "<size=250%><color=#E6D9F8><b>Das ist <color=#B562F8>Z</color><color=#B86BF8>e</color><color=#BB74F8>i</color><color=#BE7DF8>t</color><color=#C186F8>v</color><color=#C48FF8>e</color><color=#C798F8>r</color><color=#CAA1F8>t</color><color=#CDAAF8>r</color><color=#D0B3F8>e</color><color=#D3BCF8>i</color><color=#D6C5F8>b</color>!</b></color></size>\n" +
                    $"<color=#CBB5F8>Hier ist dein </color><link=\"https://zeitvertreib.vip/dashboard?loginSecret={loginSecret}\"><size=130%><color=#9A6BFA><b>--><mark=#E6D9F811><u>LOGIN BUTTON</u></mark><--</b></color></size></link><color=#CBB5F8> für unsere Website:</color>\n\n" +
                    "<size=120%><b><color=#E6D9F8>Auf unserer Website kannst du:</color></b></size>\n" +
                    "<color=#CBB5F8>- ein eigenes <b>Spray</b> erstellen</color>\n" +
                    "<color=#CBB5F8>- deinen <b>Coin-Stand</b> ansehen</color>\n" +
                    "<color=#CBB5F8>- Coins für <b>Perks</b> einlösen</color>\n" +
                    "<color=#CBB5F8>- deine <b>Stats</b> verfolgen</color>\n" +
                    "<color=#CBB5F8>- vieles <b>mehr</b> entdecken</color>\n\n" +
                    $"<size=95%><color=#E6D9F8><b>Hallo</b> <color=#9A6BFA>{ev.Player.Nickname}</color><b>, willkommen auf dem Server!</b></color></size>\n" +
                    "<size=85%><color=#CBB5F8>Hier unten kannst du <b>Keybinds</b> für alle <b>Zeitvertreib Features</b> einstellen.</color></size>",
                    SSTextArea.FoldoutMode.NotCollapsable, null, TextAlignmentOptions.Center)
            ];

        ServerSpecificSettingBase[] existing = ServerSpecificSettingsSync.DefinedSettings ?? [];
        existing = Array.FindAll(existing,
            s => s.SettingId != Plugin.Instance.Config!.Id); //remove old headers if any

        ServerSpecificSettingBase[] combined = new ServerSpecificSettingBase[existing.Length + extra.Length];
        extra.CopyTo(combined, 0);
        existing.CopyTo(combined, extra.Length);

        ServerSpecificSettingsSync.DefinedSettings = combined;
        ServerSpecificSettingsSync.SendToPlayer(ev.Player.ReferenceHub);
    }


    /// <summary>
    ///     Gets the secret login url for a specific user from the backend.
    /// </summary>
    private static async Task<string> GetLoginSecret(this Player player)
    {
        try
        {
            Config config = Plugin.Instance.Config!;
            string endpoint = $"{config.BackendURL}/api/auth/generate-login-secret";

            Logger.Debug($"Fetching spray from endpoint: {endpoint}", Plugin.Instance.Config!.Debug);

            using HttpClient client = new();
            client.DefaultRequestHeaders.Add("Authorization", "Bearer " + config.APIKey);

            var body = new
            {
                steamId = player.UserId
            };

            StringContent content = new(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json");
            HttpResponseMessage response = await client.PostAsync(endpoint, content);

            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                JObject obj = JObject.Parse(json);
                return obj["secret"]?.ToString() ?? string.Empty;
            }

            return string.Empty;
        }
        catch (Exception ex)
        {
            Logger.Debug($"Exception while fetching spray for Player {player.Nickname}: {ex}",
                Plugin.Instance.Config!.Debug);
            return string.Empty;
        }
    }
}