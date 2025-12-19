using System.ComponentModel;

namespace Sprayed;

public class Config
{
    public bool Debug { get; set; } = false;

    [Description("The cooldown between sprays in seconds.")]
    public float CooldownDuration { get; set; } = 15f;

    public float Volume { get; set; } = 5f;

    public string SpraySoundEffectPath { get; set; } =
        "/home/container/.config/SCP Secret Laboratory/LabAPI/configs/7100/Sprayed/spray_sound_effect.ogg";

    public string BackendURL { get; set; } = "https://example.com/";
    public string BackendAPIToken { get; set; } = "your_api_token_here";
    public int KeybindId { get; set; } = 206;
}