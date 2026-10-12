<?php

namespace App\Services\Media;

/**
 * TCK-633 (lot A) — la valeur du drapeau global `media_watermark` pour UN cycle : une requête
 * HTTP, ou un job. Liée en `scoped` par `AgencyWatermarkContext::globallyEnabled()` : le worker
 * oublie les instances `scoped` entre deux jobs (`QueueServiceProvider`, `forgetScopedInstances()`),
 * si bien qu'un drapeau basculé dans la console vaut dès le job suivant, sans redémarrer le worker.
 */
final class MediaWatermarkSwitch
{
    public function __construct(public readonly bool $enabled) {}
}
