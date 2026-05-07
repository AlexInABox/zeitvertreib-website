using System.ComponentModel;

namespace Informed;

public class Config
{
    public bool Debug { get; set; } = false;
    public string APIKey { get; set; } = "";
    public string BackendURL { get; set; } = "";

    [Description("The ID of the keybind setting. This should be unique for each plugin.")]
    public int Id { get; set; } = 300;
}