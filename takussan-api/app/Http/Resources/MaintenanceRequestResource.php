<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
use Illuminate\Http\Request;

class MaintenanceRequestResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
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
            'quote_submitted_at' => $this->quote_submitted_at?->toISOString(),
            'quote_decision_at' => $this->quote_decision_at?->toISOString(),
            'quote_decision_by_id' => $this->quote_decision_by_id,
            'quote_rejection_reason' => $this->quote_rejection_reason,
            'scheduled_at' => $this->scheduled_at?->toISOString(),
            'started_at' => $this->started_at?->toISOString(),
            'completed_at' => $this->completed_at?->toISOString(),
            'resolution_notes' => $this->resolution_notes,
            'property' => $this->whenLoaded('property', fn () => $this->propertySummary()),
            'requester' => $this->whenLoaded('requester', fn () => $this->userSummary($this->requester)),
            'assignee' => $this->whenLoaded('assignee', fn () => $this->userSummary($this->assignee)),
            'quote_decision_by' => $this->whenLoaded('quoteDecisionBy', fn () => $this->userSummary($this->quoteDecisionBy)),
            'created_at' => $this->created_at?->toISOString(),
        ];
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
