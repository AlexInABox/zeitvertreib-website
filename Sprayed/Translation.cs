using System.ComponentModel;

namespace Sprayed;

public class Translation
{
    [Description("The label for the keybind setting")]
    public string KeybindSettingLabel { get; set; } = "Place a spray!";

    [Description("The hint description for the keybind setting")]
    public string KeybindSettingHintDescription { get; set; } =
        "Press this key to place a spray on the wall you are looking at.";
}