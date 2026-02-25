using System;
using LabApi.Features;
using LabApi.Features.Console;
using LabApi.Loader;
using LabApi.Loader.Features.Plugins;

namespace Protected;

// ReSharper disable once ClassNeverInstantiated.Global
public class Plugin : Plugin<Config>
{
    public override string Name { get; } = "Protected";
    public override string Description { get; } = "Custom implementation of spawn protection for Zeitvertreib.";
    public override string Author { get; } = "AlexInABox";
    public override Version Version { get; } = new(1, 0, 0);
    public override Version RequiredApiVersion { get; } = new(LabApiProperties.CompiledVersion);

    public static Plugin Instance { get; private set; }

    public override void Enable()
    {
        Instance = this;
        if (Config == null)
        {
            Logger.Error("There is an error while loading the config. Reverting to the default one.");
            Config = new Config();
        }

        EventHandlers.RegisterEvents();
    }

    public override void Disable()
    {
        EventHandlers.UnregisterEvents();
    }
}