<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Enums\Capability;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-279 — `GET /api/me/capabilities` : ce que l'utilisateur courant peut
 * faire, dans l'agence courante.
 *
 * ## Pourquoi cet endpoint existe
 *
 * Le front doit remplacer ses gardes `isAdmin(user.roles)` — qui raisonnent
 * sur un TYPE de profil — par `useCan(Capability)`, qui raisonne sur une
 * capacité. Sans cette réponse, le hook n'a rien à lire : `UserResource`
 * expose `roles` (les types de profils) et **pas** les capacités.
 *
 * ## Ce qu'il n'est PAS
 *
 * ⚠️ **Ce n'est pas une autorisation, c'est un affichage.** Il sert à ne pas
 * proposer un bouton qui rendra 403 — jamais à décider si l'action est permise.
 * Cette décision reste entière côté serveur, dans les policies : un front qui
 * ment ne doit rien pouvoir ouvrir. Toute lecture de cette réponse qui
 * remplacerait une vérification serveur serait une régression.
 *
 * ## L'agence
 *
 * Résolue dans l'ordre du dépôt : `?agency_id` explicite (refusé si
 * l'utilisateur n'y a pas de profil), puis le profil actif
 * (`ResolveActiveProfile`), puis rien — auquel cas seules les capacités
 * plateforme s'expriment, ce qui est exactement le cas d'un super-admin.
 */
class MeCapabilityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $agency = $this->resolveAgency($request);

        $granted = [];
        foreach (Capability::cases() as $capability) {
            if ($user->canActAt($capability, $agency)) {
                $granted[] = $capability->value;
            }
        }

        return $this->json([
            'data' => [
                'agency_id' => $agency?->id,
                'capabilities' => $granted,
            ],
        ]);
    }

    /**
     * ⚠️ Un `?agency_id` que l'utilisateur ne possède pas retombe sur `null`,
     * il ne lève pas : la réponse dit alors « aucune capacité dans cette
     * agence », ce qui est la vérité. Lever 403 ici transformerait une
     * question d'affichage en énumération — on apprendrait, par le code de
     * statut, quelles agences existent.
     */
    private function resolveAgency(Request $request): ?Agency
    {
        $explicit = $request->integer('agency_id');
        if ($explicit > 0) {
            $user = $request->user();
            // `hasProfileAt()` exige un TYPE de profil ; la question ici est
            // « un profil, n'importe lequel ». On compose les prédicats déjà
            // écrits plutôt que d'interroger les tables à la main.
            $member = $user->isAgencyAdminAt($explicit)
                || $user->isAgentAt($explicit)
                || $user->isOwnerAt($explicit)
                || $user->isProviderAt($explicit);

            return $member ? Agency::query()->find($explicit) : null;
        }

        $profile = $request->activeProfile();

        return $profile?->agency_id ? Agency::query()->find($profile->agency_id) : null;
    }
}
