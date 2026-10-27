<?php

namespace App\Services\Ai;

use App\Models\Enums\AiDataClass;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2383 — ce qu'une fonctionnalité demande au socle. `input` est déjà mis en forme par l'usage,
 * le contenu externe délimité comme une donnée (ADR-0076 §10). `dataClasses` déclare ce que la
 * charge contient ; `link` impose un maillon (évaluation d'un candidat, test de connexion).
 */
final readonly class AiRequest
{
    /**
     * @param  list<AiDataClass>  $dataClasses
     * @param  list<mixed>  $attachments  pièces jointes du SDK (`Laravel\Ai\Files\*`)
     */
    public function __construct(
        public string $usageKey,
        public string $input,
        public array $dataClasses = [AiDataClass::Publique],
        public ?User $actor = null,
        public ?int $agencyId = null,
        public ?Model $subject = null,
        public array $attachments = [],
        public ?ModelLink $link = null,
        public bool $evaluation = false,
    ) {}
}
