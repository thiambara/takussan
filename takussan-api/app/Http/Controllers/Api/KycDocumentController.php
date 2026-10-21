<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\KycDossier;
use App\Policies\AgencyPolicy;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class KycDocumentController extends Controller
{
    public function __invoke(Request $request, Media $media, PrivateMediaAccess $access, PersonalDataAccessLogger $accessLog)
    {
        // TCK-1059 (P73.02) — relative, comme l'émission (`RelativeSignedUrl`).
        abort_unless($request->hasValidSignature(false), 403);
        abort_unless($media->model instanceof KycDossier, 404);
        $this->authorizeDocument($request, $media->model);

        // TCK-601 (coordination 546) — UN appel, après les gardes : un refus n'est pas une
        // consultation. Le sujet est le dossier ; la surface dit que c'est la pièce qui a été lue.
        $accessLog->record($request->user(), $media->model, PersonalDataAccessLogger::SURFACE_KYC_DOCUMENT);

        // TCK-539 — EN FLUX, pas par redirection présignée : c'est une pièce d'identité, et une
        // URL présignée est un droit au porteur que la déconnexion ne révoque pas. Le fichier
        // est petit ; il ne sort qu'après les trois gardes, à chaque lecture.
        return $access->stream($media, 'inline');
    }

    /**
     * TCK-1148 (P82.05) — une pièce du dossier d'agence se lit sous la règle du dossier,
     * {@see AgencyPolicy::updateKyc()} ; un dossier d'un autre sujet, par le seul
     * super-admin. Relais gardé pour l'exemption de `scripts/check-controller-authorization.mjs`.
     */
    private function authorizeDocument(Request $request, KycDossier $dossier): void
    {
        $subject = $dossier->subject;

        abort_unless(
            $request->user()->isSuperAdmin()
            || ($subject instanceof Agency && $request->user()->can('updateKyc', $subject)),
            403,
        );
    }
}
