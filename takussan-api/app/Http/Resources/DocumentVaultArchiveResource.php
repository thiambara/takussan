<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\DocumentVaultArchive;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14) — l'état d'une archive préparée du coffre, à son seul
 * demandeur (`GET|POST /api/me/document-vault/archives`).
 *
 * `download_path` n'existe que pour une archive prête : un chemin d'API RELATIF, signé jusqu'à
 * l'expiration de l'archive, que le front ouvre avec le jeton de la session (`useTelechargementApi`) ;
 * la route vérifie en plus que le compte est le demandeur. Ni chemin de stockage ni identifiant de
 * document : `id` est l'identifiant opaque de la préparation.
 *
 * @mixin DocumentVaultArchive
 */
class DocumentVaultArchiveResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var DocumentVaultArchive $archive */
        $archive = $this->resource;

        return [
            'id' => $archive->uuid,
            'folder' => $archive->folder,
            'status' => $this->enumValue($archive->status),
            'error_code' => $archive->error_code,
            'entries_count' => $archive->entries_count,
            'expires_at' => $this->iso($archive->expires_at),
            'created_at' => $this->iso($archive->created_at),
            'download_path' => $archive->estPrete()
                ? URL::temporarySignedRoute('me.document-vault.archives.download', $archive->expires_at, ['archive' => $archive->uuid], absolute: false)
                : null,
        ];
    }
}
