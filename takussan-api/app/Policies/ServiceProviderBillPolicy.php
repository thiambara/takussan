<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Maintenance\ProviderEligibility;
use App\Services\Property\BailleurDuBien;
use Illuminate\Auth\Access\Response;

/**
 * TCK-594 (ADR-0039 §8) — la facture d'intervention : le prestataire lit les siennes ; le
 * personnel de l'agence qui détient `payouts.create` les lit, les valide, les rejette, les paie.
 *
 * La LECTURE d'une facture d'autrui rend 404, pas 403 : `ServiceProviderBillController` résout la
 * facture dans le périmètre du lecteur avant toute policy. Les gestes se jugent ici.
 */
class ServiceProviderBillPolicy
{
    public function manage(User $user, ServiceProviderBill $bill): bool
    {
        if ($bill->agency_id === null || $user->staffAgencyId() !== (int) $bill->agency_id) {
            return false;
        }

        $agency = Agency::query()->find($bill->agency_id);

        return $agency !== null && $user->canActAt(Capability::PayoutsCreate, $agency);
    }

    /**
     * TCK-2911 (ADR-0120 § 1) — « Facturer » : le prestataire de la facture, et lui seul. Ni le
     * personnel (qui valide, il n'émet pas), ni un autre prestataire. Le statut se juge sous verrou.
     */
    public function submit(User $user, ServiceProviderBill $bill): bool
    {
        return $bill->provider_id !== null && (int) $bill->provider_id === (int) $user->id;
    }

    /**
     * TCK-2897 (ADR-0099, amendement du 2026-11-15) — le PDF d'une facture
     * (`GET service-provider-bills/{bill}/pdf`). Les lecteurs de la fiche (`ServiceProviderBillController::visibleTo`) :
     * le prestataire de la facture, brouillon compris, et le personnel de l'agence, hors brouillon ; plus le
     * BAILLEUR du bien pour une facture qui lui est refacturée (`scopeChargedToLandlord` : refacturable,
     * validée ou payée). Hors de ce cercle, 404 — la facture ne se révèle pas ; un autre prestataire de
     * l'agence, ou le bailleur du bien d'une facture qui ne lui est pas imputée, 403. Le super-admin passe
     * par `Gate::before`.
     */
    public function downloadPdf(User $user, ServiceProviderBill $bill): Response
    {
        if ($bill->provider_id !== null && (int) $bill->provider_id === (int) $user->id) {
            return Response::allow();
        }

        $agencyId = $bill->agency_id !== null ? (int) $bill->agency_id : null;
        if ($agencyId !== null && $user->staffAgencyId() === $agencyId && $bill->status !== ServiceProviderBillStatus::Draft) {
            return Response::allow();
        }

        $property = $bill->property;
        $landlord = $property !== null && BailleurDuBien::est($user, $property->user_id, $property->agency_id);
        if ($landlord && $bill->rechargeable_to_landlord
            && in_array($bill->status, ServiceProviderBill::CHARGED_TO_LANDLORD_STATUSES, true)) {
            return Response::allow();
        }

        $inTheCircle = $landlord
            || ($agencyId !== null && app(ProviderEligibility::class)->isActiveProviderAt($user, $agencyId));

        return $inTheCircle ? Response::deny() : Response::denyAsNotFound();
    }
}
