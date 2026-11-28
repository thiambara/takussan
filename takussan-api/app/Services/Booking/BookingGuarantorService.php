<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\DossierPiece;
use App\Models\Guarantor;
use App\Models\User;
use App\Services\Property\ContactDeLAgenceDuBien;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-2893 (ADR-0110 § 3) — les garants d'une candidature ou d'une offre, écrits en un seul
 * endroit : la route `POST /api/bookings/{booking}/guarantors` et le garant facultatif de la
 * création (saisie du personnel, tunnel public).
 *
 * - **Trois au plus**, sur une candidature ou une offre seulement (un séjour : 422
 *   `booking.guarantor_not_for_kind`), tant que la réservation est ouverte (422
 *   `booking.dossier_closed`, la règle du dossier).
 * - **Réutilise `guarantors`** (ADR-0070 : pièce et revenu chiffrés) : une fiche existante de
 *   l'agence du bien, que l'appelant lit, ou une fiche neuve créée APRÈS les refus, dans la
 *   transaction (un 422 ne laisse aucune fiche orpheline, TCK-2113).
 * - **Le dossier suit** : le premier garant ajoute `guarantor_commitment` et `guarantor_identity`
 *   (`BookingDossierService::addPieces`) ; le dernier retiré les retire, sauf une pièce reçue.
 */
final class BookingGuarantorService
{
    /** ADR-0110 § 3 — comme le bail (`lease.max_guarantors`). */
    public const MAX_GUARANTORS = 3;

    public function __construct(private readonly BookingDossierService $dossier) {}

    /**
     * @param  array<string, mixed>  $data  `guarantor_id`, ou les champs d'une fiche neuve
     */
    public function attach(Booking $booking, array $data, User $user): Guarantor
    {
        $existant = null;
        if (! empty($data['guarantor_id'])) {
            $existant = Guarantor::query()->findOrFail((int) $data['guarantor_id']);
            // Un garant hors du périmètre de l'appelant, ou d'une autre agence que celle du bien, ne se
            // rattache pas : sa fiche se lirait ensuite par la réservation (même règle qu'au bail).
            abort_unless(Gate::forUser($user)->allows('view', $existant), 403);
            abort_unless(ContactDeLAgenceDuBien::garant($existant, $booking->agency_id), 403);
        }

        return DB::transaction(function () use ($booking, $existant, $data, $user): Guarantor {
            /** @var Booking $locked */
            $locked = Booking::query()->whereKey($booking->getKey())->lockForUpdate()->firstOrFail();

            abort_code_unless(
                in_array($locked->kind, [BookingKind::Application, BookingKind::Offer], true),
                422,
                'booking.guarantor_not_for_kind',
            );
            abort_code_unless(
                in_array($locked->status, GestesDeLaReservation::STATUTS_DU_DOSSIER_OUVERT, true),
                422,
                'booking.dossier_closed',
            );

            $attaches = $locked->guarantors()->lockForUpdate()->get(['guarantors.id']);
            abort_code_if($existant !== null && $attaches->contains('id', $existant->id), 422, 'booking.guarantor_already_attached');
            abort_code_if($attaches->count() >= self::MAX_GUARANTORS, 422, 'booking.max_guarantors');

            $guarantor = $existant ?? Guarantor::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'phone' => $data['phone'] ?? null,
                'email' => $data['email'] ?? null,
                'id_type' => $data['id_type'] ?? null,
                'id_number' => $data['id_number'] ?? null,
                'occupation' => $data['occupation'] ?? null,
                'employer' => $data['employer'] ?? null,
                'monthly_income' => $data['monthly_income'] ?? null,
                'relationship_to_tenant' => $data['relationship_to_tenant'] ?? null,
                'notes' => $data['notes'] ?? null,
                'added_by_id' => $user->id,
                // L'agence de la réservation (celle du bien) : son personnel lit la fiche.
                'agency_id' => $locked->agency_id,
            ]);

            $locked->guarantors()->attach($guarantor->id);
            $this->dossier->addPieces($locked, DossierPiece::forGuarantor());

            return $guarantor;
        });
    }

    /** Retire un garant ; le dernier retiré retire ses pièces du dossier, sauf une pièce reçue. */
    public function detach(Booking $booking, Guarantor $guarantor): int
    {
        return DB::transaction(function () use ($booking, $guarantor): int {
            /** @var Booking $locked */
            $locked = Booking::query()->whereKey($booking->getKey())->lockForUpdate()->firstOrFail();
            $attaches = $locked->guarantors()->lockForUpdate()->get(['guarantors.id']);
            abort_code_unless($attaches->contains('id', $guarantor->id), 404, 'booking.guarantor_not_attached');
            abort_code_unless(
                in_array($locked->status, GestesDeLaReservation::STATUTS_DU_DOSSIER_OUVERT, true),
                422,
                'booking.dossier_closed',
            );

            $locked->guarantors()->detach($guarantor->id);
            $restants = $attaches->count() - 1;
            if ($restants === 0) {
                $this->dossier->removePieces($locked, DossierPiece::forGuarantor());
            }

            return $restants;
        });
    }
}
