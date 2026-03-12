namespace Push;

public class Translation
{
    // General Text
    public string KeybindSettingLabel { get; set; } = "Push someone in front of you!";

    public string KeybindSettingHintDescription { get; set; } =
        "Pressing this will push the player in front of you! Don't be mean :3";

    public string PlayerPushCooldownHint { get; set; } =
        "You cannot push yet! <color=yellow>Cooldown is active.</color> $remainingCooldown$ seconds remaining...";
}