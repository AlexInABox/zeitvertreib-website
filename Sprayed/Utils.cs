using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using LabApi.Features.Wrappers;
using UnityEngine;
using Logger = LabApi.Features.Console.Logger;

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
    public static readonly ConcurrentDictionary<string, string[]> Spray = new();
    public static readonly ConcurrentDictionary<string, string[]> OptimizedSpray = new();
    public static readonly Dictionary<int, List<TextToy>> ActiveSprays = new();

    // Helper dictionaries
    private static readonly Dictionary<string, string> SprayHashes = new();

    // Networking
    private static readonly HttpClient HttpClient = new();

    // Multi-user fetch (optimized, no caching)
    public static async Task SetSpraysForAllUsersFromBackend()
    {
        Config config = Plugin.Instance.Config!;
        Player[] players = Player.ReadyList.Where(p => !p.IsDummy && !p.IsHost).ToArray();
        if (players.Length == 0) return;

        string hashQuery = string.Join("&", players.Select(p => $"userid={Uri.EscapeDataString(p.UserId)}"));
        string hashEndpoint = $"{config.BackendURL}/hash?{hashQuery}&_ts={DateTime.UtcNow.Ticks}";

        Logger.Debug($"Fetching hashes from endpoint: {hashEndpoint}", config.Debug);

        try
        {
            // Build request with no-cache headers
            using HttpRequestMessage hashRequest = new(HttpMethod.Get, hashEndpoint);
            hashRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.BackendAPIToken);
            hashRequest.Headers.CacheControl = new CacheControlHeaderValue
                { NoCache = true, NoStore = true, MustRevalidate = true };
            hashRequest.Headers.Pragma.ParseAdd("no-cache");

            HttpResponseMessage hashResponse = await HttpClient.SendAsync(hashRequest);
            if (!hashResponse.IsSuccessStatusCode)
            {
                Logger.Debug($"Failed to fetch hashes. Status: {hashResponse.StatusCode}", config.Debug);
                return;
            }

            string hashResponseText = await hashResponse.Content.ReadAsStringAsync();
            Dictionary<string, string> fetchedHashes = hashResponseText
                .Split([';'], StringSplitOptions.RemoveEmptyEntries)
                .Select(entry => entry.Split([','], 2))
                .Where(parts => parts.Length == 2)
                .ToDictionary(parts => parts[0], parts => parts[1]);

            Logger.Debug($"Fetched hashes from endpoint: {hashResponseText}", config.Debug);

            KeyValuePair<string, string>[] changedUsers = fetchedHashes
                .Where(kv => !SprayHashes.TryGetValue(kv.Key, out string existingHash) || existingHash != kv.Value)
                .ToArray();

            if (changedUsers.Length == 0) return;

            foreach (KeyValuePair<string, string> kv in changedUsers)
                SprayHashes[kv.Key] = kv.Value;

            // Fetch sprays for changed users
            string sprayQuery = string.Join("&", changedUsers.Select(kv => $"userid={Uri.EscapeDataString(kv.Key)}"));
            string sprayEndpoint = $"{config.BackendURL}/spray?{sprayQuery}&_ts={DateTime.UtcNow.Ticks}";

            Logger.Debug($"Fetching sprays from endpoint: {sprayEndpoint}", config.Debug);

            using HttpRequestMessage sprayRequest = new(HttpMethod.Get, sprayEndpoint);
            sprayRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.BackendAPIToken);
            sprayRequest.Headers.CacheControl = new CacheControlHeaderValue
                { NoCache = true, NoStore = true, MustRevalidate = true };
            sprayRequest.Headers.Pragma.ParseAdd("no-cache");

            HttpResponseMessage sprayResponse = await HttpClient.SendAsync(sprayRequest);
            if (!sprayResponse.IsSuccessStatusCode)
            {
                Logger.Debug($"Failed to fetch sprays. Status: {sprayResponse.StatusCode}", config.Debug);
                return;
            }

            string sprayResponseText = await sprayResponse.Content.ReadAsStringAsync();
            Dictionary<string, string> fetchedSprays = sprayResponseText
                .Split([';'], StringSplitOptions.RemoveEmptyEntries)
                .Select(entry => entry.Split([','], 2))
                .Where(parts => parts.Length == 2)
                .ToDictionary(parts => parts[0], parts => parts[1]);

            foreach (KeyValuePair<string, string> fetchedSpray in fetchedSprays)
            {
                if (!Player.TryGet(fetchedSpray.Key, out Player player)) continue;

                if (fetchedSpray.Value == "" || fetchedSpray.Value == string.Empty)
                {
                    Spray[player.UserId] = [];
                    OptimizedSpray[player.UserId] = [];
                    player.ClearExistingSpray();
                    player.SendHint("<color=red>Dein Spray wurde gelöscht!</color>", 10f);
                    Logger.Debug($"Cleared spray for {player.Nickname}", config.Debug);
                    continue;
                }

                string[] newSpray = ConvertSprayTextToSpray(fetchedSpray.Value);
                string[] optimizedSpray = ConvertSprayToOptimizedSpray(newSpray);

                Spray[player.UserId] = newSpray;
                OptimizedSpray[player.UserId] = optimizedSpray;

                player.ClearExistingSpray();
                player.SendHint(Plugin.Instance.Translation.SpraysRefreshed, 10f);

                Logger.Debug($"Spray set for {player.Nickname}", config.Debug);
            }
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