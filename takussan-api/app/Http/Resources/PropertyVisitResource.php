<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class PropertyVisitResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $fiche = $this->ficheClientLisible($request);
        // Passe 4 (M7″) — planifier pour une fiche recopie son nom, son téléphone et son e-mail
        // dans `visitor_*` : sans la fiche, ils ne se lisent pas davantage par là. Une visite sans
        // fiche (demande publique) garde les siens.
        $visiteurLisible = $fiche || $this->customer_id === null;

        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'visitor_id' => $this->visitor_id,
            'customer_id' => $fiche ? $this->customer_id : null,
            'agent_id' => $this->agent_id,
            'visitor_name' => $visiteurLisible ? $this->visitor_name : null,
            'visitor_phone' => $visiteurLisible ? $this->visitor_phone : null,
            'visitor_email' => $visiteurLisible ? $this->visitor_email : null,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'scheduled_at' => $this->iso($this->scheduled_at),
            'completed_at' => $this->iso($this->completed_at),
            'cancelled_at' => $this->iso($this->cancelled_at),
            'cancellation_reason' => $this->cancellation_reason,
            'duration_minutes' => $this->duration_minutes,
            'feedback' => $this->feedback,
            'rating' => $this->rating !== null ? (float) $this->rating : null,
            'notes' => $this->notes,
            'metadata' => $this->metadata,
            'property' => $this->whenLoaded('property', fn () => [
                'id' => $this->property->id,
                'title' => $this->property->title,
                'slug' => $this->property->slug,
            ]),
            'visitor' => $this->whenLoaded('visitor', fn () => $this->visitor ? [
                'id' => $this->visitor->id,
                'first_name' => $this->visitor->first_name,
                'last_name' => $this->visitor->last_name,
                'email' => $this->visitor->email,
                'phone' => $this->visitor->phone,
            ] : null),
            'agent' => $this->whenLoaded('agent', fn () => $this->agent ? [
                'id' => $this->agent->id,
                'first_name' => $this->agent->first_name,
                'last_name' => $this->agent->last_name,
            ] : null),
            'customer' => $this->whenLoaded('customer', fn () => $fiche && $this->customer ? [
                'id' => $this->customer->id,
                'user_id' => $this->customer->user_id,
                'first_name' => $this->customer->first_name,
                'last_name' => $this->customer->last_name,
                'email' => $this->customer->email,
                'phone' => $this->customer->phone,
            ] : null),
            'created_at' => $this->iso($this->created_at),
        ];
    }

    /**
     * TCK-590 (vérification adverse, passe 3 M7′) — la fiche client est du CRM : sur un bien
     * d'agence, seul le personnel de l'agence la lit. Le propriétaire reconnu
     * (`PrimaryPropertyContact::estProprietaire`) voit la visite, sans `customer` ni `customer_id`,
     * comme le non-personnel qui planifie pour lui-même (B1). Le visiteur garde l'identifiant de
     * sa propre fiche. Un bien sans agence n'a pas de CRM d'agence : rien à masquer.
     *
     * L'agence du personnel est lue une fois par requête, et l'index pose l'agence de chaque bien
     * de la page (`visits.property_agencies`) : rien n'est relu ligne par ligne.
     */
    private function ficheClientLisible(Request $request): bool
    {
        if ($this->customer_id === null) {
            return true;
        }

        $user = $request->user();
        if ($user === null) {
            return false;
        }

        if ($user->isSuperAdmin() || $this->visitor_id === $user->id) {
            return true;
        }

        $agences = $request->attributes->get('visits.property_agencies');
        if (is_array($agences) && array_key_exists((int) $this->property_id, $agences)) {
            $agencyId = $agences[(int) $this->property_id];
        } elseif ($this->property !== null) {
            $agencyId = $this->property->agency_id;
        } else {
            return false;
        }

        if ($agencyId === null) {
            return true;
        }

        if (! $request->attributes->has('visits.staff_agency_id')) {
            $request->attributes->set('visits.staff_agency_id', $user->staffAgencyId());
        }

        return $request->attributes->get('visits.staff_agency_id') === (int) $agencyId;
    }
}
