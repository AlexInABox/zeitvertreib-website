#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using MEC;
using Newtonsoft.Json.Linq;

namespace zvupdater;

public static class EventHandlers
{
    private static CoroutineHandle _coroutineHandle;

    public static void RegisterEvents()
    {
        _coroutineHandle = Timing.RunCoroutine(MainLoop());
    }

    public static void UnregisterEvents()
    {
        Timing.KillCoroutines(_coroutineHandle);
    }

    private static IEnumerator<float> MainLoop()
    {
        using HttpClient client = new();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("zvupdater");

        // Add GitHub token if available
        if (!string.IsNullOrEmpty(Plugin.Instance.Config!.GitHubToken))
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("token", Plugin.Instance.Config.GitHubToken);

        while (true)
        {
            yield return Timing.WaitForSeconds(150f);

            try
            {
                string json = client
                    .GetStringAsync("https://api.github.com/repos/AlexInABox/zeitvertreib-website/releases")
                    .GetAwaiter()
                    .GetResult();

                JArray releases = JArray.Parse(json);

                JObject latestRelease = (JObject)releases
                    .OrderByDescending(r => int.Parse(((string)r["tag_name"]!).Substring(6)))
                    .First();

                int newestBuild = int.Parse(((string)latestRelease["tag_name"]!).Substring(6));

                if (newestBuild > Plugin.Instance.Config!.CurrentlyInstalledBuild)
                {
                    const string pluginDir = "/home/container/.config/SCP Secret Laboratory/LabAPI/plugins/global";

                    foreach (JToken? jToken in latestRelease["assets"]!)
                    {
                        JObject? asset = (JObject)jToken;
                        string? name = (string?)asset["name"];
                        string? downloadUrl = (string?)asset["browser_download_url"];

                        if (name == null || downloadUrl == null || !name.EndsWith(".dll"))
                            continue;

                        byte[] data = client
                            .GetByteArrayAsync(downloadUrl)
                            .GetAwaiter()
                            .GetResult();

                        File.WriteAllBytes(Path.Combine(pluginDir, name), data);

                        Logger.Info($"Downloaded updated plugin: {name}");
                    }

                    ServerStatic.StopNextRound = ServerStatic.NextRoundAction.Restart;
                    Plugin.Instance.Config!.CurrentlyInstalledBuild = newestBuild;
                    Plugin.Instance.SaveConfig();

                    if (Player.ReadyList.Count(p => p.IsPlayer) == 0)
                    {
                        Logger.Info("No players online, restarting server immediately.");
                        Server.Restart();
                        continue;
                    }

                    foreach (Player player in Player.ReadyList.Where(p => p.IsPlayer))
                    {
                        player.ClearBroadcasts();
                        player.SendBroadcast(
                            "<size=40><color=#FFAA00><b>⚠ Zeitvertreib Update empfangen ⚠</b></color></size>\n" +
                            "<size=30><color=#FFFFFF>Der Server wird <b>nach der Runde</b> automatisch neugestartet.</color></size>",
                            30
                        );
                    }
                }
            }
            catch (Exception e)
            {
                Logger.Error("Failed to check for updates: " + e.Message);
            }
        }
    }
}