<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\GeoCoverImportRequest;
use App\Http\Requests\Admin\GeoCoverUploadRequest;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Services\Geo\CommonsIndisponible;
use App\Services\Geo\WikimediaCovers;
use App\Services\Media\AvatarReencode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * TCK-2844 (ADR-0109 §2) — la photo d'un quartier, posée par le super-admin seul (routes sous
 * `admin/geo` et le middleware `super-admin`), et seulement sur un quartier APPROUVÉ et non
 * fusionné. Les deux écritures rendent la ligne au format de l'index de la console.
 */
class GeoNeighborhoodCoverController extends Controller
{
    public function __construct(
        private readonly WikimediaCovers $commons,
        private readonly GeoNeighborhoodAdminController $index,
    ) {}

    public function suggestions(GeoNeighborhood $neighborhood): JsonResponse
    {
        $this->exigerApprouve($neighborhood);
        $resultat = $this->commons->suggestions($neighborhood);

        return $this->json(['data' => $resultat['items'], 'meta' => ['unavailable' => $resultat['unavailable']]]);
    }

    public function store(GeoCoverUploadRequest $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        $this->exigerApprouve($neighborhood);
        $fichier = $request->file('file');

        // Réencodé comme un avatar : l'original vit sur le disque PUBLIC, et l'EXIF d'une photo
        // prise au téléphone porte sa position GPS (TCK-762).
        $neighborhood
            ->addMedia(AvatarReencode::sansMetadonnees($fichier))
            ->usingName(pathinfo($fichier->getClientOriginalName(), PATHINFO_FILENAME))
            ->usingFileName(AvatarReencode::nomDeFichier($fichier))
            ->withCustomProperties(['source' => 'upload'])
            ->toMediaCollection('cover');

        return $this->json(['data' => $this->index->ligne($neighborhood->refresh())]);
    }

    public function import(GeoCoverImportRequest $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        $this->exigerApprouve($neighborhood);
        $titre = (string) $request->validated('title');

        try {
            $fichier = $this->commons->fichier($titre);
            abort_code_if($fichier === null, 422, 'geo_cover.source_not_found');
            // Relu MAINTENANT : une licence changée depuis la proposition est refusée, et rien
            // n'est téléchargé.
            abort_code_if($fichier['attribution_required'], 422, 'geo_cover.attribution_required');
            $chemin = $this->commons->telecharger($fichier['download_url']);
        } catch (CommonsIndisponible) {
            abort_code(503, 'geo_cover.source_unavailable');
        }
        abort_code_if($chemin === null, 422, 'geo_cover.source_invalid');

        $nom = Str::limit(Str::slug(pathinfo(Str::after($fichier['title'], 'File:'), PATHINFO_FILENAME)), 100, '') ?: 'quartier';
        // Réencodé comme un envoi : un import et un envoi rangent le même genre de fichier, sans EXIF.
        $telecharge = new UploadedFile($chemin, $nom, null, null, true);
        $extension = $telecharge->guessExtension() ?? 'jpg';
        try {
            $reencode = AvatarReencode::sansMetadonnees($telecharge);
        } finally {
            @unlink($chemin);
        }

        $neighborhood
            ->addMedia($reencode)
            ->usingName($nom)
            ->usingFileName($nom.'.'.$extension)
            ->withCustomProperties([
                'source' => 'wikimedia',
                'source_url' => $fichier['page_url'],
                'title' => $fichier['title'],
                'author' => $fichier['author'],
                'license' => $fichier['license'],
            ])
            ->toMediaCollection('cover');

        return $this->json(['data' => $this->index->ligne($neighborhood->refresh())]);
    }

    public function destroy(GeoNeighborhood $neighborhood): Response
    {
        $neighborhood->clearMediaCollection('cover');

        return response()->noContent();
    }

    private function exigerApprouve(GeoNeighborhood $quartier): void
    {
        abort_code_if(
            $quartier->status !== ReferentialStatus::Approved || $quartier->merged_into_id !== null,
            422,
            'geo_cover.not_approved',
        );
    }
}
