using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using LabApi.Features.Wrappers;
using MEC;
using Zeitvertreib.Types;
using Logger = LabApi.Features.Console.Logger;
using Player = LabApi.Features.Wrappers.Player;

namespace Tracked;

public static class Utils
{
    private static readonly Config Config = Plugin.Instance.Config!;
    public static readonly ConcurrentDictionary<string, int> RemoteZvcCount = new();
    public static readonly HttpClient HttpClient = new();
    private static volatile bool _isFetchingAll;

    public static IEnumerator<float> FetchAllZvcCoroutine()
    {
        while (true)
        {
            if (!Round.IsRoundEnded && !_isFetchingAll)
                FetchAllZvcAsync();
            yield return Timing.WaitForSeconds(15f);
        }
        // ReSharper disable once IteratorNeverReturns
    }

    private static void FetchAllZvcAsync()
    {
        // Collect user IDs on main thread before background work
        List<string> userIds = Player.ReadyList
            .Where(p => p.IsPlayer)
            .Select(p => p.UserId)
            .ToList();

        if (userIds.Count == 0) return;

        _ = Task.Run(async () =>
        {
            try
            {
                await FetchAllZvcInternal(userIds);
            }
            catch (Exception ex)
            {
                Logger.Error($"Background ZVC fetch failed: {ex.Message}");
            }
        });
    }

    private static async Task FetchAllZvcInternal(List<string> userIds)
    {
        if (_isFetchingAll) return;
        _isFetchingAll = true;

        try
        {
            // Build query string: ?userId=a&userId=b&userId=c
            string qs = string.Join("&",
                userIds.Select(id => $"userId={Uri.EscapeDataString(id)}"));

            Logger.Debug($"{Config.EndpointUrl}/zvc?{qs}",
                Plugin.Instance.Config!.Debug);

            HttpResponseMessage response = await HttpClient
                .GetAsync($"{Config.EndpointUrl}/zvc?{qs}")
                .ConfigureAwait(false);

            string responseText = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            Logger.Debug($"Fetched ZVC response: {responseText}", Plugin.Instance.Config!.Debug);

            // Deserialize using the generated type
            ZvcGetResponse data = ZvcGetResponse.FromJson(responseText);

            // Fill dictionary; missing players → 0
            foreach (string uid in userIds)
            {
                User user = data?.Users?.FirstOrDefault(x => x.Userid == uid);
                RemoteZvcCount[uid] = user != null ? (int)user.Zvc : 0;
            }
        }
        catch (Exception ex)
        {
            Logger.Error($"Failed to fetch ZVC list: {ex}");
        }
        finally
        {
            _isFetchingAll = false;
        }
    }

    public static void FetchZvcForUserAsync(string userId)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await FetchZvcForUserInternal(userId);
            }
            catch (Exception ex)
            {
                Logger.Error($"Background ZVC fetch for user {userId} failed: {ex.Message}");
                RemoteZvcCount[userId] = 0;
            }
        });
    }

    private static async Task FetchZvcForUserInternal(string userId)
    {
        try
        {
            string qs = $"userId={Uri.EscapeDataString(userId)}";

            HttpResponseMessage response = await HttpClient
                .GetAsync($"{Config.EndpointUrl}/zvc?{qs}")
                .ConfigureAwait(false);

            string responseText = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            ZvcGetResponse data = ZvcGetResponse.FromJson(responseText);
            User user = data?.Users?.FirstOrDefault(x => x.Userid == userId);

            RemoteZvcCount[userId] = user != null ? (int)user.Zvc : 0;
        }
        catch
        {
            RemoteZvcCount[userId] = 0;
        }
    }
}