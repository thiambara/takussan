<?php

namespace App\Http\Requests\Public;

/**
 * TCK-590 — les créneaux d'une journée : `date=AAAA-MM-JJ`, aujourd'hui ou plus tard, à 60 jours
 * au plus (au-delà, la grille n'a rien de plus à dire, et l'endpoint reste borné).
 */
class VisitSlotsPublicPropertyRequest extends PublicPropertySlugRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $this->property();

        return [
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today', 'before_or_equal:+60 days'],
        ];
    }
}
