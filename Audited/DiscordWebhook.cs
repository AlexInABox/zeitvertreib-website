using System;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;
using Logger = LabApi.Features.Console.Logger;

namespace Audited;

public static class DiscordWebhook
{
    private static readonly HttpClient Http = new();

    public static void Send(string staffName, string staffId, string translatedCommand)
    {
        string webhookUrl = Plugin.Instance?.Config?.WebhookUrl ?? "";
        if (string.IsNullOrWhiteSpace(webhookUrl))
            return;

        var payload = new
        {
            embeds = new[]
            {
                new
                {
                    color = 0x3b82f6,
                    description = $"**{staffName}** `{staffId}`\n```{translatedCommand}```"
                }
            },
            flags = 4096,
            allowed_mentions = new { parse = Array.Empty<string>() }
        };

        StringContent content = new(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

        _ = Http.PostAsync(webhookUrl, content).ContinueWith(task =>
        {
            if (task.IsFaulted)
                Logger.Error($"Failed to send Discord message: {task.Exception?.GetBaseException().Message}");
        });
    }
}