using System.ComponentModel;

namespace Flipped;

public class Config
{
    [Description("Ob Debug-Meldungen in der Konsole ausgegeben werden.")]
    public bool Debug { get; set; } = false;

    [Description("Abklingzeit in Sekunden, bevor ein Spieler die Münze erneut werfen kann.")]
    public int CooldownSeconds { get; set; } = 30;

    // --- Outcome Weights ---
    [Description("Gewicht für 'Nichts passiert'. Höher = häufiger.")]
    public int WeightNothing { get; set; } = 10;

    [Description("Gewicht für 'HP verlieren'.")]
    public int WeightLoseHp { get; set; } = 20;

    [Description("Gewicht für 'Schild erhalten'.")]
    public int WeightGainShield { get; set; } = 10;

    [Description("Gewicht für 'Zufälliger Effekt'.")]
    public int WeightRandomEffect { get; set; } = 25;

    [Description("Gewicht für 'Position tauschen'.")]
    public int WeightSwapPosition { get; set; } = 12;

    [Description("Gewicht für 'Explodieren / Sterben' (selten).")]
    public int WeightExplode { get; set; } = 5;

    [Description("Gewicht für 'Alle SCPs werden zu dir teleportiert' (sehr selten).")]
    public int WeightTeleportScps { get; set; } = 5;

    // --- Outcome Values ---
    [Description("Menge an HP, die beim 'HP verlieren'-Ergebnis abgezogen werden.")]
    public float HpLossAmount { get; set; } = 35f;

    [Description("Menge an Schutzpunkten (AHP), die beim 'Schild erhalten'-Ergebnis hinzugefügt werden.")]
    public float ShieldGainAmount { get; set; } = 25f;

    [Description("Dauer in Sekunden, wie lange der zufällige Effekt anhält.")]
    public float EffectDuration { get; set; } = 15f;

    [Description("Gewicht für 'HP heilen'.")]
    public int WeightGainHp { get; set; } = 10;

    [Description("Gewicht für 'Zu einem zufälligen Spieler teleportieren'.")]
    public int WeightTeleportRandom { get; set; } = 15;

    [Description("Gewicht für 'Zufälliges Item erhalten'.")]
    public int WeightGiveItem { get; set; } = 8;

    [Description("Menge an HP, die beim 'HP heilen'-Ergebnis wiederhergestellt werden.")]
    public float HpGainAmount { get; set; } = 20f;

    [Description("Gewicht für 'Gefesselt' (Spieler wird kurz mit Handschellen fixiert).")]
    public int WeightCuffed { get; set; } = 10;

    [Description("Dauer in Sekunden, wie lange der Spieler gefesselt bleibt.")]
    public float CuffDuration { get; set; } = 12f;

    [Description("Gewicht für 'Krebs' (Spieler wird für sehr lange Zeit vergiftet). Sehr selten.")]
    public int WeightCancer { get; set; } = 1;
}
