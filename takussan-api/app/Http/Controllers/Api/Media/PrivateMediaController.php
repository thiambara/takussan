<?php

namespace App\Http\Controllers\Api\Media;

use App\Http\Controllers\Base\Controller;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
 *
 * TCK-2088 (P180.02, ADR-0029, amendement du 2026-10-23) — `?conversion=<nom>`, couvert par la
 * signature, sert la conversion au lieu de l'original : seulement si elle figure dans la liste de
 * sa collection et qu'elle est produite (404 sinon).
 */
class PrivateMediaController extends Controller
{
    public function __invoke(Request $request, Media $media, PrivateMediaAccess $access): RedirectResponse|StreamedResponse
    {
        if (! $request->query->has('conversion')) {
            return $access->redirect($media);
        }

        $conversion = $request->query('conversion');
        abort_unless(is_string($conversion) && $access->servesConversion($media, $conversion), 404);

        return $access->redirect($media, conversion: $conversion);
    }
}
