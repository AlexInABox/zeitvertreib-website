using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Text;
using Exiled.API.Interfaces;
using Exiled.Loader;
using HintServiceMeow.Core.Enum;
using HintServiceMeow.Core.Models.Hints;
using HintServiceMeow.Core.Utilities;
using LabApi.Events.Arguments.PlayerEvents;
using LabApi.Events.Arguments.ServerEvents;
using LabApi.Events.Handlers;
using LabApi.Features.Permissions;
using LabApi.Features.Wrappers;
using LabApi.Loader;
using MapGeneration;
using MEC;
using Newtonsoft.Json;
using PlayerRoles;
using Respawning.Objectives;
using SnakeAPI.API;
using UnityEngine;
using Zeitvertreib.Types;
using Logger = LabApi.Features.Console.Logger;
using Player = LabApi.Features.Wrappers.Player;
using StatsPlayer = Zeitvertreib.Types.Player;
using StatsKill = Zeitvertreib.Types.Kill;


namespace Tracked;

public static class EventHandlers
{
    //Globals for this file
    private static readonly Config Config = Plugin.Instance.Config!;

    //Helper dictionaries
    private static readonly Dictionary<string, int> PlayerStartingTimestamps = new();
    private static int _roundStartTimestamp;
    private static readonly Dictionary<string, int> ExtraPlayerPointsThisRound = new();

    //Publish dictionaries
    private static readonly Dictionary<string, int> PlayerTimePlayedThisRound = new();
    private static readonly Dictionary<string, int> PlayerRoundsPlayedThisRound = new();
    private static readonly List<StatsKill> KillsThisRound = [];
    private static readonly Dictionary<string, int> PlayerMedkitsUsedThisRound = new();
    private static readonly Dictionary<string, int> PlayerColasUsedThisRound = new();
    private static readonly Dictionary<string, int> PlayerAdrenalineUsedThisRound = new();
    private static readonly Dictionary<string, int> PlayerPocketEscapesThisRound = new();
    private static readonly Dictionary<string, int> PlayerPointsThisRound = new();
    private static readonly Dictionary<string, int> PlayerSnakeScoresThisRound = new();
    private static readonly Dictionary<string, bool> FakeRankAllowed = new();
    private static readonly Dictionary<string, bool> FakeRankAdmin = new();
    private static readonly Dictionary<string, string> PlayerUsernames = new();

    //RoundReports references
    private static IPlugin<IConfig> _roundReportsPlugin;
    private static Assembly _roundReportsAssembly;
    private static bool _foundRoundReports;
    private static Type _roundReportsApi;

    //Hint related dictionaries
    private static readonly Dictionary<int, List<string>> PlayerKillFeed = new();

    //Coroutine Handelers
    private static CoroutineHandle _fetchZvcCoroutine;

    public static void RegisterEvents()
    {
        // Starting conditions
        PlayerEvents.Joined += OnJoined;
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;
        ServerEvents.RoundStarting += OnRoundStarting;

        // Kill stuff
        PlayerEvents.Death += OnDeath;

        //Events stuff
        PlayerEvents.UsedItem += OnUsedItem;
        PlayerEvents.LeftPocketDimension += OnLeftPocketDimension;

        // Ending calculate conditions
        PlayerEvents.Left += OnLeft;
        ServerEvents.RoundEnding += OnRoundEnding;

        //Snake fun
        SnakeEvents.SnakeLost += OnSnakeGameFinished;

        //Map stuff
        //ServerEvents.MapGenerated += OnMapGenerated;
        ServerEvents.WaitingForPlayers += OnWaitingForPlayers;

        //Escaping logic
        PlayerEvents.Escaping += OnEscaping;

        //Points for window destructions
        PlayerEvents.DamagedWindow += OnDamagedWindow;

        //Logic Loops
        _fetchZvcCoroutine = Timing.RunCoroutine(Utils.FetchAllZvcCoroutine());
    }

    public static void UnregisterEvents()
    {
        PlayerEvents.Joined -= OnJoined;
        PlayerEvents.Left -= OnLeft;
        PlayerEvents.Death -= OnDeath;
        PlayerEvents.UsedItem -= OnUsedItem;
        PlayerEvents.LeftPocketDimension -= OnLeftPocketDimension;
        ServerEvents.RoundStarting -= OnRoundStarting;
        ServerEvents.RoundEnding -= OnRoundEnding;
        SnakeEvents.SnakeLost -= OnSnakeGameFinished;
        //ServerEvents.MapGenerated -= OnMapGenerated;
        ServerEvents.WaitingForPlayers -= OnWaitingForPlayers;
        PlayerEvents.Escaping -= OnEscaping;
        PlayerEvents.DamagedWindow -= OnDamagedWindow;

        Timing.KillCoroutines(_fetchZvcCoroutine);
    }

