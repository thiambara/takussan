<?php

namespace App\Services\Owners;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Property\Occupation;
use App\Services\Reporting\OverdueInstalment;
use App\Support\Search\CleDeQuartier;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TCK-2640 — le bailleur tel que l'agence le lit : sa fiche, et les chiffres de sa ligne dans le
 * carnet (`GET /api/owners`).
 *
 * **Les montants ne sont jamais recalculés ici** : ils viennent du relevé de gérance servi
 * ({@see OwnerStatementSnapshots::served()} pour la fiche, {@see OwnerStatementSnapshots::servedTotals()}
 * pour une page de la liste) — la fiche, la liste et `GET /api/owner-statements` rendent le même
 * chiffre pour la même période, instantané envoyé compris.
 *
 * **Comptes** : un bien compte au bailleur quand il en est le titulaire (`properties.user_id`) dans
 * cette agence, non supprimé ni archivé ; « occupé » suit {@see Occupation}.
 */
final class OwnerDirectory
{
    public function __construct(private readonly OwnerStatementSnapshots $statements) {}

    /** Le mois des chiffres de la liste : le mois courant, à Dakar. */
    public static function currentPeriod(): string
    {
        return now(OverdueInstalment::TIMEZONE)->format('Y-m');
    }

    /**
     * Les colonnes calculées d'une ligne du carnet, en sous-requêtes : un nombre de requêtes qui ne
     * dépend pas de la taille de la page.
     *
     * - `properties_count`, `occupied_properties_count` ;
     * - `last_payout_at` : le dernier reversement AU BAILLEUR versé, dans l'agence du profil ;
     * - `contact_phone`, `contact_email` : ceux du compte, sinon ceux saisis à l'invitation
     *   (`metadata`) — le front ne lisait que `metadata.phone`, vide pour un compte déjà lié.
     *
     * @param  Builder<OwnerProfile>  $query
     */
    public function addListColumns(Builder $query): void
    {
        $properties = fn (): QueryBuilder => DB::table('properties')
            ->selectRaw('COUNT(*)')
            ->whereColumn('properties.user_id', 'owner_profiles.user_id')
            ->whereColumn('properties.agency_id', 'owner_profiles.agency_id')
            ->whereNull('properties.deleted_at')
            ->whereNull('properties.archived_at');

        $query->addSelect([
            'properties_count' => $properties(),
            'occupied_properties_count' => Occupation::whereOccupied($properties(), 'properties.id'),
            'last_payout_at' => DB::table('payouts')
                ->selectRaw('MAX(payouts.processed_at)')
                ->whereColumn('payouts.landlord_id', 'owner_profiles.user_id')
                ->whereColumn('payouts.agency_id', 'owner_profiles.agency_id')
                ->where('payouts.payee_role', PayeeRole::Landlord->value)
                ->where('payouts.status', PayoutStatus::Completed->value),
            'contact_phone' => DB::table('users')
                ->selectRaw("NULLIF(TRIM(users.phone), '')")
                ->whereColumn('users.id', 'owner_profiles.user_id'),
            'contact_email' => DB::table('users')
                ->selectRaw("NULLIF(TRIM(users.email), '')")
                ->whereColumn('users.id', 'owner_profiles.user_id'),
        ])->withCasts(['last_payout_at' => 'datetime', 'properties_count' => 'integer', 'occupied_properties_count' => 'integer']);
    }

    /**
     * Le repli des deux colonnes de contact sur ce que l'agence a saisi à l'invitation.
     *
     * @param  iterable<OwnerProfile>  $profiles
     */
    public function fillContactFallbacks(iterable $profiles): void
    {
        foreach ($profiles as $profile) {
            if (array_key_exists('contact_phone', $profile->getAttributes())) {
                $profile->setAttribute('contact_phone', $profile->getAttribute('contact_phone') ?? self::metadataString($profile, 'phone'));
                $profile->setAttribute('contact_email', $profile->getAttribute('contact_email') ?? self::metadataString($profile, 'email'));
            }
        }
    }

