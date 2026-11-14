<?php

namespace App\Domain\Notifications;

use App\Models\AppNotification;
use App\Models\Enums\NotificationType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2633 — LA table qui range chaque notification dans une famille de la cloche
 * ({@see NotificationFamily}) et dit si elle demande un geste à son destinataire (« À traiter »).
 *
 * Écrite une fois, relue partout : la ressource (`AppNotificationResource`), les filtres et les
 * comptes de `GET /api/notifications` passent par {@see self::of()} ou par les listes qui en sont
 * dérivées ({@see self::constrainToFamilies()}, {@see self::constrainToAction()}). Aucune autre
 * liste de codes ne doit exister.
 *
 * Trois tables, exhaustives et gardées par `NotificationFamilyTableTest` (un code, un genre de
 * cible ou un type neuf sans ligne y fait échouer la suite, en le nommant) :
 *   · {@see self::CODES} — par `NotificationCode` : `[famille, à traiter]` ;
 *   · {@see self::TARGETS} — par genre de cible (`NotificationTarget::PATHS`), pour une ligne SANS
 *     code (classe qui rend encore son texte côté API, dette du principe 5) : sa famille, ou `null`
 *     quand le genre ne tranche pas ;
 *   · {@see self::TYPES} — par `NotificationType`, pour une ligne sans code que sa cible ne range
 *     pas : sa famille.
 * Une ligne sans code n'est JAMAIS « à traiter » : seul un code nomme le geste attendu.
 *
 * L'ordre est donc code → cible STOCKÉE (`target->>'kind'`, jamais la cible déduite de `data`,
 * que le SQL ne sait pas relire) → type. Décision de la session du 2026-11-11 : « Mise en avant
 * terminée » était écrite sans code, en `system`, avec une cible `property` — elle est un `bien`.
 * Ses lignes déjà stockées le restent ; les nouvelles portent `boost.ended` (TCK-2704).
 *
 * Une ligne dont le code n'est pas au catalogue est traitée comme une ligne sans code, un genre de
 * cible inconnu comme une cible absente ; une ligne dont rien n'est connu tombe en `systeme`,
 * jamais en erreur.
 *
 * « À traiter » est VRAI seulement quand le destinataire a un geste à faire pour que l'affaire
 * avance (confirmer, valider, répondre, payer, signer, reverser, corriger) ; l'information (reçu,
 * terminé, prêt, signé, refusé par un autre) est FAUSSE.
 */
final class NotificationClassification
{
    private const D = 'demande';

    private const V = 'visite';

    private const P = 'paiement';

    private const R = 'retard';

    private const B = 'bien';

    private const A = 'avis';

    private const S = 'systeme';

