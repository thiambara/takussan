<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Services\Boost\BoostStatsRecorder;
use App\Support\Http\RobotUserAgent;
use App\Support\VisitorFingerprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2569 (amendement d'ADR-0061 du 2026-11-16, option (a) du porteur) — le NAVIGATEUR déclare les
 * emplacements sponsorisés qu'il a réellement affichés. `POST /api/public/properties/sponsored-impressions`
 * (corps `slugs[]=…`, formulaire) → 204, toujours.
 *
 * L'API ne compte plus rien au service : la recherche et l'accueil servent des emplacements que le
 * front peut ne pas insérer (tête de la première page sous des places réservées, doublon de la suite
 * continue — TCK-2500). Seul ce que l'écran a montré compte.
 *
 * - **Aucune fuite** : un slug inconnu, un bien qui n'est pas public, un bien sans vedette active
 *   rendent le même 204 sans corps, et ne comptent rien. Le filtre `public()` est ICI : le compteur
 *   (`liveFeaturedBoosts`) ne juge que le boost, pas la publication du bien.
 * - **Bornée** : au plus {@see self::MAX_SLUGS} slugs par appel (le surplus est ignoré), une
 *   impression par visiteur et par bien sur 30 min (TCK-708), aucune pour un robot déclaré
 *   (TCK-792), et le limiteur `public-sponsored-impressions`.
 */
final class PublicSponsoredImpressionController extends Controller
{
    /** Plus que les emplacements d'un écran : trois par page de douze, le front groupe par lot. */
    public const MAX_SLUGS = 24;

    public function __invoke(Request $request, BoostStatsRecorder $recorder): JsonResponse
    {
        $brut = $request->input('slugs');
        $slugs = is_array($brut)
            ? array_slice(array_values(array_unique(array_filter($brut, fn ($s) => is_string($s) && $s !== '' && strlen($s) <= 255))), 0, self::MAX_SLUGS)
            : [];

        if ($slugs !== [] && ! RobotUserAgent::is($request->userAgent())) {
            $ids = Property::query()
                ->public()
                ->whereNot('status', PropertyStatus::Draft)
                ->whereIn('slug', $slugs)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $recorder->declared($ids, VisitorFingerprint::of($request));
        }

        return $this->json(null, 204);
    }
}
