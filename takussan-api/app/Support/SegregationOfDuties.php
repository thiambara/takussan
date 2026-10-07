<?php

namespace App\Support;

use App\Models\User;

/**
 * TCK-594 (ADR-0039 §4) — le principe des quatre yeux, ÉCRIT UNE FOIS.
 *
 * Une sortie d'argent passe par trois gestes : préparer (créer, clôturer), approuver, marquer payé.
 * La même personne ne tient jamais deux gestes consécutifs — l'approbateur n'est pas le préparateur,
 * le payeur n'est pas l'approbateur — et le bénéficiaire n'en tient aucun.
 *
 * Les deux chaînes (agence → bailleur ou prestataire, plateforme → agence) appellent cette classe ;
 * aucune ne réécrit la comparaison. Elle porte sur l'UTILISATEUR, jamais sur le profil : deux profils
 * ou deux agences ne font pas deux personnes. Une violation rend 403 avec une clé, jamais une phrase.
 */
final class SegregationOfDuties
{
    /** Le bénéficiaire ne prépare pas la sortie d'argent qui le paie. */
    public const STEP_PREPARE = 'prepare';

    public const STEP_APPROVE = 'approve';

    public const STEP_PAY = 'pay';

    /**
     * @param  array<int, int|string|null>  $priorActorIds  les acteurs des gestes précédents et le
     *                                                      bénéficiaire ; `null` = geste non tenu
     */
    public static function assertDistinct(User $actor, array $priorActorIds, string $step): void
    {
        foreach ($priorActorIds as $priorId) {
            if ($priorId !== null && (int) $priorId === (int) $actor->id) {
                abort(403, __('money_out.segregation.'.$step));
            }
        }
    }
}
