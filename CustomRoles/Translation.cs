namespace CustomRoles;

public class Translation
{
    public string KeybindSettingLabel { get; set; } = "Benutze deine Medic-Fähigkeit!";

    public string KeybindSettingHintDescription { get; set; } =
        "Drücke dies, um deine Medic-Fähigkeit zu aktivieren. Ich habe keine Ahnung, was sie tut, aber es klingt cool!";

    public string AbilityOnCooldown { get; set; } =
        "<color=yellow>Deine Medic-Fähigkeit ist gerade im Cooldown! Bitte warte, bevor du sie erneut benutzt.</color>";

    public string AbilityUsed { get; set; } = "<color=green>Du benutzt deine Medic-Fähigkeit!</color>";
}