using System.Threading.Tasks;
using Discord;
using Discord.WebSocket;
using LabApi.Features.Wrappers;
using Logger = LabApi.Features.Console.Logger;

namespace Reporter;

public class TinyBot
{
    private static int _lastPlayerCount = -1;
    private readonly DiscordSocketClient _client = new();

    private TinyBot()
    {
    }

    public static TinyBot Instance { get; } = new();

    public async Task Start(string token)
    {
        await _client.LoginAsync(TokenType.Bot, token);
        await _client.StartAsync();
        _ = _client.SetStatusAsync(UserStatus.Idle);
        _ = _client.SetActivityAsync(new CustomStatusGame("Warte auf Spieler.."));
        Logger.Debug("Discord bot started.");
    }

    public void UpdateStatus(int playerCount)
    {
        if (playerCount == _lastPlayerCount)
            return;

        _lastPlayerCount = playerCount;

        if (playerCount == 0)
        {
            _ = _client.SetStatusAsync(UserStatus.Idle);
            _ = _client.SetActivityAsync(new CustomStatusGame("Warte auf Spieler.."));
            return;
        }

        _ = _client.SetStatusAsync(UserStatus.Online);
        _ = _client.SetActivityAsync(new CustomStatusGame($"{playerCount}/{Server.MaxPlayers}"));
    }
}