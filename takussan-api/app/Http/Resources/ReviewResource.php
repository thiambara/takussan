<?php

namespace App\Http\Resources;

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
            'reply_content' => $this->reply_content,
            'replied_at' => $this->replied_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
