using System;
using LabApi.Features;
using LabApi.Features.Console;
using LabApi.Loader;
using LabApi.Loader.Features.Plugins;

namespace Flipped;

// ReSharper disable once ClassNeverInstantiated.Global
public class Plugin : Plugin<Config>
{
    public override string Name { get; } = "Flipped";

    public override string Description { get; } =
        "Whenever a player flips a coin, a random (sometimes dangerous) event occurs.";

    public override string Author { get; } = "peanutmow";
    public override Version Version { get; } = new(1, 0, 0);
    public override Version RequiredApiVersion { get; } = new(LabApiProperties.CompiledVersion);

    public Translation Translation { get; private set; }

    public static Plugin Instance { get; private set; }

    public override void Enable()
    {
        Instance = this;

        if (Config == null)
        {
            Logger.Error("[CoinFlip] Failed to load config. Using defaults.");
            Config = new Config();
        }

        if (!this.TryLoadConfig("translation.yml", out Translation translation))
        {
            Logger.Warn("[CoinFlip] Failed to load translation. Using defaults.");
            translation = new Translation();
        }

        Translation = translation;

        EventHandlers.RegisterEvents();
        Logger.Info("[CoinFlip] Plugin enabled.");
    }

    public override void Disable()
    {
        EventHandlers.UnregisterEvents();
        Logger.Info("[CoinFlip] Plugin disabled.");
    }
}