    /**
     * Le reste à verser du mois courant de chaque profil, ceux d'une page ou d'un périmètre
     * entier : une passe par agence ({@see OwnerStatementSnapshots::servedTotals()}). Un profil
     * sans compte (brouillon d'invitation) n'a pas de relevé : `null`.
     *
     * @param  Collection<int, OwnerProfile>  $profiles  avec `id`, `user_id`, `agency_id`
     * @return array<int, float|null> par id de profil
     */
    public function remainingToPay(Collection $profiles, ?string $period = null): array
    {
        $period ??= self::currentPeriod();
        $remaining = [];
        $agencies = Agency::query()->whereIn('id', $profiles->pluck('agency_id')->filter()->unique()->values())->get()->keyBy('id');

        foreach ($profiles->groupBy('agency_id') as $agencyId => $rows) {
            $agency = $agencies->get((int) $agencyId);
            $landlordIds = $rows->pluck('user_id')->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();
            $totals = $agency !== null ? $this->statements->servedTotals($agency, $landlordIds, $period) : [];
            foreach ($rows as $profile) {
                $remaining[(int) $profile->id] = $profile->user_id !== null && isset($totals[(int) $profile->user_id])
                    ? (float) $totals[(int) $profile->user_id]['remaining_to_pay']
                    : null;
            }
        }

        return $remaining;
    }

    /**
     * Le même calcul pour tout un périmètre de requête (le tri `remaining_to_pay`, le filtre
     * `has_remaining` : ils jugent tous les profils, pas la page).
     *
     * @param  Builder<OwnerProfile>  $scope
     * @return array<int, float|null>
     */
    public function remainingToPayIn(Builder $scope): array
    {
        $ids = (clone $scope)->reorder()->select('owner_profiles.id');
        $profiles = OwnerProfile::query()->whereIn('id', $ids)->get(['id', 'user_id', 'agency_id']);

        return $this->remainingToPay($profiles);
    }

    /**
     * TCK-2640 (AC5) — la recherche du carnet : nom, téléphone, e-mail (du compte, sinon de
     * l'invitation), raison sociale et employeur, sans casse NI ACCENTS (« sene » trouve
     * « Mouhamed SÈNE »).
     *
     * ⚠ Le repli d'accents est calculé en PHP, sur le périmètre de la requête (le carnet d'UNE
     * agence) : la base n'a pas `unaccent`, et ADR-0020 §2 / ADR-0025 refusent de l'installer sans
     * un ticket qui le porte. `CaseInsensitive` — que cite l'AC — ne replie que la casse
     * (`lower('SÈNE' COLLATE "und-x-icu")` rend `sène`, qui ne contient pas `sene`). Même voie que
     * {@see CleDeQuartier} et `ProspectMatcher`. Le téléphone se compare sur ses
     * seuls chiffres (« 77 123 45 67 » trouve « +221771234567 »).
     *
     * @param  Builder<OwnerProfile>  $query
     */
    public function search(Builder $query, string $term): void
    {
        $needle = self::fold($term);
        $digits = preg_replace('/\D+/', '', $term) ?? '';
        if ($needle === '') {
            return;
        }

        $candidates = OwnerProfile::query()
            ->whereIn('id', (clone $query)->reorder()->select('owner_profiles.id'))
            ->with('user:id,first_name,last_name,email,phone,username')
            ->get(['id', 'user_id', 'metadata', 'employer']);

        $ids = $candidates->filter(function (OwnerProfile $profile) use ($needle, $digits): bool {
            $user = $profile->user;
            $texts = [
                $user?->first_name, $user?->last_name, $user?->email, $user?->username,
                trim(($user?->first_name ?? '').' '.($user?->last_name ?? '')),
                self::metadataString($profile, 'first_name'), self::metadataString($profile, 'last_name'),
                trim((self::metadataString($profile, 'first_name') ?? '').' '.(self::metadataString($profile, 'last_name') ?? '')),
                self::metadataString($profile, 'email'), self::metadataString($profile, 'company_name'),
                $profile->employer,
            ];
            foreach ($texts as $text) {
                if (is_string($text) && $text !== '' && str_contains(self::fold($text), $needle)) {
                    return true;
                }
            }
            if (strlen($digits) >= 4) {
                foreach ([$user?->phone, self::metadataString($profile, 'phone')] as $phone) {
                    if (is_string($phone) && str_contains(preg_replace('/\D+/', '', $phone) ?? '', $digits)) {
                        return true;
                    }
                }
            }

            return false;
        })->pluck('id')->all();

        $query->whereIn('owner_profiles.id', $ids);
    }

    /** Minuscules, sans accent, espaces ramenées à une : la forme sous laquelle on compare. */
    public static function fold(string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', Str::ascii(mb_strtolower($text))));
    }

