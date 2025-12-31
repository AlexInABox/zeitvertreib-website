using System.ComponentModel;

namespace ZombieCake;

public class Translation
{
    [Description("The label for the keybind setting")]
    public string KeybindSettingLabel { get; set; } = "Place a spray!";

    [Description("The hint description for the keybind setting")]
    public string KeybindSettingHintDescription { get; set; } =
        "Press this key to place a spray on the wall you are looking at.";

    [Description("Header text for the spray settings group")]
    public string SprayGroupHeader { get; set; } = "CS:GO (Zeitvertreib) Spray";

    [Description("Label for the reload spray button")]
    public string ReloadSprayButtonLabel { get; set; } = "Reload Spray";
}