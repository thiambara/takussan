<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\ContactLeadPublicRequest;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\ReviewResource;
use App\Models\Enums\ContractType;
use App\Models\Enums\NotificationType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\Review;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-177 + TCK-276 — public agent profile.
 *
 * `GET /api/public/agents/{slug}` returns the agent's contact card
 * (incl. bio, derived city, specialty, years_of_experience), the public
 * portfolio, derived stats, and approved reviews. Uses `User.username`
 * as the slug; only users in `active` status surface here.
 */
class PublicAgentController extends Controller
{
    public function show(Request $request, string $slug): JsonResponse
    {
        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->with(['agency', 'addresses', 'agentProfiles'])
            ->first();

        abort_if($agent === null, 404);

        $portfolioBase = fn () => Property::query()
            ->where('user_id', $agent->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public);

        $portfolio = $portfolioBase()
            ->with('address')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->limit(24)
            ->get();

        $rentCount = $portfolioBase()->where('contract_type', ContractType::Rent)->count();
        $saleCount = $portfolioBase()->where('contract_type', ContractType::Sale)->count();
        $portfolioTotal = $portfolioBase()->count();
        $citiesCount = $portfolioBase()
            ->join('addresses', function ($join) {
                $join->on('addresses.addressable_id', '=', 'properties.id')
                    ->where('addresses.addressable_type', '=', Property::class);
            })
            ->distinct()
            ->count('addresses.city');

        $profile = $agent->agency
            ? $agent->agentProfiles->firstWhere('agency_id', $agent->agency->id)
            : $agent->agentProfiles->first();

        $yearsOfExperience = null;
        if ($profile?->hire_date) {
            $diff = $profile->hire_date->diffInYears(now());
            $yearsOfExperience = (int) max(0, floor($diff));
        }

        $reviewsQuery = Review::query()
            ->where('reviewable_type', User::class)
            ->where('reviewable_id', $agent->id)
            ->where('is_approved', true);

        $reviewsCount = (clone $reviewsQuery)->count();
        $reviewsAverage = $reviewsCount > 0
            ? round((float) (clone $reviewsQuery)->avg('rating'), 1)
            : null;
        $reviewsRecent = $reviewsCount > 0
            ? (clone $reviewsQuery)->with('author')->latest()->limit(6)->get()
            : collect();

        return $this->json([
            'data' => [
                'id' => $agent->id,
                'slug' => $agent->username,
                'first_name' => $agent->first_name,
                'last_name' => $agent->last_name,
                'full_name' => trim($agent->first_name.' '.$agent->last_name),
                // TCK-441 — `email` N'EST PAS servi ici, et c'est le coeur du ticket.
                // `User::$email` est l'IDENTIFIANT DE CONNEXION : `fillable` a cote de
                // `password`, normalise en minuscules pour l'index unique. Le publier sur un
                // endpoint anonyme et enumerable par slug, c'est offrir la moitie du formulaire
                // de connexion — et c'est exactement ce que PublicAgencyController retire deja
                // pour ces memes personnes, que `TeamStrip` liait pourtant jusqu'ici.
                //
                // Le TELEPHONE reste public : c'est une coordonnee de joignabilite, pas un
                // identifiant, et un agent immobilier veut etre appele. Decision du ticket.
                'phone' => $agent->phone,
                'avatar_url' => $agent->avatar_url ?? null,
                'bio' => $agent->bio,
                'city' => $agent->addresses->first()?->city,
                'preferred_language' => $agent->preferred_language,
                'specialty' => $profile?->specialty,
                'years_of_experience' => $yearsOfExperience,
                'agency' => $agent->agency ? [
                    'id' => $agent->agency->id,
                    'name' => $agent->agency->name,
                    'slug' => $agent->agency->slug,
                ] : null,
                'stats' => [
                    'rent_count' => $rentCount,
                    'sale_count' => $saleCount,
                    'cities' => $citiesCount,
                    'years' => $yearsOfExperience,
                ],
                'portfolio_count' => $portfolio->count(),
                'portfolio_total' => $portfolioTotal,
                'portfolio' => PropertyResource::collection($portfolio)->toArray($request),
                'reviews' => [
                    'average' => $reviewsAverage,
                    'count' => $reviewsCount,
                    'recent' => ReviewResource::collection($reviewsRecent)->toArray($request),
                ],
            ],
        ]);
    }

    /**
     * TCK-441 — contact ANONYME d'un agent, en remplacement du `mailto:` retire ci-dessus.
     *
     * ⚠️ Aucune authentification, et c'est deliberé : le regime du contact public de ce depot est
     * celui de `properties/{slug}/contact-lead`, anonyme depuis TCK-161. La barriere est le
     * `throttle` et le pot de miel, jamais un compte a creer. Un ticket qui rendrait le contact
     * d'un agent plus difficile qu'avant aurait manque son objet.
     *
     * La piste est rattachee a l'AGENCE de l'agent — frontiere d'isolation, principe n°2 — et
     * porte `property_id` a null : c'est ce que la migration de ce ticket a rendu possible.
     */
    public function contactLead(
        ContactLeadPublicRequest $request,
        NotificationService $notifications,
        string $slug,
    ): JsonResponse {
        $data = $request->validated();

        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->with('agency')
            ->first();

        abort_if($agent === null, 404);

        // Pot de miel : on accepte sans rien ecrire, exactement comme le contact d'un bien.
        // Repondre 422 apprendrait au robot quel champ eviter.
        if (! empty($data['company'])) {
            return $this->json(['data' => ['accepted' => true]], 201);
        }

        $lead = PropertyContactLead::create([
            'property_id' => null,
            'agency_id' => $agent->agency?->id,
            'recipient_user_id' => $agent->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'message' => $data['message'],
            'ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);

        $notifications->notify(
            $agent,
            NotificationType::Message,
            'Nouveau lead anonyme',
            $data['name'].' ('.$data['email'].') : '.mb_strimwidth($data['message'], 0, 80, '…'),
            ['agent_id' => $agent->id, 'lead_id' => $lead->id],
        );

        return $this->json(['data' => ['accepted' => true]], 201);
    }

    /**
     * TCK-276 — paginated portfolio for the public agent page (load-more).
     */
    public function properties(Request $request, string $slug)
    {
        $agent = User::query()
            ->where('username', $slug)
            ->where('status', 'active')
            ->first();

        abort_if($agent === null, 404);

        $perPage = min(max((int) $request->input('per_page', 24), 1), 48);

        $properties = Property::query()
            ->where('user_id', $agent->id)
            ->where('status', PropertyStatus::Available)
            ->where('visibility', PropertyVisibility::Public)
            ->with('address', 'media')
            ->orderByDesc('published_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return PropertyResource::collection($properties);
    }
}
