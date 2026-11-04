<?php

namespace App\Ai\Usages;

use App\Ai\Agents\RadarDemandTargets;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Services\Ai\AiUsage;

/**
 * TCK-2470 (ADR-0087 §6, ADR-0088 §4) — regrouper la demande sans résultat en un jeu borné de cibles `demand`, et le tenir
 * à jour chaque nuit.
 *
 * - Classe `publique` : l'entrée n'est faite que de critères structurés (lieux du référentiel, types, prix, chambres) et de
 *   comptes. Ni texte saisi par un visiteur, ni compte, ni identifiant (`RadarDemandSignals`).
 * - Aucun contenu externe : les signaux sont des agrégats calculés par le code.
 * - Jugé au nom de l'opérateur du réglage (`radar_demand_settings.operator_id`), comme une source de la collecte (ADR-0080 §2).
 * - Aucun cache : un passage n'appelle le modèle que si les signaux ont changé (`signals_signature`).
 */
final class RadarDemandTargetsUsage implements AiUsage
{
    public const KEY = 'radar.cibles';

    public function key(): string
    {
        return self::KEY;
    }

    public function role(): AiModelRole
    {
        return AiModelRole::Extraction;
    }

    public function agentClass(): string
    {
        return RadarDemandTargets::class;
    }

    public function promptVersion(): int
    {
        return 1;
    }

    public function maxDataClass(): AiDataClass
    {
        return AiDataClass::Publique;
    }

    public function authority(): Capability|PlatformAbility
    {
        return PlatformAbility::RadarOperate;
    }

    public function dailyBudgetUsd(): ?string
    {
        return '0.50';
    }

    public function cacheTtlSeconds(): int
    {
        return 0;
    }

    public function readsExternalContent(): bool
    {
        return false;
    }
}
