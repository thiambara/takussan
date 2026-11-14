<?php

namespace App\Services\Owners;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Payout\OwnerStatementService;
use App\Services\Payout\PiecesNonReversees;

/**
 * TCK-2753 (ADR-0108 § 1 à 4) — ce qu'un bailleur laisse encore dans une agence, et qui empêche son
 * départ. UNE méthode compte, pour les trois lecteurs : la lecture avant le geste
 * (`GET /api/owners/{id}/departure`), la garde du geste sous verrou et le corps de son refus
 * (`OwnerDepartureService`) — comme `AgentPortfolio` pour le retrait d'un agent.
 *
 *  - `properties` : ses biens non supprimés de l'agence (`properties.user_id`, au sens de
 *    `BailleurDuBien`), de TOUT statut, archivé et vendu compris (§ 1) ;
 *  - `leases` : ses baux de l'agence (`leases.landlord_id`) en brouillon, en attente de signature, en
 *    cours ou en préavis, MÊME sur un bien supprimé : la suppression d'un bien ne regarde pas ses baux
 *    (§ 2). Un brouillon abandonné (supprimé, TCK-2764) ne compte plus ;
 *  - `positive_balance` : 1 si le SOLDE cumulé au jour lui est dû (`OwnerStatementService::balance()`,
 *    TCK-2760), jamais le reste d'une période (§ 3) ;
 *  - `upcoming_payouts` : ses reversements de l'agence en cours (`PayoutStatus::upcoming()`) ;
 *  - `unpaid_out_pieces` : ses pièces reversables qu'aucun reversement ne porte
 *    ({@see PiecesNonReversees}, la règle de l'effacement d'un compte).
 *
 * Ce qu'il DOIT à l'agence ne bloque pas (§ 3) : la reprise en attente et le trop-versé se lisent à
 * part, pour le journal du départ (`OwnerDepartureService`).
 */
final class OwnerDeparture
{
    /** Les clés du refus, dans l'ordre d'ADR-0108 § 4. */
    public const CLES = ['properties', 'leases', 'positive_balance', 'upcoming_payouts', 'unpaid_out_pieces'];

    /** @var list<LeaseStatus> les baux « en cours ou à venir » (§ 2) */
    public const BAUX_EN_COURS = [LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Active, LeaseStatus::Terminating];

    public function __construct(
        private readonly OwnerStatementService $statements,
        private readonly PiecesNonReversees $pieces,
    ) {}

    /**
     * L'inventaire et le solde, pour un profil rattaché à un compte. Le solde est lu au jour, sans le
     * mémo de requête du carnet (`OwnerDirectory::soldesDeLaRequete`, réservé aux `GET`) : la garde
     * recompte dans la transaction du geste.
     *
     * @return array{blocking: array{properties: int, leases: int, positive_balance: int, upcoming_payouts: int, unpaid_out_pieces: int}, balance: array{remaining_to_pay: float, as_of: string}}
     */
    public function inventory(OwnerProfile $profile): array
    {
        $agency = Agency::query()->findOrFail((int) $profile->agency_id);
        $landlord = User::withTrashed()->findOrFail((int) $profile->user_id);
        $agencyId = (int) $agency->id;
        $balance = $this->statements->balance($agency, $landlord);

        return [
            'blocking' => [
                'properties' => Property::query()
                    ->where('agency_id', $agencyId)
                    ->where('user_id', $landlord->id)
                    ->count(),
                'leases' => Lease::query()
                    ->where('agency_id', $agencyId)
                    ->where('landlord_id', $landlord->id)
                    ->whereIn('status', array_map(fn (LeaseStatus $s): string => $s->value, self::BAUX_EN_COURS))
                    ->count(),
                'positive_balance' => round((float) $balance['remaining_to_pay'], 2) > 0 ? 1 : 0,
                'upcoming_payouts' => Payout::query()
                    ->where('agency_id', $agencyId)
                    ->where('landlord_id', $landlord->id)
                    ->where('payee_role', PayeeRole::Landlord->value)
                    ->whereIn('status', array_map(fn (PayoutStatus $s): string => $s->value, PayoutStatus::upcoming()))
                    ->count(),
                'unpaid_out_pieces' => $this->pieces->compte($landlord, $agencyId),
            ],
            'balance' => [
                'remaining_to_pay' => round((float) $balance['remaining_to_pay'], 2),
                'as_of' => $balance['as_of'],
            ],
        ];
    }

    /** @param  array<string, int>  $blocking */
    public static function estVide(array $blocking): bool
    {
        return array_sum($blocking) === 0;
    }
}