    private static void OnJoined(PlayerJoinedEventArgs ev)
    {
        if (ev.Player.IsDummy || ev.Player.IsHost || ev.Player.DoNotTrack) return;

        string userId = ev.Player.UserId;
        int timestamp = (int)Time.time;

        PlayerStartingTimestamps[userId] = timestamp;
        PlayerUsernames[userId] = ev.Player.Nickname;

        if (!PlayerTimePlayedThisRound.ContainsKey(userId)) PlayerTimePlayedThisRound[userId] = 0;
        if (!PlayerRoundsPlayedThisRound.ContainsKey(userId)) PlayerRoundsPlayedThisRound[userId] = 0;

        //Check if the player is allowed to use fake rank
        FakeRankAllowed[ev.Player.UserId] = ev.Player.HasPermissions("fakerank");
        FakeRankAdmin[ev.Player.UserId] = ev.Player.HasPermissions("fakerank.admin");

        _ = Utils.FetchZvcForUser(ev.Player.UserId);

        Hint zvcHint = new()
        {
            Alignment = HintAlignment.Left,
            AutoText = _ =>
            {
                string hint = string.Empty;
                int zvc = 0;
                if (Utils.RemoteZvcCount.TryGetValue(userId, out int storedPoints))
                    zvc += storedPoints;
                if (ExtraPlayerPointsThisRound.TryGetValue(userId, out int extraPoints))
                    zvc += extraPoints;
                zvc += GetPointsOfPlayer(ev.Player);
                hint += $"<size=20><b>Zeitvertreib Punkte: {zvc}</b></size>\n";
                return hint;
            },
            YCoordinateAlign = HintVerticalAlign.Bottom,
            YCoordinate = 990,
            XCoordinate = (int)(-540f * ev.Player.ReferenceHub.aspectRatioSync.AspectRatio + 600f) + 50,
            SyncSpeed = HintSyncSpeed.Slowest
        };
        PlayerDisplay playerDisplay = PlayerDisplay.Get(ev.Player);
        playerDisplay.AddHint(zvcHint);


        PlayerKillFeed[ev.Player.PlayerId] = [];
        Hint killFeed = new()
        {
            Alignment = HintAlignment.Left,
            AutoText = _ =>
            {
                string hint = "<size=25><b>";
                if (KillsThisRound.FindAll(k => k.Attacker == ev.Player.UserId).Count > 0)
                    hint += $"Kills: {KillsThisRound.FindAll(k => k.Attacker == ev.Player.UserId).Count}\n";

                foreach (string s in PlayerKillFeed[ev.Player.PlayerId]) hint += s + "\n";
                hint += "</b></size>";
                return hint;
            },
            YCoordinateAlign = HintVerticalAlign.Top,
            YCoordinate = 30,
            XCoordinate = (int)(-540f * ev.Player.ReferenceHub.aspectRatioSync.AspectRatio + 600f),
            SyncSpeed = HintSyncSpeed.Normal
        };
        playerDisplay.AddHint(killFeed);
    }

    private static void OnLeft(PlayerLeftEventArgs ev)
    {
        if (ev.Player.IsDummy || ev.Player.IsHost || ev.Player.DoNotTrack) return;

        string userId = ev.Player.UserId;
        int timestamp = (int)Time.time;

        if (!PlayerStartingTimestamps.TryGetValue(userId, out int startingTimestamp)) return;

        PlayerTimePlayedThisRound[userId] += timestamp - startingTimestamp;
        PlayerStartingTimestamps.Remove(userId);

        PlayerPointsThisRound[userId] = GetPointsOfPlayer(ev.Player);
    }