    /**
     * Par code : [famille, à traiter].
     *
     * @var array<string, array{0: string, 1: bool}>
     */
    public const CODES = [
        // ─── Loyers et encaissements ───────────────────────────────────────────────────────
        'lease_payment.due_soon' => [self::P, false],
        // Au locataire : le loyer est en retard, il a un paiement à faire.
        'lease_payment.overdue' => [self::R, true],
        // Au bailleur : l'agence encaisse et relance ; il est informé.
        'lease_payment.overdue_landlord' => [self::R, false],
        // À l'agent, contact principal du bien : les relances lui reviennent.
        'lease_payment.overdue_digest' => [self::R, true],
        'lease_payment.recorded' => [self::P, false],
        'lease_payment.received_landlord' => [self::P, false],
        'lease_payment.settled_online' => [self::P, false],
        'lease_payment.refunded' => [self::P, false],
        'lease_payment.refunded_landlord' => [self::P, false],
        'lease_payment.late_fee_refunded' => [self::P, false],
        'lease_payment.late_fee_refunded_landlord' => [self::P, false],
        // « Remboursez le payeur ou affectez la somme » : un geste de l'agence.
        'payment.duplicate' => [self::P, true],
        'payment.duplicate_late_fee' => [self::P, true],
        'platform_payout.refunded_since_paid' => [self::P, false],

        // ─── Réservations ─────────────────────────────────────────────────────────────────
        'booking.created' => [self::D, true],
        'booking.requested_undated' => [self::D, true],
        'booking.confirmed' => [self::D, false],
        'booking.rejected' => [self::D, false],
        'booking.cancelled' => [self::D, false],
        'booking.recorded_on_behalf' => [self::D, false],
        'booking.application_not_selected' => [self::D, false],

        // ─── Visites ──────────────────────────────────────────────────────────────────────
        'visit.reminder' => [self::V, false],
        'visit.requested' => [self::V, true],
        'visit.requested_window' => [self::V, true],
        // « La visite attend votre confirmation. »
        'visit.rescheduled_by_visitor' => [self::V, true],
        'visit.cancelled_by_visitor' => [self::V, false],
        'visit.cancelled_by_visitor_window' => [self::V, false],
        'visit.confirmed' => [self::V, false],
        'visit.rescheduled' => [self::V, false],
        'visit.cancelled' => [self::V, false],
        'visit.cancelled_window' => [self::V, false],

        // ─── Messages et demandes de contact ──────────────────────────────────────────────
        // Un message se traite dans la messagerie, qui a ses propres non-lus.
        'message.received' => [self::D, false],
        'message.group_invite' => [self::S, false],
        'lead.received' => [self::D, true],
        'lead.acknowledged' => [self::D, false],

        // ─── KYC d'agence ─────────────────────────────────────────────────────────────────
        'kyc.submitted' => [self::S, true],
        'kyc.verified' => [self::S, false],
        // Le dossier est à reprendre.
        'kyc.rejected' => [self::S, true],
        'kyc.expiring_soon' => [self::S, true],

        // ─── Gouvernance de l'agence et délégations ───────────────────────────────────────
        'governance.role_capabilities_changed' => [self::S, false],
        'governance.admin_added' => [self::S, false],
        'governance.data_exported' => [self::S, false],
        'governance.integration_changed' => [self::S, false],
        'governance.approval_threshold_changed' => [self::S, false],
        'role_delegation.activated' => [self::S, false],
        'role_delegation.activated_delegator' => [self::S, false],
        'role_delegation.expired' => [self::S, false],
        'role_delegation.expired_delegator' => [self::S, false],
        'role_delegation.revoked' => [self::S, false],
        'role_delegation.revoked_delegator' => [self::S, false],

        // ─── Relevés bancaires ────────────────────────────────────────────────────────────
        // « Prêt à être rapproché. »
        'bank_statement.imported' => [self::P, true],
        'bank_statement.finalized' => [self::P, false],

        // ─── Interventions : une demande, jusqu'à sa clôture ──────────────────────────────
        'maintenance.created' => [self::D, true],
        'maintenance_quote.requested' => [self::D, true],
        // Devis à valider.
        'maintenance_quote.submitted' => [self::D, true],
        'maintenance_quote.approved' => [self::D, false],
        'maintenance_quote.rejected' => [self::D, false],
        // Au prestataire : accepter ou refuser.
        'maintenance.assigned' => [self::D, true],
        'maintenance.unassigned' => [self::D, false],
        'maintenance.accepted' => [self::D, false],
        // À l'agence : un autre prestataire à trouver.
        'maintenance.declined' => [self::D, true],
        // « Le demandeur doit confirmer la réparation. »
        'maintenance.completed' => [self::D, true],
        'maintenance.confirmed' => [self::D, false],
        // Le problème persiste : à reprendre.
        'maintenance.contested' => [self::D, true],
        'maintenance.auto_closed' => [self::D, false],
        'maintenance.cancelled' => [self::D, false],
        'maintenance.step_acknowledged' => [self::D, false],
        'maintenance.step_assigned' => [self::D, false],
        'maintenance.step_in_progress' => [self::D, false],
        'maintenance.step_completed' => [self::D, false],
        'maintenance.step_closed' => [self::D, false],
        'maintenance.step_cancelled' => [self::D, false],
        'maintenance.step_acknowledged_scheduled' => [self::D, false],
        'maintenance.step_assigned_scheduled' => [self::D, false],
        'maintenance.step_in_progress_scheduled' => [self::D, false],
        // Au bailleur : le devis attend son accord.
        'maintenance_quote.awaiting_owner' => [self::D, true],
        'maintenance.schedule_changed' => [self::D, false],
        // TCK-2786 — au bailleur : la relance de l'agence, le devis attend toujours son accord.
        'maintenance.owner_reminder' => [self::D, true],

        // ─── Biens ────────────────────────────────────────────────────────────────────────
        'prospect_match.digest' => [self::B, false],
        'property.approved' => [self::B, false],
        // « Vous pouvez corriger l'annonce et la resoumettre. »
        'property.rejected' => [self::B, true],
        // Bien à valider.
        'property.submitted_for_review' => [self::B, true],
        'property.assigned_to_owner' => [self::B, false],
        'property.calendar_conflict' => [self::B, true],
        'property.calendar_feed_failing' => [self::B, true],
        // « Attribuez-lui un nouveau contact. »
        'property.unpublished_contact_erased' => [self::B, true],
        // « Dites-nous s'il est loué, vendu ou toujours disponible. »
        'property.source_listing_gone' => [self::B, true],

        // ─── Bail ─────────────────────────────────────────────────────────────────────────
        // La maquette range « Bail signé » en `systeme`.
        'lease.signature_requested' => [self::S, true],
        'lease.signed_by_party' => [self::S, false],
        'lease.signature_completed' => [self::S, false],
        // TCK-2642 — au bailleur : son loyer a changé, il est informé (le geste est fait).
        'lease.rent_reviewed_landlord' => [self::P, false],

        // ─── Reversements, commissions, relevés du bailleur ───────────────────────────────
        'payout.awaiting_approval' => [self::P, true],
        // « Effectuez-le, puis saisissez sa référence. »
        'payout.due' => [self::P, true],
        'payout.processed' => [self::P, false],
        'commission.paid' => [self::P, false],
        'payout.failed' => [self::P, true],
        'payout_method.added' => [self::S, false],
        'payout_method.updated' => [self::S, false],
        'payout_method.removed' => [self::S, false],
        'payout_threshold.relax_requested' => [self::P, true],
        'service_provider_bill.kept_on_reopen' => [self::P, false],
        'owner_statement.available' => [self::P, false],

        // ─── Avis et modération ───────────────────────────────────────────────────────────
        'review.to_moderate' => [self::A, true],
        'review.received' => [self::A, false],
        'moderation.property_hidden' => [self::B, false],
        'moderation.property_removed' => [self::B, false],
        'moderation.report_upheld' => [self::S, false],
        'moderation.report_dismissed' => [self::S, false],

        // ─── Invitations ──────────────────────────────────────────────────────────────────
        'invitation.received' => [self::S, true],
        'invitation.reminder' => [self::S, true],
        // « Renvoyez-la. »
        'invitation.renewal_requested' => [self::S, true],

        // ─── Compte, agence, plateforme ───────────────────────────────────────────────────
        'account.phone_changed' => [self::S, false],
        'impersonation.ended' => [self::S, false],
        'agency.suspended' => [self::S, false],
        'agency.reinstated' => [self::S, false],
        // Le portefeuille du partant est à réattribuer.
        'agency.member_deletion_requested' => [self::S, true],
        'account.blocked' => [self::S, false],
        'account.reactivated' => [self::S, false],
        'platform_operator.revoked' => [self::S, false],
        // TCK-2704 — une demande de passage en agence professionnelle, à examiner.
        'agency.upgrade_requested' => [self::S, true],

        // ─── Avis qui n'avaient pas de code (TCK-2704) ────────────────────────────────────
        'boost.ended' => [self::B, false],
        // Un bien à examiner, proposé par un bailleur rattaché.
        'property.proposed' => [self::B, true],
        // Une intervention urgente à prendre en charge.
        'maintenance.urgent_created' => [self::D, true],
        'maintenance.urgent_escalated' => [self::D, true],
    ];

