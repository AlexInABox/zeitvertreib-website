using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;
using Zeitvertreib.Types;
using Logger = LabApi.Features.Console.Logger;

namespace Reporter;

public class TinyServer
{
    private const string WebhookUrl = "https://zeitvertreib.vip/api/playerlist";

    private TinyServer()
    {
    }

    public static TinyServer Instance { get; } = new();

    public async void UploadPlayerListToBackend(List<TinyPlayer> playerList)
    {
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

            using (HttpClient client = new())
            {
                // Add authorization header if API key is configured
                if (!string.IsNullOrEmpty(Plugin.Instance.Config!.ApiKey))
                    client.DefaultRequestHeaders.Add("Authorization", $"Bearer {Plugin.Instance.Config.ApiKey}");

                StringContent content = new(json, Encoding.UTF8, "application/json");
                HttpResponseMessage response = await client.PostAsync(WebhookUrl, content);

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
        }
        catch (Exception ex)
        {
            Logger.Error($"Error sending playerlist to webhook: {ex.Message}");
        }
    }
}

public class TinyPlayer(string name, string userId, string team)
{
    public string Name { get; } = name;
    public string UserId { get; } = userId;
    public string Team { get; } = team;
}