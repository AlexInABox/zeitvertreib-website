using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Features.Wrappers;
using Newtonsoft.Json;
using UnityEngine;
using UserSettings.ServerSpecific;
using Zeitvertreib.Types;
using Logger = LabApi.Features.Console.Logger;
using Player = LabApi.Features.Wrappers.Player;

namespace Sprayed;

public static class Utils
{
    // Ignored layers
    private const int IgnoredLayers = (1 << 1) | // TransparentFX
                                      (1 << 8) | // Player
                                      (1 << 13) | // Hitbox
                                      (1 << 16) | // InvisibleCollider
                                      (1 << 17) | // Ragdoll
                                      (1 << 18) | // CCTV
                                      (1 << 27) | // Door
                                      (1 << 28) | // Skybox
                                      (1 << 29); // Fence

    public const int LayerMask = ~IgnoredLayers;

    public const float LineSpacing = 0.0102f;
    public const float OptimizedLineSpacing = 0.2066f;

    // Tracking
    public static readonly Dictionary<int, int> Cooldowns = new();

    // Store spray data per userid: List of (sprayId, sprayName) tuples
    public static readonly ConcurrentDictionary<string, List<(int id, string name)>> UserSprayIds = new();

    // Store full spray data: Dictionary<userid, Dictionary<sprayId, sprayLines>>
    public static readonly ConcurrentDictionary<string, Dictionary<int, string[]>> UserSprayData = new();
    public static readonly ConcurrentDictionary<string, Dictionary<int, string[]>> UserOptimizedSprayData = new();

    // Dictionary<playerId, Dictionary<sprayId, List<TextToy>>>
    public static readonly Dictionary<int, Dictionary<int, List<TextToy>>> ActiveSprays = new();

    // Networking
    private static readonly HttpClient HttpClient = new();

