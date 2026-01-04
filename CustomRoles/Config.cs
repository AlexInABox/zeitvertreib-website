using System.ComponentModel;

namespace CustomRoles;

public sealed class Config
{
    [Description("The cooldown duration for the medic ability in seconds.")]
    public float CooldownDuration { get; set; } = 300f;

    public int KeybindId { get; set; } = 205;
    public bool IsEnabled { get; set; } = true;

    public bool Debug { get; set; } = false;
}