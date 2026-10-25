<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\UserCustomerRelationship;
use Illuminate\Http\Request;

/**
 * TCK-2045 (P61.04) — la relation d'un membre à un client, rendue par
 * `POST /api/customers/{customer}/primary-contact`. Les colonnes de la ligne, sans `metadata`
 * (que `CustomerController::relationships()` ne rend pas non plus) ; `started_at` et `ended_at`
 * sont des dates calendaires, les horodatages des instants (ADR-0018).
 *
 * @mixin UserCustomerRelationship
 */
class UserCustomerRelationshipResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'customer_id' => $this->customer_id,
            'user_id' => $this->user_id,
            'relationship_type' => $this->enumValue($this->relationship_type),
            'status' => $this->enumValue($this->status),
            'is_primary' => (bool) $this->is_primary,
            'started_at' => $this->calendarDate($this->started_at),
            'ended_at' => $this->calendarDate($this->ended_at),
            'notes' => $this->notes,
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