    // Multi-user fetch - fetch spray IDs and names for all players
    public static async Task SetSpraysForAllUsersFromBackend()
    {
        Config config = Plugin.Instance.Config!;
        Player[] players = Player.ReadyList.Where(p => !p.IsDummy && !p.IsHost).ToArray();
        if (players.Length == 0) return;

        try
        {
            // Fetch spray metadata (ids and names only, no full_res or text_toy)
            string useridsQuery = string.Join("&", players.Select(p => $"userids={Uri.EscapeDataString(p.UserId)}"));
            string sprayEndpoint = $"{config.BackendURL}/spray?{useridsQuery}";

            Logger.Debug($"Fetching spray metadata from: {sprayEndpoint}", config.Debug);

            using HttpRequestMessage request = new(HttpMethod.Get, sprayEndpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.BackendAPIToken);

            HttpResponseMessage response = await HttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                Logger.Debug($"Failed to fetch sprays. Status: {response.StatusCode}", config.Debug);
                return;
            }

            string responseText = await response.Content.ReadAsStringAsync();
            SprayGetResponseItem sprayResponse = JsonConvert.DeserializeObject<SprayGetResponseItem>(responseText)!;

            // Group sprays by userid
            Dictionary<string, List<(int id, string name)>> newSprayIds = new();

            if (sprayResponse?.Sprays != null && sprayResponse.Sprays.Capacity > 0)
                foreach (Spray spray in sprayResponse.Sprays)
                {
                    if (!newSprayIds.ContainsKey(spray.Userid))
                        newSprayIds[spray.Userid] = [];

                    newSprayIds[spray.Userid].Add(((int)spray.Id, spray.Name));
                }
            else
                Logger.Debug("No sprays returned from backend", config.Debug);

            // Check for changes after building the complete list
            List<string> changedUserids = new();
            foreach (KeyValuePair<string, List<(int id, string name)>> kvp in newSprayIds)
            {
                // Sort by id and keep lowest as default
                List<(int id, string name)> sorted = kvp.Value.OrderBy(x => x.id).ToList();

                // Check if this user's spray list changed
                bool changed = !UserSprayIds.TryGetValue(kvp.Key, out List<(int id, string name)> existing) ||
                               !existing.SequenceEqual(sorted);

                if (changed)
                    changedUserids.Add(kvp.Key);

                UserSprayIds[kvp.Key] = sorted;
                Logger.Debug(
                    $"Updated spray IDs for {kvp.Key}: {string.Join(", ", sorted.Select(x => $"{x.name}({x.id})"))}",
                    config.Debug);
            }

            // Clear spray data for users who now have no sprays
            // Collect all users that were previously tracked
            HashSet<string> previouslyTrackedUsers = new(UserSprayIds.Keys);
            previouslyTrackedUsers.UnionWith(UserSprayData.Keys);
            previouslyTrackedUsers.UnionWith(UserOptimizedSprayData.Keys);

            Logger.Debug($"Previously tracked users: {string.Join(", ", previouslyTrackedUsers)}", config.Debug);
            Logger.Debug($"Users with sprays in response: {string.Join(", ", newSprayIds.Keys)}", config.Debug);

            // Remove users that are no longer in the response
            List<string> useridsWithSprays = newSprayIds.Keys.ToList();
            List<string> usersToClean = previouslyTrackedUsers.Where(u => !useridsWithSprays.Contains(u)).ToList();

            Logger.Debug($"Users to clean: {string.Join(", ", usersToClean)}", config.Debug);

            foreach (string userid in usersToClean)
            {
                bool removedFromIds = UserSprayIds.TryRemove(userid, out _);
                bool removedFromData = UserSprayData.TryRemove(userid, out _);
                bool removedFromOptimized = UserOptimizedSprayData.TryRemove(userid, out _);
                Logger.Debug(
                    $"Cleared spray data for {userid} - IDs: {removedFromIds}, Data: {removedFromData}, Optimized: {removedFromOptimized}",
                    config.Debug);
            }

            Logger.Debug($"After cleanup - UserSprayIds keys: {string.Join(", ", UserSprayIds.Keys)}", config.Debug);
            Logger.Debug($"After cleanup - UserSprayData keys: {string.Join(", ", UserSprayData.Keys)}", config.Debug);
            Logger.Debug(
                $"After cleanup - UserOptimizedSprayData keys: {string.Join(", ", UserOptimizedSprayData.Keys)}",
                config.Debug);

            if (changedUserids.Count == 0) return;

            // Fetch full spray data for changed users (text_toy only, no full_res)
            string changedQuery = string.Join("&", changedUserids.Select(u => $"userids={Uri.EscapeDataString(u)}"));
            string fullSprayEndpoint = $"{config.BackendURL}/spray?{changedQuery}&text_toy=true";

            Logger.Debug($"Fetching full spray data from: {fullSprayEndpoint}", config.Debug);

            using HttpRequestMessage fullRequest = new(HttpMethod.Get, fullSprayEndpoint);
            fullRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.BackendAPIToken);

            HttpResponseMessage fullResponse = await HttpClient.SendAsync(fullRequest);
            if (!fullResponse.IsSuccessStatusCode)
            {
                Logger.Debug($"Failed to fetch full sprays. Status: {fullResponse.StatusCode}", config.Debug);
                return;
            }

            string fullResponseText = await fullResponse.Content.ReadAsStringAsync();
            SprayGetResponseItem fullSprayResponse =
                JsonConvert.DeserializeObject<SprayGetResponseItem>(fullResponseText)!;

            if (fullSprayResponse?.Sprays == null) return;

            // Store spray data by userid and spray id
            foreach (Spray spray in fullSprayResponse.Sprays)
            {
                if (!UserSprayData.ContainsKey(spray.Userid))
                {
                    UserSprayData[spray.Userid] = new Dictionary<int, string[]>();
                    UserOptimizedSprayData[spray.Userid] = new Dictionary<int, string[]>();
                }

                if (spray.TextToy != null)
                {
                    string[] sprayLines = ConvertSprayTextToSpray(spray.TextToy);
                    UserSprayData[spray.Userid][(int)spray.Id] = sprayLines;
                    UserOptimizedSprayData[spray.Userid][(int)spray.Id] = ConvertSprayToOptimizedSpray(sprayLines);
                }

                Logger.Debug(
                    $"Stored spray data for {spray.Userid} - spray {spray.Id} ({spray.Name})",
                    config.Debug);
            }

