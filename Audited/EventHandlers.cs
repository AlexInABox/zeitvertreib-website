using System.Collections.Generic;
using System.Reflection;
using HarmonyLib;
using RemoteAdmin;

namespace Audited;

[HarmonyPatch]
public static class RemoteAdminCommandPatch
{
    // these are already logged elsewhere :3
    private static readonly string[] ExcludedPrefixes =
    [
        "ban",
        "unban",
        "warn",
        "mute",
        "unmute",
        "forceban",
        "kick"
    ];

    [HarmonyTargetMethod]
    // ReSharper disable once ArrangeTypeMemberModifiers
    static MethodBase TargetMethod()
    {
        return AccessTools.Method("CommandProcessor:ProcessQuery")
               ?? AccessTools.Method("RemoteAdmin.CommandProcessor:ProcessQuery");
    }

    // ReSharper disable once ArrangeTypeMemberModifiers
    static void Postfix(string q, CommandSender sender)
    {
        if (sender is not PlayerCommandSender)
            return;

        if (string.IsNullOrWhiteSpace(q))
            return;

        string trimmed = q.TrimStart();
        int spaceIndex = trimmed.IndexOf(' ');
        string commandName = (spaceIndex >= 0 ? trimmed.Substring(0, spaceIndex) : trimmed).ToLowerInvariant();

        // prevent stupid heartbeat command omg
        if (commandName.StartsWith("$"))
            return;

        foreach (string excluded in ExcludedPrefixes)
            if (commandName == excluded)
                return;

        string senderId = sender.SenderId ?? "";
        List<string> exempt = Plugin.Instance?.Config?.ExemptSteamIds;
        if (exempt != null && exempt.Contains(senderId))
            return;

        DiscordWebhook.Send(
            sender.Nickname ?? "Unbekannt",
            sender.SenderId ?? "Unbekannt",
            CommandTranslator.Translate(q)
        );
    }
}