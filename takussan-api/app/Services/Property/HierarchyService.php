<?php

namespace App\Services\Property;

use App\Models\Property;
use Illuminate\Support\Collection;

class HierarchyService
{
    /**
     * Hard cap on tree traversal to defuse pathological inputs and prevent
     * runaway recursion if a cycle slipped past validation.
     */
    public const TRAVERSAL_HARD_CAP = 10;

    /**
     * Maximum depth allowed: immeuble (1) → étage (2) → lot (3) → sous-lot (4).
     */
    public const MAX_DEPTH = 4;

    /**
     * Walk the parent chain from $node (exclusive) up to the root.
     *
     * Returned order: closest ancestor first → furthest ancestor last.
     *
     * @return Collection<int, Property>
     */
    public function ancestors(Property $node): Collection
    {
        $chain = collect();
        $cursor = $node->parent;
        $hops = 0;

        while ($cursor !== null && $hops < self::TRAVERSAL_HARD_CAP) {
            $chain->push($cursor);
            $cursor = $cursor->parent;
            $hops++;
        }

        return $chain;
    }

    /**
     * Direct + indirect descendants of $node (BFS).
     *
     * @return Collection<int, Property>
     */
    public function descendants(Property $node): Collection
    {
        $bag = collect();
        $frontier = collect([$node]);
        $hops = 0;

        while ($frontier->isNotEmpty() && $hops < self::TRAVERSAL_HARD_CAP) {
            $next = collect();
            foreach ($frontier as $current) {
                /** @var Property $current */
                foreach ($current->children as $child) {
                    $bag->push($child);
                    $next->push($child);
                }
            }
            $frontier = $next;
            $hops++;
        }

        return $bag;
    }

    /**
     * 1-based depth of $node measured from its root (root = 1, étage = 2, lot = 3…).
     */
    public function depth(Property $node): int
    {
        return $this->ancestors($node)->count() + 1;
    }

    /**
     * Height of the subtree rooted at $node (1 if leaf, 2 if has direct
     * children only, etc.). Used to enforce MAX_DEPTH on re-parenting.
     *
     * The remaining-budget parameter mirrors `descendants()` /  `ancestors()`'s
     * `TRAVERSAL_HARD_CAP`: it bounds the recursion in case pathological data
     * (a cycle that slipped past validation, a direct DB insert) ever forms a
     * loop in `children`.
     */
    public function subtreeHeight(Property $node, int $budget = self::TRAVERSAL_HARD_CAP): int
    {
        if ($budget <= 0) {
            return 1;
        }

        $maxChildHeight = 0;
        foreach ($node->children as $child) {
            $height = $this->subtreeHeight($child, $budget - 1);
            if ($height > $maxChildHeight) {
                $maxChildHeight = $height;
            }
        }

        return 1 + $maxChildHeight;
    }

    /**
     * True if attaching $node under $candidateParent would create a cycle
     * (candidate is the node itself or any of its descendants).
     */
    public function wouldCreateCycle(Property $node, Property $candidateParent): bool
    {
        if ($candidateParent->id === $node->id) {
            return true;
        }

        return $this->descendants($node)->contains(fn (Property $d) => $d->id === $candidateParent->id);
    }

    /**
     * True if attaching $node under $candidateParent would push the tree
     * past MAX_DEPTH levels.
     */
    public function wouldExceedMaxDepth(Property $node, Property $candidateParent): bool
    {
        return $this->depth($candidateParent) + $this->subtreeHeight($node) > self::MAX_DEPTH;
    }
}