            // Clear existing sprays for users whose spray data changed
            foreach (string userid in changedUserids)
                if (Player.TryGet(userid, out Player player))
                    player.ClearAllExistingSpray();
        }
        catch (Exception ex)
        {
            Logger.Error($"Exception while fetching sprays: {ex}");
        }
    }

    private static string[] ConvertSprayTextToSpray(string sprayText)
    {
        string[] split = sprayText.Split(['\n'], StringSplitOptions.None);
        if (split.Length > 100)
            split = split.Take(100).ToArray();
        else if (split.Length < 100)
            split = split.Concat(Enumerable.Repeat("", 100 - split.Length)).ToArray();
        return split;
    }

    private static string[] ConvertSprayToOptimizedSpray(string[] spray)
    {
        string[] optimized = new string[6];
        for (int i = 0; i < 6; i++)
            optimized[i] = string.Join("\n", spray.Skip(i * 20).Take(20));
        return optimized;
    }

    public static void ClearExistingSpray(this Player player, int sprayId)
    {
        if (!ActiveSprays.TryGetValue(player.PlayerId, out Dictionary<int, List<TextToy>> sprays)) return;
        if (!sprays.TryGetValue(sprayId, out List<TextToy> textToys)) return;

        foreach (TextToy textToy in textToys.Where(textToy => !textToy.IsDestroyed))
            textToy.Destroy();

        sprays.Remove(sprayId);
        if (sprays.Count == 0)
            ActiveSprays.Remove(player.PlayerId);
    }

    private static void ClearAllExistingSpray(this Player player)
    {
        if (!ActiveSprays.TryGetValue(player.PlayerId, out Dictionary<int, List<TextToy>> sprays)) return;

        // Create a copy of keys to avoid modifying collection while iterating
        foreach (int spraysKey in sprays.Keys.ToList())
        {
            List<TextToy> textToys = sprays[spraysKey];
            foreach (TextToy textToy in textToys.Where(textToy => !textToy.IsDestroyed))
                textToy.Destroy();

            sprays.Remove(spraysKey);
        }

        ActiveSprays.Remove(player.PlayerId);
    }

    public static bool IsOnSprayCooldown(this Player player)
    {
        if (!Cooldowns.TryGetValue(player.PlayerId, out int cooldownEnd)) return false;
        return !(cooldownEnd <= Time.time);
    }

    public static void RegisterHud(this Player player)
    {
        PlayerDisplay playerDisplay = PlayerDisplay.Get(player);

        Hint sprayListHint = new()
        {
            Alignment = HintAlignment.Left,
            AutoText = _ =>
            {
                string hint = string.Empty;
                if (!UserSprayIds.TryGetValue(player.UserId, out List<(int id, string name)> sprays) ||
                    sprays.Count == 0)
                    return hint;

                bool hudDisabled = ServerSpecificSettingsSync.GetSettingOfUser<SSTwoButtonsSetting>(
                    player.ReferenceHub,
                    Plugin.Instance.Config!.SprayHudToogleSettingId).SyncIsB;

                if (hudDisabled) return hint;

                int selectedSprayId = ServerSpecificSettingsSync.GetSettingOfUser<SSDropdownSetting>(
                    player.ReferenceHub,
                    Plugin.Instance.Config!.SpraySelectionSettingId).SyncSelectionIndexRaw;

                int cooldownSeconds = 0;
                if (Cooldowns.TryGetValue(player.PlayerId, out int cooldownEnd))
                    if (cooldownEnd > Time.time)
                        cooldownSeconds = Mathf.CeilToInt(cooldownEnd - Time.time);


                hint += "<size=20><b><color=#F4F1BB>=== Sprays ===</color></b></size>\n";
                for (int i = 0; i < sprays.Count; i++)
                {
                    (int id, string name) = sprays[i];
                    if (i == selectedSprayId)
                    {
                        if (cooldownSeconds > 0)
                            hint +=
                                $"<size=18><color=#ff8e00>> {name} <b>({cooldownSeconds}s)</b></color></size>\n";
                        else
                            hint += $"<size=18><color=#00FF00>> {name}</color></size>\n";
                    }

                    else
                    {
                        hint += $"<size=18>{name}</size>\n";
                    }
                }

                return hint;
            },
            YCoordinateAlign = HintVerticalAlign.Bottom,
            YCoordinate = 960,
            XCoordinate = (int)(-540f * player.ReferenceHub.aspectRatioSync.AspectRatio + 600f) + 50,
            SyncSpeed = HintSyncSpeed.Normal
        };
        playerDisplay.AddHint(sprayListHint);
    }
}