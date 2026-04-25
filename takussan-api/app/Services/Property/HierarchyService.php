<?php

namespace App\Services\Property;

use App\Models\Property;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class HierarchyService
{
    public const MAX_DEPTH = 4;

    private const TRAVERSAL_GUARD = 10;

    /**
     * Returns the chain of ancestors from closest to farthest.
     *
     * @return Collection<int, Property>
     */
    public function ancestors(Property $property): Collection
    {
        $chain = collect();
        $current = $property->parent;
        $hops = 0;

        while ($current !== null && $hops < self::TRAVERSAL_GUARD) {
            $chain->push($current);
            $current = $current->parent;
            $hops++;
        }

        return $chain;
    }

    /**
     * 1-based depth: a root property has depth 1.
     */
    public function depth(Property $property): int
    {
        return $this->ancestors($property)->count() + 1;
    }

    /**
     * Whether attaching `$property` under `$parent` would form a cycle.
     */
    public function wouldCreateCycle(Property $property, Property $parent): bool
    {
        if ($property->id === $parent->id) {
            return true;
        }

        $current = $parent;
        $hops = 0;

        while ($current !== null && $hops < self::TRAVERSAL_GUARD) {
            if ((string) $current->id === (string) $property->id) {
                return true;
            }
            $current = $current->parent;
            $hops++;
        }

        return false;
    }

    /**
     * Validates an attachment of `$property` under a target parent (or detach
     * when `$parentId` is null). Throws a 422 ValidationException with stable
     * error keys consumable by the frontend.
     */
    public function validateAttachment(Property $property, int|string|null $parentId): void
    {
        if ($parentId === null) {
            return;
        }

        if ((string) $parentId === (string) $property->id) {
            throw ValidationException::withMessages([
                'parent_id' => __('messages.property_hierarchy_cycle'),
            ]);
        }

        $parent = Property::query()->find($parentId);

        if ($parent === null) {
            throw ValidationException::withMessages([
                'parent_id' => __('messages.property_hierarchy_parent_not_found'),
            ]);
        }

        if ($property->agency_id !== $parent->agency_id) {
            throw ValidationException::withMessages([
                'parent_id' => __('messages.property_hierarchy_same_agency_required'),
            ]);
        }

        if ($this->wouldCreateCycle($property, $parent)) {
            throw ValidationException::withMessages([
                'parent_id' => __('messages.property_hierarchy_cycle'),
            ]);
        }

        $newDepth = $this->depth($parent) + 1;
        if ($newDepth > self::MAX_DEPTH) {
            throw ValidationException::withMessages([
                'parent_id' => __('messages.property_hierarchy_max_depth_exceeded'),
            ]);
        }
    }
}
