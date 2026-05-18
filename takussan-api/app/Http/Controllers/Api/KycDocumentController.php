<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\KycDossier;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class KycDocumentController extends Controller
{
    public function __invoke(Request $request, Media $media)
    {
        abort_unless($request->hasValidSignature(), 403);
        abort_unless($media->model instanceof KycDossier, 404);
        $this->authorizeDocument($request, $media->model);

        return response()->file($media->getPath(), [
            'Content-Type' => $media->mime_type,
            'Content-Disposition' => 'inline; filename="'.$media->file_name.'"',
        ]);
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
