using System.ComponentModel;

namespace Reporter;

public class Config
{
    public bool Debug { get; set; } = false;

    [Description("Discord bot token.")] public string Token { get; set; } = "";

    [Description("API Key to acces the webserver. (Set to an empty string to disable.")]
    public string ApiKey { get; set; } = "superSecretPassword";
}