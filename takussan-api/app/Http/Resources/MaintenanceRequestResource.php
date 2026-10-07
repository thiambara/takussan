<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
use App\Policies\MaintenanceRequestPolicy;
use Illuminate\Http\Request;

class MaintenanceRequestResource extends BaseResource
{
    /**
     * TCK-592 (P13) — le prix négocié est une affaire entre le prestataire et les donneurs d'ordre :
     * le demandeur locataire ne reçoit plus les `quote_*` — clés ABSENTES, pas nulles. Retirées à
     * la main plutôt que par `mergeWhen()` : les contrôleurs appellent `toArray()` directement, qui
     * ne résout pas les valeurs conditionnelles.
     */
    private const QUOTE_FIELDS = [
        'quote_amount', 'quote_currency', 'quote_submitted_at', 'quote_decision_at',
        'quote_decision_by_id', 'quote_rejection_reason', 'quote_decision_by',
    ];

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'lease_id' => $this->lease_id,
            'requester_id' => $this->requester_id,
            'assigned_to' => $this->assigned_to,
            'title' => $this->title,
            'description' => $this->description,
            'category' => $this->category?->value,
            'priority' => $this->priority?->value,
            'status' => $this->status?->value,
            'estimated_cost' => $this->estimated_cost !== null ? (float) $this->estimated_cost : null,
            'actual_cost' => $this->actual_cost !== null ? (float) $this->actual_cost : null,
            'quote_amount' => $this->quote_amount !== null ? (float) $this->quote_amount : null,
            'quote_currency' => $this->quote_currency,
            'quote_submitted_at' => $this->iso($this->quote_submitted_at),
            'quote_decision_at' => $this->iso($this->quote_decision_at),
            'quote_decision_by_id' => $this->quote_decision_by_id,
            'quote_rejection_reason' => $this->quote_rejection_reason,
            'scheduled_at' => $this->iso($this->scheduled_at),
            'started_at' => $this->iso($this->started_at),
            'completed_at' => $this->iso($this->completed_at),
            'resolution_notes' => $this->resolution_notes,
            'property' => $this->whenLoaded('property', fn () => $this->propertySummary()),
            'requester' => $this->whenLoaded('requester', fn () => $this->userSummary($this->requester)),
            'assignee' => $this->whenLoaded('assignee', fn () => $this->userSummary($this->assignee)),
            'quote_decision_by' => $this->whenLoaded('quoteDecisionBy', fn () => $this->userSummary($this->quoteDecisionBy)),
            'created_at' => $this->iso($this->created_at),
        ];

        if (! $this->seesQuote($request->user())) {
            $data = array_diff_key($data, array_flip(self::QUOTE_FIELDS));
        }

        return $data;
    }

    /**
     * Le prestataire assigné et les donneurs d'ordre (bailleur du bien, équipe de l'agence).
     */
    private function seesQuote(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        return ($this->assigned_to !== null && $this->assigned_to === $user->id)
            || MaintenanceRequestPolicy::isPrincipalFor($user, $this->property);
    }

    private function propertySummary(): ?array
    {
        $property = $this->property;
        if ($property === null) {
            return null;
        }

        $address = $property->relationLoaded('address') ? $property->address : null;
        $parts = array_filter([
            $address?->neighborhood,
            $address?->city,
            $address?->region,
            $address?->country,
        ], fn ($value) => $value !== null && $value !== '');

        return [
            'id' => $property->id,
            'title' => $property->title,
            'slug' => $property->slug,
            'location' => [
                'full' => $parts === [] ? null : implode(', ', $parts),
                'quarter' => $address?->neighborhood,
                'city' => $address?->city,
                'region' => $address?->region,
                'country' => $address?->country,
            ],
        ];
    }

    private function userSummary(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        $name = trim($user->first_name.' '.$user->last_name) ?: $user->username;

        return [
            'id' => $user->id,
            'name' => $name,
            'email' => $user->email,
            'username' => $user->username,
        ];
    }
}
