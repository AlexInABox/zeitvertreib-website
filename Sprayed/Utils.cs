using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using Newtonsoft.Json;
using System.Threading.Tasks;
using LabApi.Features.Wrappers;
using UnityEngine;
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
    
    public static readonly Dictionary<int, List<TextToy>> ActiveSprays = new();

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

            if (sprayResponse?.Sprays == null || sprayResponse.Sprays.Capacity == 0)
            {
                Logger.Debug("No sprays returned from backend", config.Debug);
                return;
            }

            // Group sprays by userid and check for changes
            Dictionary<string, List<(int id, string name)>> newSprayIds = new();
            List<string> changedUserids = new();

            foreach (Spray spray in sprayResponse.Sprays)
            {
                if (!newSprayIds.ContainsKey(spray.Userid))
                    newSprayIds[spray.Userid] = [];

                newSprayIds[spray.Userid].Add(((int)spray.Id, spray.Name));

                // Check if this Userid's spray list changed
                bool changed = !UserSprayIds.TryGetValue(spray.Userid, out List<(int id, string name)> existing) ||
                               !existing.SequenceEqual(newSprayIds[spray.Userid]);

                if (changed && !changedUserids.Contains(spray.Userid))
                    changedUserids.Add(spray.Userid);
            }

            // Update spray IDs for all users
            foreach (KeyValuePair<string, List<(int id, string name)>> kvp in newSprayIds)
            {
                // Sort by id and keep lowest as default
                List<(int id, string name)> sorted = kvp.Value.OrderBy(x => x.id).ToList();
                UserSprayIds[kvp.Key] = sorted;
                Logger.Debug($"Updated spray IDs for {kvp.Key}: {string.Join(", ", sorted.Select(x => $"{x.name}({x.id})"))}",
                    config.Debug);
            }

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
            SprayGetResponseItem fullSprayResponse = JsonConvert.DeserializeObject<SprayGetResponseItem>(fullResponseText)!;

            if (fullSprayResponse?.Sprays == null) return;

            // Store spray data by userid and spray id
            foreach (Spray spray in fullSprayResponse.Sprays)
            {
                if (!UserSprayData.ContainsKey(spray.Userid))
                {
                    UserSprayData[spray.Userid] = new();
                    UserOptimizedSprayData[spray.Userid] = new();
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

            if (changedUserids.Count > 0 && Player.TryGet(changedUserids[0], out Player player))
                player.SendHint(Plugin.Instance.Translation.SpraysRefreshed, 10f);
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

    public static void ClearExistingSpray(this Player player)
    {
        if (!ActiveSprays.TryGetValue(player.PlayerId, out List<TextToy> textToys)) return;
        foreach (TextToy textToy in textToys.Where(textToy => !textToy.IsDestroyed))
            textToy.Destroy();
        ActiveSprays.Remove(player.PlayerId);
    }

    public static bool IsOnSprayCooldown(this Player player)
    {
        if (!Cooldowns.TryGetValue(player.PlayerId, out int cooldownEnd)) return false;
        if (cooldownEnd <= Time.time) return false;

        float remaining = Mathf.Round((cooldownEnd - Time.time) * 10f) / 10f;
        string message = Plugin.Instance.Translation.AbilityOnCooldown.Replace("{remaining}", $"{remaining}");
        player.SendHint(message);
        return true;
    }
}