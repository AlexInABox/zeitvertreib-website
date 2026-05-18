using System;
using HarmonyLib;
using LabApi.Features;
using LabApi.Features.Console;
using LabApi.Loader.Features.Plugins;

namespace Audited;

// ReSharper disable once ClassNeverInstantiated.Global
public class Plugin : Plugin<Config>
{
    private Harmony _harmony;
    public override string Name { get; } = "Audited";

    public override string Description { get; } =
        "Logs all admin Remote Admin commands to a Discord channel via webhook.";

    public override string Author { get; } = "peanutmow";
    public override Version Version { get; } = new(1, 0, 0);
    public override Version RequiredApiVersion { get; } = new(LabApiProperties.CompiledVersion);

    public static Plugin Instance { get; private set; }

    public override void Enable()
    {
        Instance = this;

        if (Config == null)
        {
            Logger.Error("Config failed to load. Using defaults.");
            Config = new Config();
        }

        _harmony = new Harmony("com.zeitvertreib-website.audited");
        _harmony.PatchAll();

        Logger.Info("Enabled. Logging admin commands to Discord.");
    }

    public override void Disable()
    {
        _harmony.UnpatchAll(_harmony.Id);
        Logger.Info("Disabled.");
    }
}