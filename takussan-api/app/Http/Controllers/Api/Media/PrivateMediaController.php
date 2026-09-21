<?php

namespace App\Http\Controllers\Api\Media;

use App\Http\Controllers\Base\Controller;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\RedirectResponse;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-539 — `GET /api/media/{media}/file`, la cible des URL signées émises par
 * {@see PrivateMediaAccess::signedUrl()} à la place de l'URL directe d'un fichier privé.
 *
 * La route n'exige PAS `auth:sanctum`, délibérément : le front authentifie par jeton `Bearer`
 * (`takussan-web/src/lib/api.ts`), qu'un `<a href>` ou un `<object data>` n'envoie pas. La
 * signature — émise dans une réponse déjà autorisée, liée à l'identifiant du média, limitée dans
 * le temps — porte l'autorisation, comme la présignature du seau qu'elle relaie.
 */
class PrivateMediaController extends Controller
{
    public function __invoke(Media $media, PrivateMediaAccess $access): RedirectResponse|StreamedResponse
    {
        return $access->redirect($media);
    }
}
