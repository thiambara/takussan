<?php

namespace App\Services\Accounting\StatementParser;

/**
 * TCK-2932 — les banques dont l'outil sait lire l'export SANS réglage : un préréglage de colonnes
 * CSV (même forme que `CsvDriver::DEFAULT_MAPPING`) ÉPROUVÉ sur un export réel du fournisseur.
 *
 * **D-67 (décision du porteur, 2026-10-06)** : aucun préréglage n'est écrit sans un export réel. Un
 * préréglage porte donc son fichier d'épreuve (`fixture`, chemin relatif à `base_path()`, export
 * anonymisé) ; un préréglage dont le fichier manque n'est PAS servi ({@see self::presets()}), et
 * `BankPresetRegistryTest` lit chaque fichier avec son préréglage. Aucun export n'a été fourni au
 * 2026-11-15 : la liste est vide, et seuls les formats sont servis.
 *
 * @phpstan-type Preset array{code: string, name: string, format: string, mapping: array<string, mixed>, fixture: string}
 */
class BankPresetRegistry
{
    /** @var list<Preset> */
    public const PRESETS = [];

    /** @return list<Preset> les préréglages déclarés, éprouvés ou non */
    public function declared(): array
    {
        return static::PRESETS;
    }

    /** @return list<Preset> les seuls préréglages dont le fichier d'épreuve existe */
    public function presets(): array
    {
        return array_values(array_filter(
            $this->declared(),
            fn (array $preset) => ($preset['fixture'] ?? '') !== '' && is_file(base_path($preset['fixture'])),
        ));
    }
}
