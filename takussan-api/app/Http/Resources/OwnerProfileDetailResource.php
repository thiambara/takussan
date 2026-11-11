<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Owners\OwnerDirectory;
use Illuminate\Http\Request;

/**
 * TCK-2640 — la fiche d'un bailleur (`GET /api/owners/{id}`), telle que la compose
 * {@see OwnerDirectory::detail()}. Les instants passent par `iso()` (ADR-0018) ; les montants sont
 * rendus tels quels (principe n° 3). Aucun identifiant sensible : ils restent derrière
 * `GET /api/owners/{id}/sensitive`.
 */
class OwnerProfileDetailResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var array<string, mixed> $detail */
        $detail = $this->resource;

        $detail['joined_at'] = $this->iso($detail['joined_at'] ?? null);
        if ($detail['last_payout'] !== null) {
            $detail['last_payout']['processed_at'] = $this->iso($detail['last_payout']['processed_at']);
        }

        return $detail;
    }
}
