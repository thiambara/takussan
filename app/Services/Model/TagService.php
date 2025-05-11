<?php

namespace App\Services\Model;

use App\Models\Tag;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class TagService
{
    /**
     * Store a new tag
     * @throws Throwable
     */
    public function store(array $data): Tag
    {
        // Generate slug if not provided
        if (!isset($data['slug']) || empty($data['slug'])) {
            $data['slug'] = Str::slug($data['name']);
        }

        return DB::transaction(function () use ($data) {
            return Tag::create($data);
        });
    }

    /**
     * Update an existing tag
     * @throws Throwable
     */
    public function update(Tag $tag, array $data): Tag
    {
        // Generate slug if name is updated but slug is not provided
        if (isset($data['name']) && (!isset($data['slug']) || empty($data['slug']))) {
            $data['slug'] = Str::slug($data['name']);
        }

        return DB::transaction(function () use ($tag, $data) {
            $tag->update($data);
            return $tag;
        });
    }

    /**
     * Delete a tag
     * @throws Throwable
     */
    public function delete(Tag $tag): bool
    {
        return DB::transaction(function () use ($tag) {
            // Detach tag from all relationships
            $tag->properties()->detach();
            $tag->customers()->detach();

            return $tag->delete();
        });
    }

    /**
     * Get tags by type
     */
    public function getByType(?string $type = null): Collection
    {
        $query = Tag::query();

        if ($type) {
            $query->where('type', $type);
        }

        return $query->get();
    }

    /**
     * Sync entity tags
     */
    public function syncEntityTags($entity, array $tagIds): void
    {
        if (method_exists($entity, 'tags')) {
            $entity->tags()->sync($tagIds);
        }
    }
}
