using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Console;
using LabApi.Features.Wrappers;
using MEC;
using Zeitvertreib.Types;
using Player = LabApi.Features.Wrappers.Player;
using Newtonsoft.Json;

namespace FakeRank;

public static class EventHandlers
{
    private static readonly Dictionary<string, (string, string)> FakeRanks = new();
    private static CoroutineHandle _coroutineFakeRankLoop;
    private static CoroutineHandle _coroutineFetchLoop;

    private static readonly HttpClient Http = new();

    public static void RegisterEvents()
    {
        //Apply fakerank every ten seconds
        _coroutineFakeRankLoop = Timing.RunCoroutine(FakeRankLoop());

        //Refetch from backend every ten seconds
        _coroutineFetchLoop = Timing.RunCoroutine(FetchLoop());

        // Fetch fake rank on player join
        PlayerEvents.Joined += OnJoined;
    }

    public static void UnregisterEvents()
    {
        Timing.KillCoroutines(_coroutineFakeRankLoop);
        Timing.KillCoroutines(_coroutineFetchLoop);

        PlayerEvents.Joined -= OnJoined;
    }

    private static IEnumerator<float> FakeRankLoop()
    {
        while (true)
        {
            foreach (KeyValuePair<string, (string, string)> fakerank in FakeRanks)
            {
                if (!Player.TryGet(fakerank.Key, out Player player))
                    continue;

                if (player.ReferenceHub.serverRoles.HasBadgeHidden)
                    continue;

                string newName, newColor;

                if (string.IsNullOrEmpty(fakerank.Value.Item1))
                {
                    newName = player.UserGroup?.BadgeText ?? string.Empty;
                    newColor = player.UserGroup?.BadgeColor ?? "default";
                }
                else
                {
                    newName = fakerank.Value.Item1 + " (" + (player.UserGroup?.BadgeText ?? "Stammspieler") + ")";
                    newColor = fakerank.Value.Item2;
                }

                // Only update if changed
                if (player.GroupName != newName) player.GroupName = newName;
                if (player.GroupColor != newColor) player.GroupColor = newColor;
            }

            yield return Timing.WaitForSeconds(10f);
        }
    }


    private static IEnumerator<float> FetchLoop()
    {
        while (true)
        {
            GetAllFakeRanksFromBackend();
            yield return Timing.WaitForSeconds(10f);
        }
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        if (ev.Player.UserId == string.Empty || ev.Player.IsDummy || ev.Player.IsHost) return;
        //if (!ev.Player.HasPermissions("fakerank")) return;

        GetFakeRankFromBackend(ev.Player.UserId);
    }

    private static async void GetFakeRankFromBackend(string userId)
    {
        (string Name, string Color) rank = (string.Empty, string.Empty);

        try
        {
            Config cfg = Plugin.Instance.Config!;
            using HttpClient client = new();
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", cfg.BackendAPIToken);

            HttpResponseMessage res =
                await client.GetAsync($"{cfg.BackendURL}/fakerank?userid={Uri.EscapeDataString(userId)}");
            if (res.IsSuccessStatusCode)
            {
                string[] parts = (await res.Content.ReadAsStringAsync()).Split(',');
                if (parts.Length == 2)
                    rank = (parts[0].Trim(), parts[1].Trim());
            }
        }
        catch
        {
            Logger.Error("Error while fetching FakeRank from backend for user " + userId);
        }

        FakeRanks[userId] = rank;
    }

    private static async void GetAllFakeRanksFromBackend()
    {
        try
        {
            Config cfg = Plugin.Instance.Config!;
            Http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", cfg.BackendAPIToken);

            // Get all non-dummy users
            string[] userIds = Player.ReadyList.Where(p => p.IsPlayer).Select(p => p.UserId).ToArray();
            if (userIds.Length == 0) return;

            // Build the request with typed FakerankGetRequest
            FakerankGetRequest request = new()
            {
                Userids = new List<string>(userIds)
            };

            string useridsJson = JsonConvert.SerializeObject(request.Userids);
            string query = $"userids={Uri.EscapeDataString(useridsJson)}";
            HttpResponseMessage res = await Http.GetAsync($"{cfg.BackendURL}/fakerank?{query}");

            if (!res.IsSuccessStatusCode) return;

            // Deserialize response into typed FakerankGetResponse
            string responseContent = await res.Content.ReadAsStringAsync();
            FakerankGetResponse response = FakerankGetResponse.FromJson(responseContent);

            if (response?.Fakeranks == null) return;

            HashSet<string> updatedIds = [];

            foreach (Fakerank fakerank in response.Fakeranks)
            {
                string id = fakerank.Userid;
                (string, string) rank = (fakerank.Text, fakerank.Color.ToString().ToSnakeCase());

                // Only update if changed
                if (!FakeRanks.TryGetValue(id, out (string, string) oldRank) || oldRank != rank)
                    FakeRanks[id] = rank;

                updatedIds.Add(id);
            }

            // Remove users no longer returned
            foreach (string id in FakeRanks.Keys.Except(updatedIds).ToList())
                FakeRanks.Remove(id);
        }
        catch
        {
            Logger.Error("Error while fetching FakeRanks from backend");
        }
    }
    
    private static string ToSnakeCase(this string input)
    {
        StringBuilder sb = new(input.Length + 5);

        for (int i = 0; i < input.Length; i++)
        {
            if (char.IsUpper(input[i]) && i > 0)
                sb.Append('_');

            sb.Append(char.ToLowerInvariant(input[i]));
        }

        return sb.ToString();
    }
}