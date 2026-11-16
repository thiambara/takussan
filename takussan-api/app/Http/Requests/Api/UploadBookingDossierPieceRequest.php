<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\FichierNonVide;
use App\Services\Booking\BookingDossierService;

/**
 * TCK-2872 (ADR-0110 § 2) — `POST /api/bookings/{booking}/dossier/{piece}/document` : le dépôt
 * d'une pièce du dossier, multipart, 10 Mo.
 *
 * Les types sont ceux de la pièce (PDF, JPEG, PNG, HEIC/HEIF — une photo de téléphone), et non la
 * liste large des documents (`AcceptedUploads::document`, qui admet aussi tableurs et texte).
 */
class UploadBookingDossierPieceRequest extends BaseFormRequest
{
    public const EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif'];

    public const MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];

    public const MAX_KILOBYTES = 10240;

    /**
     * L'autorisation court AVANT la validation (`BookingPolicy::uploadDossierPiece` : le client de
     * la réservation ou le personnel de l'agence du bien) ; puis le 404 d'un séjour, qui n'a pas de
     * dossier, avant le 422 d'un fichier refusé.
     */
    public function authorize(): bool
    {
        $booking = $this->route('booking');
        if ($this->user()?->can('uploadDossierPiece', $booking) !== true) {
            return false;
        }
        app(BookingDossierService::class)->assertHasDossier($booking);

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'file' => [
                'required', 'file',
                'mimes:'.implode(',', self::EXTENSIONS),
                'mimetypes:'.implode(',', self::MIMETYPES),
                new FichierNonVide,
                'max:'.self::MAX_KILOBYTES,
            ],
        ];
    }
}
