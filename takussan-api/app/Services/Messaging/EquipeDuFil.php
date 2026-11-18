<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * TCK-2965 (ADR-0128 § 6) — l'équipe d'un fil : l'agence du fil, et qui y lit les notes d'équipe.
 *
 * **L'agence du fil** est celle de son SUJET ({@see SujetsDuFil} : le bail, la réservation, la demande
 * d'intervention — celle-ci par son bien, sinon son bail), sinon celle du bien du fil (`property_id`),
 * sinon celle de son bail (`lease_id`). Objets supprimés en douceur compris : un fil fermé garde son
 * agence. Sans agence, aucune note d'équipe n'est possible dans ce fil.
 *
 * Elle s'écrit UNE fois, en SQL ({@see self::agenceSql()}) : les chemins de liste (non-lus, recherche)
 * la posent dans leur requête, et {@see self::agence()} la rejoue sur la seule ligne du fil.
 *
 * **Lire une note** se juge À LA LECTURE, jamais à l'écriture :
 *  - le LECTEUR (l'appelant d'une requête HTTP) : participant actif du fil (`left_at` nul) ET personnel
 *    actif de l'agence du fil sous son profil actif ({@see PersonnelDeLAgence::personnelActifDe()}) ; ou
 *    super-admin (amendement du 2026-11-18 d'ADR-0128 § 6, décision 3b du porteur). Sous impersonation,
 *    l'appelant EST la cible (le jeton appartient à la cible, `ImpersonationService::start()`) : il lit ce
 *    qu'elle lit, et rien de plus ;
 *  - un TIERS (destinataire d'une notification ou d'un signal, hors de toute requête du destinataire) :
 *    participant actif ET personnel actif de l'agence sur l'un quelconque de ses profils
 *    ({@see PersonnelDeLAgence::estPersonnel()}) — il n'a pas de profil actif dans le job d'un autre.
 *
 * Un agent qui quitte l'agence, ou dont le profil est suspendu, ne lit plus les notes, même les siennes.
 */
final class EquipeDuFil
{
    /**
     * L'agence d'un objet SUJET, par type du registre ; `{id}` est la colonne de l'identifiant du sujet.
     * Toute clé de {@see SujetsDuFil::typesSujets()} doit y figurer : {@see self::agenceSql()} lève sinon.
     */
    private const AGENCE_DU_SUJET = [
        'lease' => '(SELECT sl.agency_id FROM leases sl WHERE sl.id = {id})',
        'booking' => '(SELECT sb.agency_id FROM bookings sb WHERE sb.id = {id})',
        'maintenance_request' => '(SELECT COALESCE(smp.agency_id, sml.agency_id) FROM maintenance_requests smr'
            .' LEFT JOIN properties smp ON smp.id = smr.property_id'
            .' LEFT JOIN leases sml ON sml.id = smr.lease_id WHERE smr.id = {id})',
    ];

    /**
     * L'expression SQL de l'agence du fil dont la table est `$alias` (`conversations` ou un alias). Sans
     * liaison : les types sont des constantes du registre, jamais une saisie.
     */
    public static function agenceSql(string $alias = 'conversations'): string
    {
        $types = SujetsDuFil::typesSujets();
        $manquants = array_diff($types, array_keys(self::AGENCE_DU_SUJET));
        if ($manquants !== []) {
            throw new LogicException('Type de sujet sans agence dans EquipeDuFil : '.implode(', ', $manquants).'.');
        }

        $branches = '';
        foreach ($types as $type) {
            $branches .= " WHEN '{$type}' THEN ".str_replace('{id}', "{$alias}.subject_id", self::AGENCE_DU_SUJET[$type]);
        }

        return "COALESCE(CASE {$alias}.subject_type{$branches} END,"
            ." (SELECT fp.agency_id FROM properties fp WHERE fp.id = {$alias}.property_id),"
            ." (SELECT fl.agency_id FROM leases fl WHERE fl.id = {$alias}.lease_id))";
    }

    /** L'agence du fil, ou `null` : aucune note d'équipe n'y est possible. */
    public static function agence(Conversation $fil): ?int
    {
        $agence = DB::table('conversations as c')
            ->where('c.id', $fil->getKey())
            ->selectRaw(self::agenceSql('c').' as agence')
            ->value('agence');

        return $agence === null ? null : (int) $agence;
    }

    /**
     * Le LECTEUR (l'appelant) lit-il les notes d'équipe de ce fil ? Super-admin, ou participant actif ET
     * personnel actif de l'agence du fil sous son profil actif.
     *
     * @param  int|null  $agence  TCK-2967 — l'agence du fil, déjà calculée ({@see self::agence()})
     */
    public static function litLesNotes(User $lecteur, Conversation $fil, ?int $agence = null): bool
    {
        if ($lecteur->isSuperAdmin()) {
            return true;
        }

        $agence ??= self::agence($fil);
        if ($agence === null || ! PersonnelDeLAgence::personnelActifDe($lecteur, $agence)) {
            return false;
        }

        return self::participeActivement((int) $lecteur->getKey(), (int) $fil->getKey());
    }

    /**
     * Un TIERS (destinataire d'une notification, d'un signal) lit-il les notes de ce fil ? Participant
     * actif ET personnel actif de l'agence du fil, sur l'un quelconque de ses profils.
     *
     * @param  int|null  $agence  l'agence du fil, déjà calculée ({@see self::agence()})
     */
    public static function tiersLitLesNotes(User $tiers, Conversation $fil, ?int $agence = null): bool
    {
        $agence ??= self::agence($fil);

        return $agence !== null
            && PersonnelDeLAgence::estPersonnel($tiers, $agence)
            && self::participeActivement((int) $tiers->getKey(), (int) $fil->getKey());
    }

    /**
     * Les participants ACTIFS du fil qui en lisent les notes (règle du tiers), triés : les destinataires
     * des signaux d'une note. Une requête des participants, puis la règle du personnel pour chacun.
     *
     * @return list<int>
     */
    public static function idsDesLecteursDesNotes(int $conversationId): array
    {
        $fil = (new Conversation)->setRawAttributes(['id' => $conversationId], true);
        $agence = self::agence($fil);
        if ($agence === null) {
            return [];
        }

        return User::query()
            ->whereIn('id', ConversationParticipant::query()->where('conversation_id', $conversationId)->whereNull('left_at')->select('user_id'))
            ->orderBy('id')
            ->get()
            ->filter(fn (User $u) => PersonnelDeLAgence::estPersonnel($u, $agence))
            ->map(fn (User $u): int => (int) $u->id)
            ->values()
            ->all();
    }

    /**
     * Les fils dont le LECTEUR lit les notes, pour une clause `whereIn` : ceux où il participe activement
     * et dont l'agence est celle où il est personnel actif sous son profil actif. `null` : tous (le
     * super-admin) ; une requête vide de lignes quand il n'est personnel nulle part.
     *
     * Une requête de base (`DB::table`), pas d'Eloquent : la portée `SoftDeletes` de `Conversation`
     * viserait `conversations.deleted_at` sous l'alias. Un fil supprimé ne liste de toute façon rien.
     */
    public static function filsOuLesNotesSeLisent(User $lecteur): ?QueryBuilder
    {
        if ($lecteur->isSuperAdmin()) {
            return null;
        }

        $agences = PersonnelDeLAgence::agencesOuPersonnelActif($lecteur);

        return DB::table('conversations as cn')
            ->select('cn.id')
            ->whereIn('cn.id', DB::table('conversation_participants')
                ->where('user_id', $lecteur->id)
                ->whereNull('left_at')
                ->select('conversation_id'))
            ->when(
                $agences === [],
                fn (QueryBuilder $q) => $q->whereRaw('1 = 0'),
                fn (QueryBuilder $q) => $q->whereRaw(self::agenceSql('cn').' = ?', [$agences[0]]),
            );
    }

    private static function participeActivement(int $userId, int $conversationId): bool
    {
        return ConversationParticipant::query()
            ->where('conversation_id', $conversationId)
            ->where('user_id', $userId)
            ->whereNull('left_at')
            ->exists();
    }
}