    /**
     * Par genre de cible STOCKÉE, pour une ligne sans code : sa famille, ou `null` quand le genre
     * ne tranche pas et que le type décide. Une telle ligne n'est jamais « à traiter ».
     *
     * @var array<string, string|null>
     */
    public const TARGETS = [
        // Un bail porte aussi ses échéances et leurs pénalités (`payment`) : le type tranche.
        'lease' => null,
        'payments' => self::P,
        'payouts' => self::P,
        'payout_approvals' => self::P,
        'service_provider_bills' => self::P,
        'commissions' => self::P,
        'finances' => self::P,
        'agency_billing' => self::P,
        'booking' => self::D,
        'visit' => self::V,
        'maintenance' => self::D,
        'property' => self::B,
        'conversation' => self::D,
        'lead' => self::D,
        'agency_kyc' => self::S,
        'kyc_review' => self::S,
        'agency_upgrade_request' => self::S,
        'team' => self::S,
        'owners' => self::S,
        'service_providers' => self::S,
        'role_delegations' => self::S,
        'agency_settings' => self::S,
        'audit' => self::S,
        'reviews' => self::A,
        'review_moderation' => self::A,
        'property_moderation' => self::B,
        // Une alerte de recherche, un favori qui change : des biens.
        'saved_searches' => self::B,
        'favorites' => self::B,
        'credits' => self::S,
    ];

    /**
     * Par type, pour une ligne sans code que sa cible ne range pas : sa famille. Une telle ligne
     * n'est jamais « à traiter ».
     *
     * @var array<string, string>
     */
    public const TYPES = [
        'booking' => self::D,
        'payment' => self::P,
        'lease' => self::S,
        'maintenance' => self::D,
        'visit' => self::V,
        'message' => self::D,
        'system' => self::S,
        'bank_statement_imported' => self::P,
        'bank_statement_finalized' => self::P,
        'role_delegated' => self::S,
        'role_delegation_expired' => self::S,
        'role_delegation_revoked' => self::S,
    ];

