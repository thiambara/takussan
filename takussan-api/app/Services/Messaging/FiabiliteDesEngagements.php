<?php

namespace App\Services\Messaging;

use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;

/**
 * TCK-2987 (ADR-0130 § 6, décision 1 du porteur) — la fiabilité d'une personne : DEUX ENTIERS sur 90 jours,
 * jamais un score, un ratio ni une liste.
 *
 *  - `kept` : ses engagements `kept` sans `overdue_at` ;
 *  - `late` : ceux qui ont un `overdue_at` (le retard reste dans l'historique, même reporté), ou qui sont
 *    `open` et échus.
 *
 * Comptés : les engagements dont elle est le PORTEUR, dans l'agence du fil (la fiabilité ne sort pas de
 * l'agence), dont l'échéance tombe dans les 90 derniers jours, hors `proposed` et `cancelled`.
 *
 * Lue par le SEUL personnel actif de l'agence du fil, sous son profil actif
 * (`PersonnelDeLAgence::personnelActifDe`) : pour tout autre appelant — la personne elle-même, un client,
 * un agent d'une autre agence, le super-admin hors impersonation — `null`, et la clé est absente.
 * Une requête pour tous les participants.
 */
final class FiabiliteDesEngagements
{
    public const JOURS = 90;

    /**
     * La table `{user_id: {kept, late}}` des participants actifs du fil autres que le lecteur, ou `null`
     * quand le lecteur ne la lit pas.
     *
     * @param  iterable<User>  $participants  les participants actifs (déjà chargés)
     * @return array<int, array{kept: int, late: int}>|null
     */
    public static function pour(User $lecteur, Conversation $fil, ?int $agence, iterable $participants): ?array
    {
        if ($agence === null || ! PersonnelDeLAgence::personnelActifDe($lecteur, $agence)) {
            return null;
        }

        $ids = [];
        foreach ($participants as $participant) {
            if ((int) $participant->id !== (int) $lecteur->id) {
                $ids[] = (int) $participant->id;
            }
        }
        sort($ids);
        if ($ids === []) {
            return [];
        }

        $maintenant = now();
        $lignes = Commitment::query()
            ->where('agency_id', $agence)
            ->whereIn('holder_id', $ids)
            ->whereBetween('due_at', [$maintenant->copy()->subDays(self::JOURS), $maintenant])
            ->whereNotIn('status', [CommitmentStatus::Proposed->value, CommitmentStatus::Cancelled->value])
            ->groupBy('holder_id')
            ->selectRaw('holder_id')
            ->selectRaw('SUM(CASE WHEN status = ? AND overdue_at IS NULL THEN 1 ELSE 0 END) AS kept', [CommitmentStatus::Kept->value])
            ->selectRaw('SUM(CASE WHEN overdue_at IS NOT NULL OR (status = ? AND due_at < ?) THEN 1 ELSE 0 END) AS late', [CommitmentStatus::Open->value, $maintenant])
            ->toBase()
            ->get()
            ->keyBy(fn ($ligne) => (int) $ligne->holder_id);

        $table = [];
        foreach ($ids as $id) {
            $ligne = $lignes->get($id);
            $table[$id] = ['kept' => (int) ($ligne->kept ?? 0), 'late' => (int) ($ligne->late ?? 0)];
        }

        return $table;
    }
}
