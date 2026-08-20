<?php

namespace App\Http\Requests\Public;

use App\Models\Enums\VisitType;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de `PublicPropertyController::visitRequest()`, où les règles étaient
 * construites dans une variable locale puis passées à `$request->validate($rules)`.
 *
 * La conditionnalité est intacte : un visiteur **anonyme** doit se nommer et se joindre, un
 * visiteur **authentifié** non — le contrôleur retombe alors sur les coordonnées de son compte.
 */
class VisitRequestPublicPropertyRequest extends PublicPropertySlugRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Le 404 sur un slug inconnu doit primer sur le 422 : cf. l'en-tête de la classe de base.
        $this->property();

        $anonyme = $this->user() === null;
        $presence = $anonyme ? 'required' : 'nullable';

        return [
            'scheduled_at' => ['required', 'date', 'after:now'],
            'type' => ['nullable', Rule::enum(VisitType::class)],
            'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:240'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'visitor_name' => [$presence, 'string', 'max:120'],
            'visitor_email' => [$presence, 'email'],
            'visitor_phone' => [$presence, 'string', 'max:30'],
        ];
    }
}
