<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * Policy for Spatie Media rows.
 *
 * `super_admin` bypass is already wired globally via Gate::before, so it
 * silently overrides every check here.
 *
 * Delete authorization: the owner of the underlying morph target (a user,
 * a property, etc.) can delete its own media. For targets that expose a
 * `user_id` column we match by that. Users' own avatars match by the
 * target's primary key.
 */
class MediaPolicy extends BasePolicy
{
    protected function resource(): string
    {
        return 'media';
    }

    public function view(User $user, Model $model): bool
    {
        return true;
    }

    /**
     * TCK-106 — only the owner agency admin or platform admin may retrieve
     * the original (unwatermarked) media file via `?raw=1`.
     */
    public function viewRaw(User $user, Model $model): bool
    {
        if ($user->hasRole(['admin', 'super_admin'])) {
            return true;
        }

        if (! $model instanceof Media) {
            return false;
        }

        $target = $model->model;

        if ($target === null) {
            return false;
        }

        if (isset($target->agency_id) && $user->agency_id !== null
            && (int) $target->agency_id === (int) $user->agency_id) {
            $agency = $target->agency ?? null;
            if ($agency !== null && $agency->primary_admin_id === $user->id) {
                return true;
            }

            if ($user->hasRole(['agency_admin']) && $user->can('properties.update')) {
                return true;
            }
        }

        return false;
    }

    /**
     * TCK-105 — only the owner of the underlying resource may request a
     * signed CDN URL for private media.  Reuses the same ownership rules
     * as delete().
     */
    public function sign(User $user, Model $model): bool
    {
        return $this->delete($user, $model);
    }

    public function delete(User $user, Model $model): bool
    {
        if (! $model instanceof Media) {
            return false;
        }

        $target = $model->model;
        if ($target === null) {
            // Orphan media — only admins (handled by Gate::before) can delete.
            return false;
        }

        // Direct ownership: media attached to the user itself (e.g. avatar).
        if ($target instanceof User && $target->id === $user->id) {
            return true;
        }

        // Target owns a `user_id` column — own it if it matches.
        if (isset($target->user_id) && (int) $target->user_id === (int) $user->id) {
            return true;
        }

        // Agency scoping: if the target has an agency_id matching the user's
        // and the user is an agency_admin, allow.
        if (isset($target->agency_id) && $user->agency_id !== null
            && (int) $target->agency_id === (int) $user->agency_id
            && $user->hasRole(['admin', 'agency_admin'])) {
            return true;
        }

        return false;
    }
}
