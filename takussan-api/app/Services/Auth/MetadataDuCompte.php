<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * P245.02 (TCK-2367) — les clés de `users.metadata` que la connexion et le support écrivent
 * (compteur d'échecs, verrou, `force_2fa_reconfigure`) s'écrivent par une seule instruction
 * `UPDATE … RETURNING`, calculée sur la valeur EN BASE, jamais recomposée depuis le modèle chargé
 * (décision du porteur, 2026-10-25). Recomposée, la colonne effaçait ce qu'un geste concurrent y
 * avait écrit entre la lecture et l'écriture : un échec de connexion, ou le drapeau posé par la
 * réinitialisation de la 2FA.
 *
 * Une instruction suffit : sous `READ COMMITTED`, PostgreSQL rejoue l'expression sur la version de
 * la ligne qui a attendu son verrou. Le modèle reçoit la valeur rendue, sans être réécrit.
 */
final class MetadataDuCompte
{
    /** La colonne, ou un objet vide si elle n'en porte pas (comme `$user->metadata ?? []`). */
    public const COLONNE = "(CASE WHEN jsonb_typeof(users.metadata) = 'object' THEN users.metadata ELSE '{}'::jsonb END)";

    /**
     * Écrit `metadata = <expression>` sur le compte, si `$condition` tient sur la ligne en base.
     * Rend false quand aucune ligne n'a été écrite.
     *
     * @param  list<mixed>  $bindings
     * @param  list<mixed>  $conditionBindings
     */
    public static function ecrire(User $user, string $expression, array $bindings = [], string $condition = 'true', array $conditionBindings = []): bool
    {
        $now = now();
        $row = DB::selectOne(
            "UPDATE users SET metadata = {$expression}, updated_at = ? WHERE users.id = ? AND ({$condition}) RETURNING metadata",
            [...$bindings, $user->fromDateTime($now), $user->getKey(), ...$conditionBindings],
            false,
        );
        if ($row === null) {
            return false;
        }

        $user->setRawAttributes(['metadata' => $row->metadata, 'updated_at' => $user->fromDateTime($now)] + $user->getAttributes());
        $user->syncOriginalAttributes(['metadata', 'updated_at']);

        return true;
    }

    /** Pose une clé, sans toucher aux autres. */
    public static function poser(User $user, string $cle, mixed $valeur): void
    {
        self::ecrire($user, 'jsonb_set('.self::COLONNE.', ?::text[], ?::jsonb)', [self::chemin([$cle]), json_encode($valeur)]);
    }

    /**
     * Retire des clés, sans toucher aux autres. N'écrit rien quand aucune n'est en base.
     *
     * @param  list<string>  $cles
     */
    public static function retirer(User $user, array $cles): void
    {
        self::ecrire(
            $user,
            self::COLONNE.' - ?::text[]',
            [self::chemin($cles)],
            'jsonb_exists_any('.self::COLONNE.', ?::text[])',
            [self::chemin($cles)],
        );
    }

    /** @param  list<string>  $cles */
    private static function chemin(array $cles): string
    {
        return '{'.implode(',', $cles).'}';
    }
}