    /**
     * La famille et « à traiter » d'une ligne, depuis ses seules colonnes stockées : `code`, le
     * genre de sa cible stockée (`target->>'kind'`) et `type`.
     *
     * @return array{famille: NotificationFamily, a_traiter: bool}
     */
    public static function of(?string $code, NotificationType|string|null $type, ?string $targetKind): array
    {
        if ($code !== null && isset(self::CODES[$code])) {
            [$famille, $aTraiter] = self::CODES[$code];

            return ['famille' => NotificationFamily::from($famille), 'a_traiter' => $aTraiter];
        }

        $parCible = $targetKind !== null ? (self::TARGETS[$targetKind] ?? null) : null;
        if ($parCible !== null) {
            return ['famille' => NotificationFamily::from($parCible), 'a_traiter' => false];
        }

        $type = $type instanceof NotificationType ? $type->value : $type;

        return [
            'famille' => NotificationFamily::tryFrom(self::TYPES[$type] ?? '') ?? NotificationFamily::Systeme,
            'a_traiter' => false,
        ];
    }

    /** @return array{famille: NotificationFamily, a_traiter: bool} */
    public static function ofRow(AppNotification $row): array
    {
        $kind = is_array($row->target) && is_string($row->target['kind'] ?? null) ? $row->target['kind'] : null;

        return self::of(is_string($row->code) ? $row->code : null, $row->type, $kind);
    }

    /** L'expression SQL du genre de cible stockée — la même que lit {@see self::ofRow()}. */
    public const TARGET_KIND_SQL = "target->>'kind'";

    /**
     * Restreint aux familles données, en SQL, par les listes dérivées des trois tables : un code
     * de la famille ; ou, sans code connu, une cible stockée dont le genre est de la famille ; ou,
     * sans code connu ni genre qui tranche, un type de la famille.
     *
     * @param  Builder<AppNotification>  $query
     * @param  list<NotificationFamily>  $familles
     */
    public static function constrainToFamilies(Builder $query, array $familles): void
    {
        $valeurs = array_map(static fn (NotificationFamily $f): string => $f->value, $familles);
        $codes = array_keys(array_filter(self::CODES, static fn (array $ligne): bool => in_array($ligne[0], $valeurs, true)));
        $types = array_keys(array_filter(self::TYPES, static fn (string $famille): bool => in_array($famille, $valeurs, true)));
        $cibles = array_keys(array_filter(self::TARGETS, static fn (?string $famille): bool => in_array($famille, $valeurs, true)));
        $ciblesQuiTranchent = array_keys(array_filter(self::TARGETS, static fn (?string $famille): bool => $famille !== null));
        // Un type absent de la table tombe en `systeme` (`of()`) : le filtre le suit.
        $typesInconnus = in_array(NotificationFamily::Systeme->value, $valeurs, true);

        $genre = self::TARGET_KIND_SQL;

        $query->where(function (Builder $q) use ($codes, $types, $typesInconnus, $cibles, $ciblesQuiTranchent, $genre): void {
            $q->whereIn('code', $codes)
                ->orWhere(function (Builder $sansCode) use ($types, $typesInconnus, $cibles, $ciblesQuiTranchent, $genre): void {
                    $sansCode->where(fn (Builder $c) => $c->whereNull('code')->orWhereNotIn('code', array_keys(self::CODES)))
                        ->where(function (Builder $parCibleOuType) use ($types, $typesInconnus, $cibles, $ciblesQuiTranchent, $genre): void {
                            $parCibleOuType->whereIn(DB::raw($genre), $cibles)
                                // `NOT IN` rend NULL sur un genre NULL : l'absence de cible s'écrit à part.
                                ->orWhere(function (Builder $parType) use ($types, $typesInconnus, $ciblesQuiTranchent, $genre): void {
                                    $parType->where(fn (Builder $g) => $g->whereNull(DB::raw($genre))->orWhereNotIn(DB::raw($genre), $ciblesQuiTranchent))
                                        ->where(function (Builder $t) use ($types, $typesInconnus): void {
                                            $t->whereIn('type', $types);
                                            if ($typesInconnus) {
                                                $t->orWhereNotIn('type', array_keys(self::TYPES));
                                            }
                                        });
                                });
                        });
                });
        });
    }

    /**
     * Restreint aux notifications « à traiter » : leur code est marqué tel dans la table. Une ligne
     * sans code ne l'est jamais.
     *
     * @param  Builder<AppNotification>  $query
     */
    public static function constrainToAction(Builder $query): void
    {
        $query->whereIn('code', array_keys(array_filter(self::CODES, static fn (array $ligne): bool => $ligne[1])));
    }
}
