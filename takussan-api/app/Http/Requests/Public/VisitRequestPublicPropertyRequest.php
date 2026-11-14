<?php

namespace App\Http\Requests\Public;

use App\Models\Enums\VisitType;
use App\Models\Enums\VisitWindow;
use App\Rules\CreneauDeVisite;
use App\Rules\InstantIso;
use App\Rules\JourIso;
use App\Rules\TelephoneJoignable;
use App\Rules\TrancheDeVisite;
use App\Support\InstantRecu;
use App\Support\TelephoneSaisi;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de `PublicPropertyController::visitRequest()`, où les règles étaient
 * construites dans une variable locale puis passées à `$request->validate($rules)`.
 *
 * La conditionnalité est intacte : un visiteur **anonyme** doit se nommer et se joindre, un
 * visiteur **authentifié** non — le contrôleur retombe alors sur les coordonnées de son compte.
 *
 * TCK-590 — sans compte, **nom + téléphone** suffisent : l'e-mail devient facultatif (il était
 * exigé, et le téléphone, exigé aussi, n'était pas validé). Le téléphone suit la règle du profil.
 * L'heure tombe sur un créneau de la grille, à Dakar (`CreneauDeVisite`).
 *
 * TCK-2502 — À LA PLACE de `scheduled_at`, un jour (`date`, `Y-m-d` à Dakar) et une tranche
 * (`preferred_window`) : exactement l'un des deux, sinon 422. Le jour est dans les 30 prochains
 * jours, et une tranche déjà entamée aujourd'hui est refusée (`TrancheDeVisite`).
 */
class VisitRequestPublicPropertyRequest extends PublicPropertySlugRequest
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        if ($this->has('visitor_phone')) {
            $this->merge(['visitor_phone' => TelephoneSaisi::normaliser($this->input('visitor_phone'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Le 404 sur un slug inconnu doit primer sur le 422 : cf. l'en-tête de la classe de base.
        $this->property();

        $anonyme = $this->user() === null;
        $presence = $anonyme ? 'required' : 'nullable';

        return [
            // `nullable` : un `scheduled_at: null` envoyé avec une tranche vaut absent (revue) ;
            // seul, `required_without_all` le refuse toujours.
            'scheduled_at' => ['nullable', 'required_without_all:date,preferred_window', 'prohibits:date,preferred_window', 'date', new InstantIso, 'after:now', new CreneauDeVisite],
            'date' => ['required_with:preferred_window', 'prohibits:scheduled_at', 'date_format:Y-m-d', new JourIso, new TrancheDeVisite],
            'preferred_window' => ['required_with:date', 'prohibits:scheduled_at', Rule::enum(VisitWindow::class), new TrancheDeVisite],
            'type' => ['nullable', Rule::enum(VisitType::class)],
            'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:240'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'visitor_name' => [$presence, 'string', 'max:120'],
            'visitor_email' => ['nullable', 'email', 'max:255'],
            'visitor_phone' => [$presence, 'string', 'max:30', new TelephoneJoignable, new TelephoneSaisi],
            'source' => ContactLeadPublicRequest::ATTRIBUTION,
            'medium' => ContactLeadPublicRequest::ATTRIBUTION,
        ];
    }

    /**
     * TCK-2743 — l'heure reçue, ramenée à l'instant qu'elle désigne ({@see InstantRecu}) : la règle, la
     * comparaison et l'écriture lisent le même instant.
     */
    public function scheduledAt(): ?CarbonImmutable
    {
        return InstantRecu::ouNul($this->validated('scheduled_at'));
    }
}
