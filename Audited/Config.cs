using System.ComponentModel;

namespace Audited;

public class Config
{
    [Description("Discord webhook URL to post audit log entries to.")]
    public string WebhookUrl { get; set; } = "";
}
