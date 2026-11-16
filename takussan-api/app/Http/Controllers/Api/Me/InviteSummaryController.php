<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Services\Kyc\PiecesDuProfil;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * TCK-2939 (ADR-0094, amendement du 2026-11-15 § 6) — `GET /api/me/profiles/{profile}/invite-summary` : le résumé chiffré
 * que l'étape du numéro des assistants (bailleur, agent, prestataire) montre à l'invité, AVANT qu'il ait vérifié son
 * numéro — « N biens suivis par l'agence », « Votre dernier loyer », « N pièces à envoyer ».
 *
 * `{profile}` est l'identifiant composite de `GET /api/me/profiles` (`owner:12`). Le profil est résolu parmi ceux de
 * l'APPELANT ({@see ActiveProfileResolver::resolve()} : titulaire et actif), sinon 404 — y compris pour le profil d'un
 * bailleur dont l'invitation n'est pas encore acceptée, qui n'a pas de titulaire : avant l'acceptation, rien. Ce sont
 * les données du profil de l'appelant ; rien n'en sort vers le porteur d'un lien d'invitation.
 *
 * Forme unique pour les trois rôles, `null` là où la ligne ne le concerne pas :
 * `{ role, properties_count, titles, last_rent: {amount, paid_at}|null, missing_documents }`.
 */
class InviteSummaryController extends Controller
{
    /** Les titres de biens rendus, au plus. */
    public const TITLES_SHOWN = 3;

    public function __construct(
        private readonly ActiveProfileResolver $resolver,
        private readonly PiecesDuProfil $pieces,
    ) {}

    public function __invoke(Request $request, string $profile): JsonResponse
    {
        $resolved = $this->resolver->resolve($profile, $request->user());
        if (! $resolved instanceof OwnerProfile && ! $resolved instanceof AgentProfile && ! $resolved instanceof ServiceProviderProfile) {
            abort(404);
        }

        $properties = match (true) {
            $resolved instanceof OwnerProfile => $this->ownerProperties($resolved),
            // L'agent suit le parc de son agence : « N biens suivis par l'agence ».
            $resolved instanceof AgentProfile => $resolved->agency_id === null ? null : Property::query()->where('agency_id', $resolved->agency_id),
            default => null,
        };

        $missing = collect($this->pieces->pour($resolved))
            ->filter(fn (array $piece): bool => $piece['required'] && $piece['state'] === 'missing')
            ->count();

        return $this->json(['data' => [
            'role' => $this->resolver->aliasFor($resolved),
            'properties_count' => $properties === null ? null : (clone $properties)->count(),
            'titles' => $resolved instanceof OwnerProfile && $properties !== null
                ? (clone $properties)->orderBy('id')->limit(self::TITLES_SHOWN)->pluck('title')->filter()->values()->all()
                : [],
            'last_rent' => $resolved instanceof OwnerProfile && $properties !== null ? $this->lastRent($properties) : null,
            'missing_documents' => $missing,
        ]]);
    }

    /**
     * Les biens du bailleur dans l'agence de son profil : ceux de son compte (`user_id`, après l'acceptation), et ceux
     * encore saisis pour son profil (`pending_owner_profile_id`) — la règle du filtre `owner_profile_id` (TCK-2905).
     *
     * @return Builder<Property>
     */
    private function ownerProperties(OwnerProfile $profile): Builder
    {
        return Property::query()->where(function (Builder $q) use ($profile): void {
            $q->where('pending_owner_profile_id', $profile->id)
                ->orWhere(fn (Builder $compte) => $compte->where('user_id', $profile->user_id)->where('agency_id', $profile->agency_id));
        });
    }

    /**
     * Le dernier loyer encaissé sur l'un de ces biens : un `LeasePayment` de loyer, réglé, le plus récent par `paid_at`.
     *
     * @param  Builder<Property>  $properties
     * @return array{amount: float, paid_at: ?string}|null
     */
    private function lastRent(Builder $properties): ?array
    {
        $payment = LeasePayment::query()
            ->where('status', PaymentStatus::Paid->value)
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->whereNotNull('paid_at')
            ->whereHas('lease', fn (Builder $lease) => $lease->whereIn('property_id', (clone $properties)->select('properties.id')))
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->first(['id', 'amount', 'paid_at']);

        return $payment === null ? null : [
            'amount' => round((float) $payment->amount, 2),
            'paid_at' => $this->instant($payment->paid_at === null ? null : Carbon::parse($payment->paid_at)),
        ];
    }
}
