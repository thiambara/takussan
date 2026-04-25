<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'id_type' => $this->id_type?->value,
            'id_number' => $this->id_number,
            'occupation' => $this->occupation,
            'status' => $this->status?->value,
            'pipeline_stage' => $this->pipeline_stage?->value,
            'agency_id' => $this->agency_id,
            'user_id' => $this->user_id,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
            'tags' => $this->when(
                $this->relationLoaded('tags'),
                fn () => $this->tags->map(fn ($t) => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'slug' => $t->slug,
                    'color' => $t->color,
                ])->values(),
            ),
        ];
    }
}
