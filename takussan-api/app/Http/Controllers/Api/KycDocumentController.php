<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\KycDossier;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class KycDocumentController extends Controller
{
    public function __invoke(Request $request, Media $media, PrivateMediaAccess $access, PersonalDataAccessLogger $accessLog)
    {
        abort_unless($request->hasValidSignature(), 403);
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

    private function authorizeDocument(Request $request, KycDossier $dossier): void
    {
        $user = $request->user();
        $subject = $dossier->subject;

        abort_unless(
            $user->isSuperAdmin()
            || (
                $subject instanceof Agency
                && $request->activeProfile()?->agency_id === $subject->id
                && $user->isAgencyAdminAt((int) $subject->id)
            ),
            403,
        );
    }
}
