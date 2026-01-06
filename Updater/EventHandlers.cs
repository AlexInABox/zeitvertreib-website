#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using MEC;
using Newtonsoft.Json.Linq;

namespace Updater;

public static class EventHandlers
{
    private static CoroutineHandle _coroutineHandle;
    private static readonly HttpClient Client = new();
    private static volatile bool _isChecking;

    public static void RegisterEvents()
    {
        Client.DefaultRequestHeaders.UserAgent.ParseAdd("zvupdater");

        // Add GitHub token if available
        if (!string.IsNullOrEmpty(Plugin.Instance.Config!.GitHubToken))
            Client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("token", Plugin.Instance.Config.GitHubToken);

        _coroutineHandle = Timing.RunCoroutine(MainLoop());
    }

    public static void UnregisterEvents()
    {
        Timing.KillCoroutines(_coroutineHandle);
    }

    private static IEnumerator<float> MainLoop()
    {
        while (true)
        {
            yield return Timing.WaitForSeconds(60f);

            if (_isChecking)
                continue;

            // Run update check on background thread
            _ = Task.Run(async () =>
            {
                try
                {
                    await CheckForUpdatesAsync();
                }
                catch (Exception e)
                {
                    Logger.Error("Failed to check for updates: " + e.Message);
                }
            });
        }
    }

    private static async Task CheckForUpdatesAsync()
    {
        if (_isChecking) return;
        _isChecking = true;

        try
        {
            string json = await Client
                .GetStringAsync("https://api.github.com/repos/AlexInABox/zeitvertreib-website/releases");

            JArray releases = JArray.Parse(json);

            // Filter and parse releases with valid tag_name format (e.g., "build-123")
            JObject? latestRelease = releases
                .OfType<JObject>()
                .Select(r =>
                {
                    string? tagName = (string?)r["tag_name"];
                    if (tagName == null || tagName.Length <= 6 || !tagName.StartsWith("build-"))
                        return (Release: r, Build: (int?)null);
                    
                    if (int.TryParse(tagName.Substring(6), out int build))
                        return (Release: r, Build: (int?)build);
                    
                    return (Release: r, Build: (int?)null);
                })
                .Where(x => x.Build.HasValue)
                .OrderByDescending(x => x.Build!.Value)
                .Select(x => x.Release)
                .FirstOrDefault();

            if (latestRelease == null)
            {
                Logger.Debug("No valid releases found with parseable tag_name");
                return;
            }

            string latestTagName = (string)latestRelease["tag_name"]!;
            int newestBuild = int.Parse(latestTagName.Substring(6));

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

                    byte[] data = await Client.GetByteArrayAsync(downloadUrl);

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
                    return;
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
        finally
        {
            _isChecking = false;
        }
    }
}