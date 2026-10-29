<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\RevokeRadarAdvertiserRequest;
use App\Models\RadarAdvertiser;
use App\Services\Radar\AdvertiserRevocation;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2391 (ADR-0077 §8) — révoquer un annonceur : ses biens quittent le public et l'index sur-le-champ, il ne se contacte plus.
 * Gardé par `super-admin` + `platform-can:platform.radar.publish` (`routes/api/admin-radar.php`). Le compte de l'annonceur reste :
 * `account_user_id` dit lequel, pour que le support le SUPPRIME par la voie de `features.md` § 2.1 — jamais le bloquer.
 */
class RadarRevocationController extends Controller
{
    public function revoke(RevokeRadarAdvertiserRequest $request, RadarAdvertiser $advertiser, AdvertiserRevocation $revocation): JsonResponse
    {
        $done = $revocation->revoke($advertiser, $request->reason(), $request->user());

        return $this->json(['data' => [
            'advertiser_id' => $done['advertiser']->id,
            'do_not_contact_at' => $done['advertiser']->do_not_contact_at?->toIso8601String(),
            'closed_listing_ids' => $done['closed'],
            'revoked_consent_ids' => $done['revoked_consents'],
            'retired_property_ids' => $done['retired_properties'],
            'account_user_id' => $done['advertiser']->user_id,
        ]]);
    }
}
