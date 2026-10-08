<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\Request;

class ReviewResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $author = $this->resource->author;
        $viewer = $request->user();
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
            'replied_at' => $this->iso($this->replied_at),
            'created_at' => $this->iso($this->created_at),
            // verif-597 m1 — les gestes que l'API ACCEPTERA, jugés par la policy : le front ne les
            // devine plus (il offrait « Répondre » ou « Approuver » que l'API refusait en 403).
            'can_reply' => $viewer !== null && $viewer->can('reply', $this->resource),
            'can_moderate' => $viewer !== null && $viewer->can('moderate', $this->resource),
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

        // TCK-597 — le prestataire est noté sur son profil (ADR-0043 §2).
        if ($target instanceof ServiceProviderProfile) {
            return [
                'type' => 'service_provider',
                'id' => $target->id,
                'title' => $target->user?->full_name,
                'slug' => null,
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
