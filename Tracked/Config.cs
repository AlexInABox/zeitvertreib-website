using System.ComponentModel;

namespace Tracked;

public class Config
{
    public bool Debug { get; set; } = false;

    public int CoinEscapeMultiplier { get; set; } = 3;

    [Description(
        "The # of the current round. (Or next round if the server is already waiting for players!) The value increments by itself but can be manually adjusted to create an offset.")]
    public int CurrentRoundNumber { get; set; } = 0;

    public string EndpointUrl { get; set; } = "https://example.com/upload";
    public string Apikey { get; set; } = "1234";
}