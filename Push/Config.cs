using System.ComponentModel;

namespace Push;

public class Config
{
    public bool Debug { get; set; }

    public int PlayerPushHintDuration { get; set; } = 3;

    public int PlayerGotPushedHintDuration { get; set; } = 2;

    public float PushForce { get; set; } = 8.0f;


    [Description("The unique id of the setting.")]
    public int KeybindId { get; set; } = 202;

    public int StrengthDropdownId { get; set; } = 203;
}