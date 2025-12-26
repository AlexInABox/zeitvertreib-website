using System.ComponentModel;

namespace FakeRank;

public class Translation
{
    public string RefreshButtonLabel { get; set; } = "FakeRank aktualisieren...";
    public string AdminRefreshButtonLabel { get; set; } = "Für alle Spieler aktualisieren...";

    [Description("The hint description for the keybind setting")]
    public string RefreshButtonHint { get; set; } =
        "Aktualisiert deinen FakeRank nachdem du ihn auf der Website geändert hast.";

    [Description("Header text for the fakerank settings group")]
    public string GroupHeader { get; set; } = "FakeRank";
}