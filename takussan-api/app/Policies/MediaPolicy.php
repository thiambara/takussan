<?php

namespace App\Policies;

use App\Models\Enums\Capability;
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
    /**
     * TCK-297 — `media` n'est même pas un préfixe de `Capability` : les cinq
     * abilities CRUD héritées se résolvaient sur des chaînes inexistantes.
     * Aucune capacité n'est donc déclarée ici, et les abilities réellement
     * utilisées (`view`, `delete`, `viewRaw`, `sign`) portent leur règle en
     * propre — propriété du morph target, périmètre d'agence, et pour
     * `viewRaw` la seule capacité qui existe vraiment :
     * `Capability::PropertiesUpdateAny`.
     */
    public function view(User $user, Model $model): bool
    {
        return true;
    }

    /**
     * TCK-106 — only the owner agency admin or platform admin may retrieve
     * the original (unwatermarked) media file via `?raw=1`.
     *
     * TCK-278 — this used to read `$user->can('properties.update')`. That
     * string is **not** a `Capability` case (only `properties.update_any` and
     * `properties.update_own` exist), so no Gate was ever defined for it — and
     * an undefined ability does not throw, it denies. Every `agency_admin`
     * who was not the agency's `primary_admin_id` silently lost access, while
     * the spatie role `agency_admin` did carry `properties.update` before the
     * cutover. We now go through the resolver with the real capability and the
     * explicit agency, instead of a stringly-typed Gate lookup that no type,
     * no lint and no test could catch.
     */
    public function viewRaw(User $user, Model $model): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        if (! $model instanceof Media) {
            return false;
        }

        $target = $model->model;

        if ($target === null) {
            return false;
        }

        // `$user->agency_id` is the TCK-146 active-profile-aware accessor.
        if (isset($target->agency_id) && $user->agency_id !== null
            && (int) $target->agency_id === (int) $user->agency_id) {
            $agency = $target->agency ?? null;
            if ($agency !== null && $agency->primary_admin_id === $user->id) {
                return true;
            }

            if ($user->isAgencyAdminAt((int) $user->agency_id)
                && $user->canActAt(Capability::PropertiesUpdateAny, $agency)) {
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

        // Agency scoping: target's agency must match the actor's active-
        // profile agency (via the `$user->agency_id` accessor) and the actor
        // must hold an admin/agency_admin role at that team.
        if (isset($target->agency_id) && $user->agency_id !== null
            && (int) $target->agency_id === (int) $user->agency_id
            && $user->isAgencyAdminAt((int) $user->agency_id)) {
            return true;
        }

        return false;
    }
}
