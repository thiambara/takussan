<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * TCK-693 (piste P21.01) — le `User` qu'une liste charge par `include=user`, tel qu'il sort :
 * id, noms, e-mail, téléphone, avatar. Rien d'autre, quel que soit `fields[users]`.
 *
 * Sans elle, le modèle chargé était sérialisé tel quel (`relationsToArray()`, paginateur brut) et
 * `User::$hidden` seul le filtrait : 38 clés, `google_id`, `metadata` et le second numéro compris.
 *
 * `fields[users]` peut RESTREINDRE la projection, jamais l'élargir : une clé dont la colonne n'a
 * pas été sélectionnée est omise, plutôt que rendue à `null` comme si on l'avait lue (même règle
 * que `whenHas` dans {@see UserResource}).
 */
class IncludedUserResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;
        $lu = $user->getAttributes();

        $projection = [];
        foreach (['id', 'first_name', 'last_name', 'email', 'phone'] as $colonne) {
            if (array_key_exists($colonne, $lu)) {
                $projection[$colonne] = $user->getAttribute($colonne);
            }
        }
        if (array_key_exists('first_name', $lu) && array_key_exists('last_name', $lu)) {
            $projection['full_name'] = $user->full_name;
        }
        if (array_key_exists('id', $lu)) {
            $projection['avatar_url'] = $user->getFirstMediaUrl('avatar') ?: null;
        }

        return $projection;
    }

    /**
     * Le modèle parent sérialisé, sa relation `user` passée par la projection quand elle est chargée.
     *
     * @return array<string, mixed>
     */
    public static function inParent(Model $parent, ?array $serialized = null): array
    {
        $serialized ??= $parent->toArray();

        if ($parent->relationLoaded('user')) {
            $user = $parent->getRelation('user');
            $serialized['user'] = $user instanceof User ? (new self($user))->resolve() : null;
        }

        return $serialized;
    }

    /**
     * Charge les médias des comptes inclus d'une page, pour que `avatar_url` ne fasse pas une
     * requête par ligne.
     *
     * @param  iterable<Model>  $parents
     */
    public static function preload(iterable $parents): void
    {
        $users = collect($parents)
            ->filter(fn (Model $p) => $p->relationLoaded('user') && $p->getRelation('user') instanceof User)
            ->map(fn (Model $p) => $p->getRelation('user'))
            ->filter(fn (User $u) => array_key_exists('id', $u->getAttributes()));

        if ($users->isNotEmpty()) {
            (new Collection($users->values()->all()))->loadMissing('media');
        }
    }
}
