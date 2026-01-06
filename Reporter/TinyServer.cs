using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Zeitvertreib.Types;
using Logger = LabApi.Features.Console.Logger;

namespace Reporter;

public class TinyServer
{
    private const string WebhookUrl = "https://zeitvertreib.vip/api/playerlist";
    private static readonly HttpClient HttpClient = new();
    private static volatile bool _isUploading;

    private TinyServer()
    {
    }

    public static TinyServer Instance { get; } = new();

    public void UploadPlayerListToBackend(List<TinyPlayer> playerList)
    {
        if (_isUploading)
        {
            Logger.Debug("Playerlist upload already in progress, skipping", Plugin.Instance.Config!.Debug);
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await UploadPlayerListInternal(playerList);
            }
            catch (Exception ex)
            {
                Logger.Error($"Background playerlist upload failed: {ex}");
            }
        });
    }

    private static async Task UploadPlayerListInternal(List<TinyPlayer> playerList)
    {
        if (_isUploading) return;
        _isUploading = true;

        try
        {
            // Build the request payload using the PlayerlistPostRequest type
            PlayerlistPostRequest payload = new()
            {
                Players = playerList.ConvertAll(p => new PlayerlistPostRequestItem
                {
                    Name = p.Name,
                    UserId = p.UserId,
                    Team = p.Team
                })
            };

            string json = JsonConvert.SerializeObject(payload);

            Logger.Debug($"Uploading to endpoint: {WebhookUrl}", Plugin.Instance.Config!.Debug);
            Logger.Debug($"Payload: {json}", Plugin.Instance.Config!.Debug);

            using HttpRequestMessage requestMessage = new(HttpMethod.Post, WebhookUrl);
            requestMessage.Content = new StringContent(json, Encoding.UTF8, "application/json");
            if (!string.IsNullOrEmpty(Plugin.Instance.Config!.ApiKey))
                requestMessage.Headers.Add("Authorization", $"Bearer {Plugin.Instance.Config.ApiKey}");
            HttpResponseMessage response = await HttpClient.SendAsync(requestMessage);

            if (response.IsSuccessStatusCode)
            {
                Logger.Info($"Sent playerlist ({playerList.Count})!");
            }
            else
            {
                string responseText = await response.Content.ReadAsStringAsync();
                Logger.Error(
                    $"Failed to send playerlist to webhook: {response.StatusCode} - {response.ReasonPhrase}. Response: {responseText}");
            }
        }
        catch (Exception ex)
        {
            Logger.Error($"Error sending playerlist to webhook: {ex.Message}");
        }
        finally
        {
            _isUploading = false;
        }
    }
}

public class TinyPlayer(string name, string userId, string team)
{
    public string Name { get; } = name;
    public string UserId { get; } = userId;
    public string Team { get; } = team;
}