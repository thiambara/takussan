<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Public\ContactLeadPublicRequest;
use App\Models\Enums\VisitType;
use App\Models\Property;
use App\Rules\ClientDeLAgence;
use App\Rules\CreneauDeVisite;
use App\Rules\PersonnelDeLAgence;
use App\Rules\TelephoneJoignable;
use App\Support\TelephoneSaisi;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PropertyVisitController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 *
 * TCK-590 — les règles dépendent de QUI planifie :
 *
 *   · **le personnel de l'agence du bien** (ou un super-admin) planifie pour un client : `customer_id` est une fiche DE L'AGENCE DU BIEN
 *     (`ClientDeLAgence`), `agent_id` un membre de son personnel (`PersonnelDeLAgence`), et sans
 *     fiche le prospect se donne par nom + téléphone ;
 *   · **tout autre** réserve pour lui-même : `customer_id`, `agent_id` et `visitor_*` sont
 *     IGNORÉS — dérivés de lui par le contrôleur (contrainte 3) —, et l'heure tombe sur la grille.
 *
 * `exists:customers,id` et `exists:users,id` acceptaient la fiche et le compte d'une autre agence.
 */
class StorePropertyVisitRequest extends BaseFormRequest
{
    private ?Property $property = null;

    private bool $propertyResolved = false;

    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function property(): ?Property
    {
        if (! $this->propertyResolved) {
            $this->propertyResolved = true;
            $id = $this->input('property_id');
            $this->property = is_numeric($id) ? Property::query()->find((int) $id) : null;
        }

        return $this->property;
    }

    /**
     * L'appelant planifie-t-il pour un tiers : super-admin, ou personnel ACTIF de l'agence du bien ?
     *
     * Le CRÉATEUR du bien n'y figure plus (vérification adverse, B1 et B2) : `property.user_id`
     * est aussi le bailleur propriétaire, et l'agent qui a créé le bien puis a quitté l'agence.
     * Classés gestionnaires, ils lisaient n'importe quelle fiche client de l'agence par
     * `customer_id` — la réponse en recopiait nom, téléphone et e-mail — et faisaient partir une
     * visite CONFIRMÉE, donc un SMS, vers un numéro libre, sur un bien même privé. La contrainte 4
     * ne laisse partir un SMS qu'après un geste de L'AGENCE. Le créateur non-personnel réserve
     * pour lui-même, comme tout visiteur.
     */
    public function managesProperty(): bool
    {
        $user = $this->user();
        $property = $this->property();

        return $user !== null && $property !== null && (
            $user->isSuperAdmin()
            || PersonnelDeLAgence::personnelActifDe($user, $property->agency_id)
        );
    }

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
        $manager = $this->managesProperty();
        $agencyId = $this->property()?->agency_id;

        return [
            'property_id' => ['required', 'exists:properties,id'],
            'customer_id' => $manager
                ? ['nullable', 'integer', new ClientDeLAgence($agencyId)]
                : ['nullable'],
            'agent_id' => $manager
                ? ['nullable', 'integer', new PersonnelDeLAgence($agencyId)]
                : ['nullable'],
            'scheduled_at' => $manager
                ? ['required', 'date', 'after:now']
                : ['required', 'date', 'after:now', new CreneauDeVisite],
            'type' => ['nullable', Rule::enum(VisitType::class)],
            // Vérification adverse (m5) — le plafond de la route publique : une visite de 100 000
            // minutes, une fois confirmée, bloquait le bien.
            'duration_minutes' => ['nullable', 'integer', 'min:5', 'max:240'],
            'visitor_name' => $manager
                ? ['nullable', 'required_without:customer_id', 'string', 'max:120']
                : ['nullable', 'string'],
            'visitor_phone' => $manager
                ? ['nullable', 'required_without:customer_id', 'string', 'max:30', new TelephoneJoignable, new TelephoneSaisi]
                : ['nullable', 'string'],
            'visitor_email' => ['nullable', 'email'],
            'notes' => ['nullable', 'string'],
            'source' => ContactLeadPublicRequest::ATTRIBUTION,
            'medium' => ContactLeadPublicRequest::ATTRIBUTION,
        ];
    }
}
