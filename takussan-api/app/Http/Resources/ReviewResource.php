<?php

namespace App\Http\Resources;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $author = $this->resource->author;
        $authorName = $author
            ? (trim(($author->first_name ?? '').' '.($author->last_name ?? '')) ?: ($author->username ?? 'Anonyme'))
            : 'Anonyme';

        return [
            'id' => $this->id,
            'reviewable_type' => $this->reviewable_type,
            'reviewable_id' => $this->reviewable_id,
            'target' => $this->when(
                $this->resource->relationLoaded('reviewable'),
                fn () => $this->buildTarget()
            ),
            'author_id' => $this->author_id,
            'author' => [
                'id' => $author?->id,
                'name' => $authorName,
                'avatar_url' => $author?->getFirstMediaUrl('avatar') ?: null,
            ],
            'rating' => $this->rating,
            'title' => $this->title,
            'content' => $this->content,
            'is_approved' => (bool) $this->is_approved,
            'status' => $this->status?->value,
            'reported_count' => (int) ($this->reported_count ?? 0),
            'reply_content' => $this->reply_content,
            'replied_at' => $this->replied_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    /**
     * @return array<string,mixed>|null
     */
    private function buildTarget(): ?array
    {
        $target = $this->resource->reviewable;

        if ($target instanceof Property) {
            return [
                'type' => 'property',
                'id' => $target->id,
                'title' => $target->title,
                'slug' => $target->slug,
                'subtitle' => $target->reference_number,
            ];
        }

        if ($target instanceof Agency) {
            return [
                'type' => 'agency',
                'id' => $target->id,
                'title' => $target->name,
                'slug' => $target->slug,
                'subtitle' => null,
            ];
        }

        if ($target instanceof User) {
            $name = trim(($target->first_name ?? '').' '.($target->last_name ?? ''))
                ?: ($target->username ?? 'Utilisateur');

            return [
                'type' => 'user',
                'id' => $target->id,
                'title' => $name,
                'slug' => $target->username,
                'subtitle' => null,
            ];
        }

        return null;
    }
}
