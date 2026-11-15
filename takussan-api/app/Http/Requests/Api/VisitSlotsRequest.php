<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Property;
use App\Rules\JourIso;
use App\Rules\PersonnelDeLAgence;

/**
 * TCK-2585 — les créneaux libres d'une journée pour la console : `property_id`, `date=AAAA-MM-JJ`
 * (aujourd'hui à 60 jours, comme la route publique), `agent_id` facultatif (personnel de l'agence du
 * bien ; à défaut, l'appelant), `duration_minutes` facultatif (la durée de la visite à placer).
 *
 * Réservé au personnel qui gère le bien (`StorePropertyVisitRequest::managesProperty`), pour tout
 * bien de son agence, publié ou non. Un bien absent et un bien d'une autre agence rendent le MÊME
 * 403, avant toute validation.
 */
class VisitSlotsRequest extends BaseFormRequest
{
    private ?Property $resolvedProperty = null;

    private bool $propertyResolved = false;

    public function authorize(): bool
    {
        $user = $this->user();
        $property = $this->property();

        return $user !== null && $property !== null && (
            $user->isSuperAdmin()
            || PersonnelDeLAgence::personnelActifDe($user, $property->agency_id)
        );
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'property_id' => ['required', 'integer'],
            'date' => ['required', 'date_format:Y-m-d', new JourIso, 'after_or_equal:today', 'before_or_equal:+60 days'],
            'agent_id' => ['nullable', 'integer', new PersonnelDeLAgence($this->property()?->agency_id)],
            // TCK-2744 (contre-vérification) — la durée de la visite à placer, bornée comme à
            // l'écriture : la grille juge chaque créneau sur elle. Absente : 30 min.
            'duration_minutes' => ['nullable', 'integer', 'min:5', 'max:'.StorePropertyVisitRequest::MAX_DURATION_MINUTES],
        ];
    }

    public function property(): ?Property
    {
        if (! $this->propertyResolved) {
            $this->propertyResolved = true;
            $id = $this->query('property_id');
            $this->resolvedProperty = is_scalar($id) && ctype_digit((string) $id)
                ? Property::query()->find((int) $id)
                : null;
        }

        return $this->resolvedProperty;
    }
}