    /**
     * La fiche (`GET /api/owners/{id}`).
     *
     * @return array<string, mixed>
     */
    public function detail(OwnerProfile $profile, string $period): array
    {
        $profile->loadMissing('agency');
        $agency = $profile->agency;
        $landlord = $profile->user_id !== null ? User::withTrashed()->find($profile->user_id) : null;

        $statement = $agency !== null && $landlord !== null ? $this->statements->served($agency, $landlord, $period) : null;
        $totals = $statement['totals'] ?? null;

        $counts = OwnerProfile::query()->whereKey($profile->id)->select('owner_profiles.id');
        $this->addListColumns($counts);
        $row = $counts->first();

        $lastPayout = $landlord === null ? null : Payout::query()
            ->where('agency_id', $profile->agency_id)
            ->where('landlord_id', $landlord->id)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->where('status', PayoutStatus::Completed->value)
            ->whereNotNull('processed_at')
            ->orderByDesc('processed_at')
            ->orderByDesc('id')
            ->first(['id', 'processed_at', 'net_amount', 'payment_method']);

        $agencyRate = $agency?->commission_rate !== null ? (float) $agency->commission_rate : null;
        $leaseRates = $landlord === null ? [] : Lease::query()
            ->where('agency_id', $profile->agency_id)
            ->where('landlord_id', $landlord->id)
            ->whereIn('status', [LeaseStatus::Active->value, LeaseStatus::Terminating->value])
            ->whereNotNull('commission_rate')
            ->distinct()
            ->orderBy('commission_rate')
            ->pluck('commission_rate')
            ->map(fn ($rate) => (float) $rate)
            ->filter(fn (float $rate) => $rate !== $agencyRate)
            ->values()
            ->all();

        $firstName = $landlord?->first_name ?? self::metadataString($profile, 'first_name');
        $lastName = $landlord?->last_name ?? self::metadataString($profile, 'last_name');

        return [
            'id' => $profile->id,
            'user_id' => $profile->user_id,
            'agency_id' => $profile->agency_id,
            'status' => $profile->status?->value,
            'joined_at' => $profile->created_at,
            'owner_type' => self::metadataString($profile, 'owner_type') ?? 'individual',
            'company_name' => $profile->companyName(),
            'contact' => [
                'first_name' => $firstName,
                'last_name' => $lastName,
                'full_name' => $profile->display_name !== '' ? $profile->display_name : null,
                'email' => (is_string($landlord?->email) && trim($landlord->email) !== '' ? $landlord->email : null) ?? self::metadataString($profile, 'email'),
                'phone' => (is_string($landlord?->phone) && trim($landlord->phone) !== '' ? $landlord->phone : null) ?? self::metadataString($profile, 'phone'),
            ],
            'pending_invitation_id' => OwnerProfile::query()->whereKey($profile->id)
                ->select(['pending_invitation_id' => Invitation::idEnvoyeePour(new OwnerProfile)
                    ->whereColumn('invitations.agency_id', 'owner_profiles.agency_id')])
                ->value('pending_invitation_id'),
            'properties_count' => (int) ($row?->properties_count ?? 0),
            'occupied_properties_count' => (int) ($row?->occupied_properties_count ?? 0),
            'figures' => $totals === null ? null : [
                'period' => $period,
                'currency' => $statement['currency'] ?? null,
                'collected' => (float) ($totals['gross'] ?? 0),
                'commission' => (float) ($totals['commission'] ?? 0),
                'fees' => (float) ($totals['fees'] ?? 0),
                'net' => (float) ($totals['net'] ?? 0),
                'paid_out' => (float) ($totals['paid_out'] ?? 0),
                'remaining_to_pay' => (float) ($totals['remaining_to_pay'] ?? 0),
                'from_snapshot' => ($statement['snapshot'] ?? null) !== null,
            ],
            'last_payout' => $lastPayout === null ? null : [
                'id' => $lastPayout->id,
                'processed_at' => $lastPayout->processed_at,
                'net_amount' => (float) $lastPayout->net_amount,
                'payment_method' => $lastPayout->payment_method?->value,
            ],
            'next_payout' => $statement['next_payout'] ?? null,
            'works_approval_threshold' => $profile->works_approval_threshold !== null ? (float) $profile->works_approval_threshold : null,
            'agency_commission_rate' => $agencyRate,
            // Le taux d'un bail peut différer de celui de l'agence : les taux propres des baux en cours.
            'lease_commission_rates' => $leaseRates,
        ];
    }

    private static function metadataString(OwnerProfile $profile, string $key): ?string
    {
        $value = data_get($profile->metadata, $key);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
