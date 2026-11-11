<?php

namespace App\Services\Profiles;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2620 ([ADR-0004](../../../../docs/adr/0004-profil-actif-resolu-par-middleware.md), amendement du
 * 2026-11-10) — le DERNIER ESPACE RETENU sur le compte : l'identifiant composite (`type:id`) du profil
 * que la personne a choisi en dernier par `PATCH /api/me/active-profile`.
 *
 * C'est le niveau 4 de `ResolveActiveProfile`, après le cookie et avant l'auto-bascule. Il survit à la
 * déconnexion, qui n'efface que le cookie (TCK-509) : un compte de plusieurs agences retrouve ainsi son
 * espace à la connexion suivante, au lieu d'arriver sans profil lié.
 *
 * **Un état, pas une préférence** : la valeur vit dans `users.metadata`, jamais dans `preferences`
 * (« choisi par l'utilisateur et exposé », `models-spec.md` § 1). Elle n'est pas rendue telle quelle ;
 * `/api/auth/me` rend le profil réellement LIÉ (`active_profile_id`), ce qui n'est pas la même chose.
 *
 * L'écriture se fait par une seule requête SQL qui fusionne la clé dans le `jsonb` existant, et non par
 * `$user->save()` :
 *  - pas de perte d'écriture : d'autres écrivains touchent `metadata` (`previous_public_slugs`,
 *    `force_2fa_reconfigure`), et un lire-modifier-réécrire du modèle en mémoire écraserait la leur ;
 *  - un changement d'espace ne « modifie » pas le compte : ni `updated_at`, ni réindexation Scout, ni
 *    événement de modèle.
 */
class DernierEspaceRetenu
{
    public const CLE = 'last_active_profile';

    /** La valeur retenue, telle qu'écrite ; `null` sans rien de retenu. Aucune requête : lue sur le modèle. */
    public function lire(User $user): ?string
    {
        $valeur = ((array) ($user->metadata ?? []))[self::CLE] ?? null;

        return is_string($valeur) && $valeur !== '' ? $valeur : null;
    }

    public function retenir(User $user, Model $profil): void
    {
        $composite = app(ActiveProfileResolver::class)->compositeId($profil);

        // Liaison explicite : une expression `DB::raw()` passée à `update()` ne lie pas ses `?`.
        DB::update(
            "UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('".self::CLE."', ?::text) WHERE id = ?",
            [$composite, $user->getKey()],
        );

        $this->synchroniser($user, $composite);
    }

    public function oublier(User $user): void
    {
        DB::update(
            "UPDATE users SET metadata = metadata - '".self::CLE."' WHERE id = ?",
            [$user->getKey()],
        );

        $this->synchroniser($user, null);
    }

    /** Le modèle en mémoire suit la base, sans devenir « sale » : un `save()` ultérieur ne réécrit rien. */
    private function synchroniser(User $user, ?string $composite): void
    {
        $metadata = (array) ($user->metadata ?? []);
        if ($composite === null) {
            unset($metadata[self::CLE]);
        } else {
            $metadata[self::CLE] = $composite;
        }

        $user->metadata = $metadata;
        $user->syncOriginalAttribute('metadata');
    }
}
