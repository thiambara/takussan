<?php

namespace App\Http\Requests\Concerns;

use App\Services\Radar\Targets\InvalidRadarTargetCriteria;
use App\Services\Radar\Targets\RadarTargetCriteria;

/**
 * TCK-2468 — les critères d'une cible passent par {@see RadarTargetCriteria}, le seul juge : un refus devient un 422 codé
 * (`radar.targets.*`, `params.field`), rien n'est enregistré. Partagé par la création et la modification.
 */
trait NormalizesRadarTargetCriteria
{
    /** @var array<string, mixed>|null les critères normalisés ; null s'ils n'ont pas été envoyés */
    private ?array $normalizedCriteria = null;

    protected function passedValidation(): void
    {
        if (! $this->has('criteria')) {
            return;
        }
        try {
            $this->normalizedCriteria = RadarTargetCriteria::normalize($this->validated('criteria'));
        } catch (InvalidRadarTargetCriteria $e) {
            abort_code(422, $e->errorCode, $e->params);
        }
    }

    /** @return array<string, mixed>|null */
    public function criteria(): ?array
    {
        return $this->normalizedCriteria;
    }
}
