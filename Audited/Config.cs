using System.Collections.Generic;
using System.ComponentModel;

namespace Audited;

public class Config
{
    [Description("Discord webhook URL to post audit log entries to.")]
    public string WebhookUrl { get; set; } = "";

    [Description("Steam IDs of team members whose commands should NOT be logged (e.g. 76561198000000000@steam).")]
    public List<string> ExemptSteamIds { get; set; } = [];
}
