using System.ComponentModel;

namespace Sprayed;

public class Translation
{
    [Description("The label for the keybind setting")]
    public string KeybindSettingLabel { get; set; } = "Place a spray!";

    [Description("The hint description for the keybind setting")]
    public string KeybindSettingHintDescription { get; set; } =
        "Press this key to place a spray on the wall you are looking at.";

    [Description("Message shown when spray ability is on cooldown")]
    public string AbilityOnCooldown { get; set; } = "<color=yellow>Your Spray is on cooldown! ({remaining}s)</color>";

    [Description("Message shown when spray is successfully placed")]
    public string AbilityUsed { get; set; } = "<color=green>Spray has been placed!</color>";

    [Description("Message shown when no spray is found")]
    public string NoSprayFound { get; set; } = "<b>Set a custom spray at example.com ^^</b>";

    [Description("Header text for the spray settings group")]
    public string SprayGroupHeader { get; set; } = "CS:GO (Zeitvertreib) Spray";

    [Description("Label for the reload spray button")]
    public string ReloadSprayButtonLabel { get; set; } = "Reload Spray";

    [Description("Message shown when sprays are successfully refreshed")]
    public string SpraysRefreshed { get; set; } = "<color=green>Refreshed your spray!</color>";
}