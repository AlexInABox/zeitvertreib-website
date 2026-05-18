using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;
using Logger = LabApi.Features.Console.Logger;

namespace Audited;

public static class DiscordWebhook
{
    private static readonly HttpClient Http = new();

    private static readonly HashSet<string> RedCommands = new(StringComparer.OrdinalIgnoreCase)
    {
        "give",
        "godmode",
        "noclip",
    };

    private static readonly HashSet<string> YellowCommands = new(StringComparer.OrdinalIgnoreCase)
    {
        "pbc",
        "bc",
        "forceclass",
    };

    private static int GetColor(string translatedCommand)
    {
        int spaceIndex = translatedCommand.IndexOf(' ');
        string commandName = spaceIndex >= 0
            ? translatedCommand.Substring(0, spaceIndex)
            : translatedCommand;

        if (RedCommands.Contains(commandName))
            return 0xef4444;

        if (YellowCommands.Contains(commandName))
            return 0xeab308;

        return 0x3b82f6;
    }

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
                    color = GetColor(translatedCommand),
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