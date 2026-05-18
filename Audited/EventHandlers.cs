using System;
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

    [ThreadStatic]
    internal static string PendingStaffName;
    [ThreadStatic]
    internal static string PendingStaffId;
    [ThreadStatic]
    internal static string PendingTranslated;

    [HarmonyTargetMethod]
    // ReSharper disable once ArrangeTypeMemberModifiers
    static MethodBase TargetMethod()
    {
        return AccessTools.Method("CommandProcessor:ProcessQuery")
               ?? AccessTools.Method("RemoteAdmin.CommandProcessor:ProcessQuery");
    }

    // ReSharper disable once ArrangeTypeMemberModifiers
    static void Prefix(string q, CommandSender sender)
    {
        PendingStaffName = null;
        PendingStaffId = null;
        PendingTranslated = null;

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

        PendingStaffName = sender.Nickname ?? "Unbekannt";
        PendingStaffId = sender.SenderId ?? "Unbekannt";
        PendingTranslated = CommandTranslator.Translate(q);
    }

    static void Postfix()
    {
        PendingStaffName = null;
        PendingStaffId = null;
        PendingTranslated = null;
    }
}

/// Patches PlayerCommandSender.RaReply to detect whether a command succeeded.
[HarmonyPatch]
public static class RaReplyPatch
{
    [HarmonyTargetMethod]
    // ReSharper disable once ArrangeTypeMemberModifiers
    static MethodBase TargetMethod()
    {
        return AccessTools.Method("PlayerCommandSender:RaReply")
               ?? AccessTools.Method("RemoteAdmin.PlayerCommandSender:RaReply");
    }

    // ReSharper disable once ArrangeTypeMemberModifiers
    static void Prefix(bool success)
    {
        if (!success)
            return;

        string translated = RemoteAdminCommandPatch.PendingTranslated;
        if (translated == null)
            return;

        // Clear to prevent duplicate sends if RaReply is called more than once
        RemoteAdminCommandPatch.PendingTranslated = null;

        DiscordWebhook.Send(
            RemoteAdminCommandPatch.PendingStaffName,
            RemoteAdminCommandPatch.PendingStaffId,
            translated
        );
    }
}