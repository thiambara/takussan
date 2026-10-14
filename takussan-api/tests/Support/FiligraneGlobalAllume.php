<?php

namespace Tests\Support;

use App\Domain\Features\Flag;
use App\Models\FeatureFlag;

/**
 * TCK-633 (lot A) — allume le drapeau global `media_watermark` pour une classe écrite quand le
 * filigrane suivait le seul réglage d'agence. Sans lui, ces tests éprouveraient la plateforme
 * ÉTEINTE — le défaut — et non la règle qu'ils nomment.
 *
 * Laravel appelle `setUp<NomDuTrait>()` APRÈS `RefreshDatabase` (`setUpTraits()`) : la ligne est
 * posée dans la transaction du test, avant que la valeur n'ait été lue pour ce cycle.
 */
trait FiligraneGlobalAllume
{
    protected function setUpFiligraneGlobalAllume(): void
    {
        FeatureFlag::query()->updateOrCreate(
            ['key' => Flag::MediaWatermark->value],
            ['label' => Flag::MediaWatermark->value, 'enabled' => true, 'segments_json' => []],
        );
        app()->forgetScopedInstances();
    }
}
