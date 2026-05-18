using System.ComponentModel;

namespace Proximity;

public class Config
{
    public bool Debug { get; set; } = false;

    [Description("The unique id of the setting.")]
    public int KeybindId { get; set; } = 606;
}