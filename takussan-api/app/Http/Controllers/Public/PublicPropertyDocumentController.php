<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Models\Document;
use App\Models\Property;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\RedirectResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-545 — `GET /api/public/properties/{property}/documents/{document}/file` : le fichier d'un
 * document PUBLIÉ d'un bien, sans authentification.
 *
 * `Document.file` est une collection PRIVÉE (TCK-538, ADR-0029 §3) : son `getUrl()` n'est servie
 * par personne. Ni URL signée — elle expirerait figée dans une page publique —, ni collection
 * publique — il faudrait déplacer le fichier à chaque changement de visibilité. L'URL est donc
 * STABLE et l'autorisation est l'ÉTAT, relu à chaque appel :
 *
 *   1. le bien est publiquement visible — `Property::scopePublic()`, la règle de la fiche ;
 *   2. le document appartient à CE bien ;
 *   3. `metadata.public` est vrai — le même filtre que `PropertyResource::buildDocuments()`.
 *
 * Tout échec rend 404, jamais 403 : l'existence d'un document non publié ne se révèle pas.
 * Décocher « public » révoque l'accès au prochain appel, sans rien déplacer. Les octets partent
 * par une URL présignée de 5 minutes (`PrivateMediaAccess::redirect()`).
 */
class PublicPropertyDocumentController extends Controller
{
    public function __invoke(int $property, int $document, PrivateMediaAccess $access): RedirectResponse|StreamedResponse
    {
        $bien = Property::query()->public()->findOrFail($property);

        /** @var Document $doc */
        $doc = $bien->documents()->whereKey($document)->firstOrFail();

        abort_unless((bool) data_get($doc->metadata, 'public', false), 404);

        $media = $doc->getFirstMedia('file');
        abort_if($media === null, 404);

        return $access->redirect($media, 'inline');
    }
}