    private static void OnDeath(PlayerDeathEventArgs ev)
    {
        if (ev.Attacker == null || ev.Attacker.IsNpc) return;

        string color = ev.OldRole.GetRoleColor().ToHex();
        PlayerKillFeed[ev.Attacker.PlayerId].Insert(0, $"<color={color}>💀 - {ev.Player.Nickname}</color>");

        Timing.CallDelayed(7f, () =>
        {
            if (!PlayerKillFeed.ContainsKey(ev.Attacker.PlayerId)) return;
            if (PlayerKillFeed[ev.Attacker.PlayerId].Count > 0)
                PlayerKillFeed[ev.Attacker.PlayerId].RemoveAt(PlayerKillFeed[ev.Attacker.PlayerId].Count - 1);
        });

        if (ev.Player.IsDummy || ev.Player.IsHost) return;

        // Check if ServerLogsText contains "unknown" (any spelling) - indicates disconnect, should not be counted
        string serverLogsText = ev.DamageHandler.ServerLogsText;
        if (string.IsNullOrEmpty(serverLogsText) ||
            serverLogsText.ToLower().Contains("unknown"))
        {
            Logger.Debug($"Skipping kill record due to disconnect: {serverLogsText}", Plugin.Instance.Config!.Debug);
            return;
        }

        int timestamp = (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds(); //epoch
        string targetId = "anonymous";
        string attackerId = "anonymous";

        if (!ev.Player.DoNotTrack) targetId = ev.Player.UserId;
        if (ev.Attacker is { DoNotTrack: false, IsHost: false, IsDummy: false })
            attackerId = ev.Attacker.UserId;

        KillsThisRound.Add(new StatsKill
        {
            Attacker = attackerId,
            Target = targetId,
            Timestamp = timestamp
        });

        Logger.Debug($"Kill recorded: {attackerId} -> {targetId} at {timestamp}", Plugin.Instance.Config!.Debug);
    }

    private static void OnUsedItem(PlayerUsedItemEventArgs ev)
    {
        bool isMedkit = ev.UsableItem.Type == ItemType.Medkit;
        bool isAdrenaline = ev.UsableItem.Type == ItemType.Adrenaline;
        bool isCola = ev.UsableItem.Type is ItemType.SCP207 or ItemType.AntiSCP207;

        if (!isMedkit && !isAdrenaline && !isCola) return;

        string userId = ev.Player.UserId;
        if (string.IsNullOrEmpty(userId) || ev.Player.IsDummy || ev.Player.IsHost || ev.Player.DoNotTrack) return;

        if (isMedkit)
        {
            if (!PlayerMedkitsUsedThisRound.ContainsKey(userId))
                PlayerMedkitsUsedThisRound[userId] = 0;
            PlayerMedkitsUsedThisRound[userId]++;
            Logger.Debug($"Player {userId} used a medkit. Total this round: {PlayerMedkitsUsedThisRound[userId]}",
                Plugin.Instance.Config!.Debug);
        }
        else if (isCola)
        {
            if (!PlayerColasUsedThisRound.ContainsKey(userId))
                PlayerColasUsedThisRound[userId] = 0;
            PlayerColasUsedThisRound[userId]++;
            Logger.Debug($"Player {userId} used a cola. Total this round: {PlayerColasUsedThisRound[userId]}",
                Plugin.Instance.Config!.Debug);
        }
        else
        {
            if (!PlayerAdrenalineUsedThisRound.ContainsKey(userId))
                PlayerAdrenalineUsedThisRound[userId] = 0;
            PlayerAdrenalineUsedThisRound[userId]++;
            Logger.Debug($"Player {userId} used adrenaline. Total this round: {PlayerAdrenalineUsedThisRound[userId]}",
                Plugin.Instance.Config!.Debug);
        }
    }

    private static void OnLeftPocketDimension(PlayerLeftPocketDimensionEventArgs ev)
    {
        if (!ev.IsSuccessful) return;

        string userId = ev.Player.UserId;
        if (string.IsNullOrEmpty(userId) || ev.Player.IsDummy || ev.Player.IsHost || ev.Player.DoNotTrack) return;

        if (!PlayerPocketEscapesThisRound.ContainsKey(userId))
            PlayerPocketEscapesThisRound[userId] = 0;
        PlayerPocketEscapesThisRound[userId]++;
        Logger.Debug(
            $"Player {userId} successfully escaped pocket dimension. Total this round: {PlayerPocketEscapesThisRound[userId]}",
            Plugin.Instance.Config!.Debug);
    }

    private static void OnSnakeGameFinished(Player player, int score)
    {
        if (player.IsDummy || player.IsHost || player.DoNotTrack) return;

        string userId = player.UserId;
        if (string.IsNullOrEmpty(userId)) return; //HATE. LET ME TELL YOU HOW MUCH I'VE COME TO HATE LABAPI!!

        if (!PlayerSnakeScoresThisRound.ContainsKey(userId))
            PlayerSnakeScoresThisRound[userId] = 0;

        PlayerSnakeScoresThisRound[userId] = Math.Max(PlayerSnakeScoresThisRound[userId], score);
        Logger.Debug(
            $"Player {userId} finished snake game with score: {score}. Total this round: {PlayerSnakeScoresThisRound[userId]}",
            Plugin.Instance.Config!.Debug);
    }

    private static void OnEscaping(PlayerEscapingEventArgs ev)
    {
        if (ev.OldRole is not (RoleTypeId.ClassD or RoleTypeId.Scientist)) return;

        if (ev.Player.IsDummy || ev.Player.IsHost || ev.Player.DoNotTrack) return;

        int coinCount = ev.Player.Items.Count(item => item.Type == ItemType.Coin);
        if (coinCount == 0) return;

        if (ExtraPlayerPointsThisRound.ContainsKey(ev.Player.UserId))
            ExtraPlayerPointsThisRound[ev.Player.UserId] += coinCount * Plugin.Instance.Config!.CoinEscapeMultiplier;
        else
            ExtraPlayerPointsThisRound[ev.Player.UserId] = coinCount * Plugin.Instance.Config!.CoinEscapeMultiplier;

        Timing.CallDelayed(4f, () =>
        {
            string coinWord = coinCount == 1 ? "Münze" : "Münzen";
            string zvcCoinWord = coinCount * Plugin.Instance.Config!.CoinEscapeMultiplier == 1 ? "Münze" : "Münzen";


            ev.Player.SendHint(
                $"+ {coinCount * Plugin.Instance.Config!.CoinEscapeMultiplier} <b>Zeitvertreib {zvcCoinWord}</b>\n Grund: Entkommen mit {coinCount} {coinWord}",
                6f
            );
        });

        // Remove all coins from inventory
        //ev.Player.RemoveItem(ItemType.Coin, coinCount); <- doesn't work for some reason
        for (int i = 0; i < coinCount; i++) ev.Player.RemoveItem(ItemType.Coin);

        Logger.Debug(
            $"Player {ev.Player.UserId} escaped with {coinCount} coins, earning {coinCount * Plugin.Instance.Config!.CoinEscapeMultiplier} extra points.",
            Plugin.Instance.Config!.Debug);
    }

    private static void OnDamagedWindow(PlayerDamagedWindowEventArgs ev)
    {
        if (!ev.Window.IsBroken) return;

        if (ev.Player.IsDummy || ev.Player.IsHost || ev.Player.DoNotTrack) return;

        if (ExtraPlayerPointsThisRound.ContainsKey(ev.Player.UserId))
            ExtraPlayerPointsThisRound[ev.Player.UserId] += 1;
        else
            ExtraPlayerPointsThisRound[ev.Player.UserId] = 1;

        ev.Player.SendHint(
            "+ 1 <b>Zeitvertreib Münze</b>\n Grund: Fenster zerstört",
            4f);

        Logger.Debug(
            $"Player {ev.Player.UserId} destroyed a window, earning 1 extra point.", Plugin.Instance.Config!.Debug);
    }

    private static void OnWaitingForPlayers()
    {
        PlayerRoundsPlayedThisRound.Clear();
        PlayerMedkitsUsedThisRound.Clear();
        PlayerColasUsedThisRound.Clear();
        PlayerAdrenalineUsedThisRound.Clear();
        PlayerPocketEscapesThisRound.Clear();
        PlayerPointsThisRound.Clear();
        ExtraPlayerPointsThisRound.Clear();
        PlayerUsernames.Clear();
        PlayerKillFeed.Clear();

        List<TrackedRoom> map = [];
        foreach (Room room in Map.Rooms)
        {
            List<TrackedConnectedRoom> connectedRooms = [];
            foreach (RoomIdentifier connectedRoomIdentifier in room.ConnectedRooms)
                connectedRooms.Add(new TrackedConnectedRoom
                {
                    Pos = new TrackedCoordinates
                    {
                        X = (int)Math.Round(Room.Get(connectedRoomIdentifier).Position.x),
                        Z = (int)Math.Round(Room.Get(connectedRoomIdentifier).Position.z)
                    }
                });
            TrackedRoom newRoom = new()
            {
                Name = room.Name.ToString(),
                Shape = room.Shape.ToString(),
                Zone = room.Zone.ToString(),
                Pos = new TrackedCoordinates
                {
                    X = (int)Math.Round(room.Position.x),
                    Z = (int)Math.Round(room.Position.z)
                },
                ConnectedRooms = connectedRooms
            };
            map.Add(newRoom);
        }

        FileManager.WriteStringToFile(JsonConvert.SerializeObject(map, Formatting.Indented),
            Plugin.Instance.GetConfigPath(Plugin.Instance.ConfigFileName).Replace(Plugin.Instance.ConfigFileName, "") +
            "map.json");
    }

    private static void OnRoundStarting(RoundStartingEventArgs ev)
    {
        _roundStartTimestamp = (int)Time.time;

        ConnectToRoundReports();
    }

    private static void OnRoundEnding(RoundEndingEventArgs ev)
    {
        int endTimestamp = (int)Time.time;
        int roundDuration = endTimestamp - _roundStartTimestamp;
        double minimumTimeForRound = roundDuration * 0.8; // 80% of round duration

        foreach (Player player in Player.List)
        {
            if (player.IsDummy || player.IsHost || player.DoNotTrack) continue;

            string userId = player.UserId;

            if (string.IsNullOrEmpty(userId)) continue;

            if (!PlayerStartingTimestamps.TryGetValue(userId, out int timestamp)) continue;

            PlayerTimePlayedThisRound[userId] += endTimestamp - timestamp;

            // Check if player was present for at least 80% of the round
            if (PlayerTimePlayedThisRound[userId] >= minimumTimeForRound)
                PlayerRoundsPlayedThisRound[userId] = 1; // Player gets 1 round played
        }

        Dictionary<string, int> totalPlayerPointsTemp = new();
        foreach (Player player in Player.List)
        {
            if (player.IsDummy || player.IsHost || player.DoNotTrack) continue;
            string userId = player.UserId;

            if (string.IsNullOrEmpty(userId)) continue;
            PlayerPointsThisRound[userId] = GetPointsOfPlayer(player);

            totalPlayerPointsTemp[userId] = PlayerPointsThisRound[userId];

            if (ExtraPlayerPointsThisRound.TryGetValue(userId, out int extraPoints))
                totalPlayerPointsTemp[userId] += extraPoints;
        }

        UploadAllStatsToDatabase(totalPlayerPointsTemp);
    }

    private static async void UploadAllStatsToDatabase(Dictionary<string, int> totalPlayerPoints)
    {
        try
        {
            // Build the players array for each player
            List<StatsPlayer> playerStatsList = [];

            // Get all unique player IDs from all dictionaries
            HashSet<string> allPlayerIds = [];
            allPlayerIds.UnionWith(PlayerTimePlayedThisRound.Keys);
            allPlayerIds.UnionWith(PlayerRoundsPlayedThisRound.Keys);
            allPlayerIds.UnionWith(PlayerMedkitsUsedThisRound.Keys);
            allPlayerIds.UnionWith(PlayerColasUsedThisRound.Keys);
            allPlayerIds.UnionWith(PlayerAdrenalineUsedThisRound.Keys);
            allPlayerIds.UnionWith(PlayerPocketEscapesThisRound.Keys);
            allPlayerIds.UnionWith(totalPlayerPoints.Keys);
            allPlayerIds.UnionWith(PlayerSnakeScoresThisRound.Keys);
            allPlayerIds.UnionWith(FakeRankAllowed.Keys);
            allPlayerIds.UnionWith(FakeRankAdmin.Keys);
            allPlayerIds.UnionWith(PlayerUsernames.Keys);

            // Build stats for each player
            foreach (string userId in allPlayerIds)
            {
                StatsPlayer stats = new()
                {
                    Userid = userId
                };

                if (PlayerTimePlayedThisRound.TryGetValue(userId, out int timePlayed))
                    stats.TimePlayed = timePlayed;

                if (PlayerRoundsPlayedThisRound.TryGetValue(userId, out int roundsPlayed))
                    stats.RoundsPlayed = roundsPlayed;

                if (PlayerMedkitsUsedThisRound.TryGetValue(userId, out int medkits))
                    stats.Medkits = medkits;

                if (PlayerColasUsedThisRound.TryGetValue(userId, out int colas))
                    stats.Colas = colas;

                if (PlayerAdrenalineUsedThisRound.TryGetValue(userId, out int adrenaline))
                    stats.Adrenaline = adrenaline;

                if (PlayerPocketEscapesThisRound.TryGetValue(userId, out int pocketEscapes))
                    stats.PocketEscapes = pocketEscapes;

                if (totalPlayerPoints.TryGetValue(userId, out int points))
                    stats.Zvc = points;

                if (PlayerSnakeScoresThisRound.TryGetValue(userId, out int snakeScore))
                    stats.SnakeScore = snakeScore;

                if (FakeRankAllowed.TryGetValue(userId, out bool fakeRankAllowed))
                    stats.FakeRankAllowed = fakeRankAllowed;

                if (FakeRankAdmin.TryGetValue(userId, out bool fakeRankAdmin))
                    stats.FakeRankAdmin = fakeRankAdmin;

                if (PlayerUsernames.TryGetValue(userId, out string username))
                    stats.Username = username;

                playerStatsList.Add(stats);
            }

            // Create the payload object
            StatsPostRequest payload = new()
            {
                Players = playerStatsList,
                Kills = KillsThisRound
            };

            string json = JsonConvert.SerializeObject(payload, Formatting.Indented);

            Logger.Debug($"Uploading to endpoint: {Config.EndpointUrl}/stats", Plugin.Instance.Config!.Debug);
            Logger.Debug($"Payload: {json}", Plugin.Instance.Config!.Debug);

            using HttpClient client = new();
            client.DefaultRequestHeaders.Add("Authorization", "Bearer " + Config.Apikey);

            StringContent content = new(json, Encoding.UTF8, "application/json");
            HttpResponseMessage response = await client.PostAsync(Config.EndpointUrl + "/stats", content);

            string responseText = await response.Content.ReadAsStringAsync();
            Logger.Info($"Uploaded all player stats and kills to database. Response: {responseText}");
        }
        catch (Exception ex)
        {
            Logger.Error($"Failed to upload player stats to database: {ex}");
        }
        finally
        {
            // Clear all dictionaries
            PlayerStartingTimestamps.Clear();
            PlayerTimePlayedThisRound.Clear();
            PlayerRoundsPlayedThisRound.Clear();
            PlayerMedkitsUsedThisRound.Clear();
            PlayerColasUsedThisRound.Clear();
            PlayerAdrenalineUsedThisRound.Clear();
            PlayerPocketEscapesThisRound.Clear();
            PlayerPointsThisRound.Clear();
            PlayerSnakeScoresThisRound.Clear();
            FakeRankAllowed.Clear();
            FakeRankAdmin.Clear();
            PlayerUsernames.Clear();
            KillsThisRound.Clear();
        }
    }

    private static int GetPointsOfPlayer(Player player)
    {
        try
        {
            if (!_foundRoundReports || _roundReportsApi == null) return 0;
            if (player == null || player.IsDummy || player.IsHost || player.DoNotTrack) return 0;

            int points = 0;
            points = (int)_roundReportsApi.GetMethod("GetPointsOfPlayer")?.Invoke(null, [player.PlayerId])!;
            return points;
        }
        catch (Exception ex)
        {
            Logger.Error($"Error getting points for player {player!.UserId}: {ex}");
            return 0;
        }
    }

    private static void ConnectToRoundReports()
    {
        _roundReportsPlugin = Loader.Plugins.FirstOrDefault(plugin => plugin.Assembly.GetName().Name == "RoundReports");
        _roundReportsAssembly = _roundReportsPlugin?.Assembly ?? null;
        _foundRoundReports = _roundReportsAssembly is not null;
        _roundReportsApi = _roundReportsAssembly?.GetType("RoundReports.API.RoundReports");

        if (_foundRoundReports && _roundReportsApi != null)
            Logger.Info("Connected to RoundReports API successfully.");
        else
            Logger.Warn("RoundReports API not found or failed to connect.");
    }
}

public class TrackedRoom
{
    [JsonProperty("name")] public string Name { get; set; }

    [JsonProperty("shape")] public string Shape { get; set; }

    [JsonProperty("zone")] public string Zone { get; set; }

    [JsonProperty("pos")] public TrackedCoordinates Pos { get; set; }

    [JsonProperty("connectedRooms")] public List<TrackedConnectedRoom> ConnectedRooms { get; set; }
}

public class TrackedConnectedRoom
{
    [JsonProperty("pos")] public TrackedCoordinates Pos { get; set; }
}

public class TrackedCoordinates
{
    [JsonProperty("x")] public float X { get; set; }

    [JsonProperty("z")] public float Z { get; set; }
}