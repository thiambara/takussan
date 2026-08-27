<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * TCK-144 — Cross-tenant KPIs for the super-admin dashboard. Single endpoint
 * (no fan-out) returning the four blocks the platform console needs:
 * agencies, users, properties and revenue.
 *
 * TCK-360 — le bloc `trend` : le point de comparaison à J-30, et RIEN d'autre.
 *
 * L'accueil de la console rend une variation par tuile. Le calcul de la variation appartient au
 * front (c'est lui qui possède le texte affiché) ; ce qui appartient à l'API, c'est **la valeur
 * qu'avait la métrique à la date de coupure**, ou son absence.
 *
 * ⚠ HUIT des onze métriques de cette réponse n'ont PAS de point de comparaison, et n'en auront
 * pas sans table d'historique. Comptées PAR EXÉCUTION sur la réponse elle-même (2026-08-27) :
 * `agencies.verified` / `active` / `suspended` / `verification_rate`, `users.active`,
 * `properties.published`, `properties.pending_review`, `leases.active`. Toutes dérivent d'un
 * **statut courant** : la ligne ne porte aucune trace de ce qu'était son statut il y a trente
 * jours — une agence suspendue hier compte aujourd'hui comme suspendue depuis toujours. *Une
 * tendance reconstruite depuis un statut courant n'est pas une mesure, c'est une invention* ; ces
 * métriques sont donc absentes de `previous`, et le front ne rend alors aucun delta (contrainte
 * du ticket : « jamais de tendance inventée »).
 *
 * ⚠ Ce HUIT ne contredit pas le CINQ du ticket et du front : les deux ne comptent pas la même
 * chose. Ici, des métriques de la réponse ; là-bas, des TUILES de l'accueil — cinq des huit n'ont
 * jamais de delta. `users.active` et `verification_rate` y sont des précisions sous une autre
 * tuile, et `leases.active` n'y est pas rendue du tout. Le docblock précédent écrivait « trois
 * des huit » puis en énumérait six : il mélangeait les deux dénombrements et n'en donnait aucun
 * juste.
 *
 * ⚠ Ce que `previous` reconstruit exactement : « les enregistrements ENCORE présents dont la
 * création précède la coupure ». Ce n'est pas un instantané — `Agency` et `User` portent
 * `SoftDeletes`, une ligne supprimée depuis manque des deux côtés. C'est la seule reconstruction
 * possible sans historiser, et elle est nommée ici plutôt que devinée plus tard.
 */
class SystemMetricsController extends Controller
{
    /** Fenêtre de comparaison, en jours. Alignée sur le « delta 30 jours » de l'accueil. */
    private const TREND_PERIOD_DAYS = 30;

    public function index(): JsonResponse
    {
        $totalAgencies = Agency::query()->count();
        $verifiedAgencies = Agency::query()->where('is_verified', true)->count();
        $activeAgencies = Agency::query()->where('status', AgencyStatus::Active)->count();
        $suspendedAgencies = Agency::query()->where('status', AgencyStatus::Suspended)->count();

        $totalUsers = User::query()->count();
        $activeUsers = User::query()->where('status', UserStatus::Active)->count();

        $publishedProperties = Property::query()->where('status', PropertyStatus::Published)->count();
        $pendingProperties = Property::query()->where('status', PropertyStatus::PendingReview)->count();

        $activeLeases = Lease::query()->where('status', LeaseStatus::Active)->count();

        $platformRevenue = (float) LeasePayment::query()
            ->where('status', PaymentStatus::Paid)
            ->sum('amount');

        return $this->json([
            'data' => [
                'agencies' => [
                    'total' => $totalAgencies,
                    'verified' => $verifiedAgencies,
                    'active' => $activeAgencies,
                    'suspended' => $suspendedAgencies,
                    'verification_rate' => $totalAgencies > 0
                        ? round($verifiedAgencies / $totalAgencies, 4)
                        : 0.0,
                ],
                'users' => [
                    'total' => $totalUsers,
                    'active' => $activeUsers,
                ],
                'properties' => [
                    'published' => $publishedProperties,
                    'pending_review' => $pendingProperties,
                ],
                'leases' => [
                    'active' => $activeLeases,
                ],
                'revenue' => [
                    'platform_total_paid' => $platformRevenue,
                    'currency' => 'XOF',
                ],
                'trend' => $this->trend(),
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * Le point de comparaison à J-30 — une clé par métrique REELLEMENT reconstructible.
     *
     * Une clé absente est un contrat : « pas de point de comparaison ». Le front n'a donc jamais à
     * deviner si un `0` veut dire « zéro » ou « inconnu » — et c'est bien un `0` qu'on omet ici :
     * sans une seule ligne antérieure à la coupure, la « variation » vaut la totalité du jeu de
     * données. Ce n'est pas une tendance sur 30 jours, c'est l'âge de la plateforme.
     *
     * @return array<string, mixed>
     */
    private function trend(): array
    {
        $cutoff = now()->subDays(self::TREND_PERIOD_DAYS);

        $previous = [];

        $agenciesBefore = Agency::query()->where('created_at', '<', $cutoff)->count();
        if ($agenciesBefore > 0) {
            $previous['agencies_total'] = $agenciesBefore;
        }

        $usersBefore = User::query()->where('created_at', '<', $cutoff)->count();
        if ($usersBefore > 0) {
            $previous['users_total'] = $usersBefore;
        }

        // Le revenu est cumulatif et daté par `paid_at` — mais cette colonne est NULLABLE. Un
        // encaissement sans date n'appartient à aucune fenêtre : il manquerait du seul côté
        // « avant » et gonflerait la croissance d'autant. Tant qu'il en existe un, il n'y a pas de
        // point de comparaison honnête, et la clé reste absente.
        $paidWithoutDate = LeasePayment::query()
            ->where('status', PaymentStatus::Paid)
            ->whereNull('paid_at')
            ->exists();

        $paidBefore = LeasePayment::query()
            ->where('status', PaymentStatus::Paid)
            ->where('paid_at', '<', $cutoff);

        if (! $paidWithoutDate && $paidBefore->clone()->exists()) {
            $previous['revenue_platform_total_paid'] = (float) $paidBefore->sum('amount');
        }

        return [
            'period_days' => self::TREND_PERIOD_DAYS,
            'since' => $cutoff->toIso8601String(),
            'previous' => $previous,
        ];
    }
}
