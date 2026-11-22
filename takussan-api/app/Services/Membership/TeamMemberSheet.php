<?php

namespace App\Services\Membership;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\CustomerCommercialAttributes;
use App\Services\Dashboard\PeriodeDuTableauDeBord;
use App\Services\Model\NotificationService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2926 (ADR-0124) — la fiche d'un membre de l'équipe (`GET /api/agencies/{agency}/team/{user}`) et le
 * rappel de sa double authentification.
 *
 * Chaque compte se lit sur la liste vers laquelle l'écran renvoie, avec la même règle :
 *   · `portfolio.properties` — {@see Property::scopeManagedBy()} dans l'agence (la règle de « Mes chiffres »
 *     et de `filter[agent]`), archivés exclus comme la liste des biens ;
 *   · `portfolio.active_customers` — les clients de l'agence dont il est le référent ACTIF
 *     ({@see CustomerCommercialAttributes::asReferent()}, la règle de `filter[referent]`) ;
 *   · `portfolio.visits_this_week` — ses visites de la semaine de Dakar (lundi → dimanche), annulées et
 *     absences exclues, sur les biens de l'agence ;
 *   · `commissions_due` — ses lignes du grand livre `due` dans l'agence.
 */
final class TeamMemberSheet
{
    public const REMINDER_COOLDOWN_HOURS = 24;

    /** Membre de l'équipe : un profil d'agent ou d'administrateur dans l'agence, de tout statut, non retiré. */
    public static function isMember(int $agencyId, int $userId): bool
    {
        return AgentProfile::query()->where('agency_id', $agencyId)->where('user_id', $userId)->exists()
            || AgencyAdminProfile::query()->where('agency_id', $agencyId)->where('user_id', $userId)->exists();
    }

    /** @return array<string, mixed> */
    public function for(Agency $agency, User $member): array
    {
        return [
            'user_id' => $member->id,
            'portfolio' => $this->portfolio($agency, $member),
            'commissions_due' => $this->commissionsDue($agency, $member),
            'last_login' => [
                'at' => BaseResource::instantOnWire($member->last_login_at),
                'device' => $member->last_login_device,
                'city' => $member->last_login_city,
            ],
            'two_factor_enabled' => (bool) $member->two_factor_enabled,
            'two_factor_enabled_at' => BaseResource::instantOnWire($member->two_factor_enabled_at),
        ];
    }

    /**
     * Le rappel d'activer la double authentification : 409 si elle l'est, 429 si un rappel est parti dans les
     * 24 h. Jugé sous le verrou de la ligne `users` du membre, sur les lignes `app_notifications` du code : deux
     * clics simultanés n'en envoient qu'un.
     */
    public function remindTwoFactor(Agency $agency, User $member): bool
    {
        return DB::transaction(function () use ($agency, $member): bool {
            /** @var User $locked */
            $locked = User::query()->whereKey($member->id)->lockForUpdate()->firstOrFail();

            abort_code_if((bool) $locked->two_factor_enabled, 409, 'team.two_factor_already_enabled');
            abort_code_if(
                AppNotification::query()
                    ->where('user_id', $locked->id)
                    ->where('code', NotificationCode::AccountTwoFactorReminder->value)
                    ->where('created_at', '>', now()->subHours(self::REMINDER_COOLDOWN_HOURS))
                    ->exists(),
                429,
                'team.two_factor_reminder_throttled',
            );

            $sent = app(NotificationService::class)->send(
                $locked,
                NotificationCode::AccountTwoFactorReminder,
                ['agency' => (string) $agency->name],
                NotificationTarget::of('profile_security'),
                agencyId: $agency->id,
            );

            return $sent !== null;
        });
    }

    /** @return array{properties: array<string, int>, properties_total: int, active_customers: int, visits_this_week: int} */
    private function portfolio(Agency $agency, User $member): array
    {
        $byStatus = Property::query()
            ->managedBy($member, $agency->id)
            ->where('status', '!=', PropertyStatus::Archived->value)
            ->toBase()
            ->selectRaw('status, COUNT(*) AS total')
            ->groupBy('status')
            ->orderBy('status')
            ->pluck('total', 'status')
            ->map(fn ($n) => (int) $n)
            ->all();

        $activeCustomers = Customer::query()
            ->where('agency_id', $agency->id)
            ->whereHas('relationships', fn (Builder $r) => CustomerCommercialAttributes::asReferent($r)
                ->where('user_customer_relationships.user_id', $member->id))
            ->count();

        $now = CarbonImmutable::now(PeriodeDuTableauDeBord::TIMEZONE);
        $visitsThisWeek = PropertyVisit::query()
            ->where('agent_id', $member->id)
            ->whereHas('property', fn (Builder $p) => $p->withTrashed()->where('agency_id', $agency->id))
            ->whereNotIn('status', [VisitStatus::Cancelled->value, VisitStatus::NoShow->value])
            ->whereBetween('scheduled_at', [$now->startOfWeek(), $now->endOfWeek()])
            ->count();

        return [
            'properties' => $byStatus,
            'properties_total' => array_sum($byStatus),
            'active_customers' => $activeCustomers,
            'visits_this_week' => $visitsThisWeek,
        ];
    }

    /** @return array{amount: float, leases: int, oldest_due_at: ?string} */
    private function commissionsDue(Agency $agency, User $member): array
    {
        $row = CommissionEntry::query()
            ->where('agency_id', $agency->id)
            ->where('beneficiary_id', $member->id)
            ->where('status', CommissionEntryStatus::Due->value)
            ->toBase()
            ->selectRaw('COALESCE(SUM(amount), 0) AS amount, COUNT(DISTINCT lease_id) AS leases, MIN(earned_at) AS oldest')
            ->first();

        // Une date calendaire (ADR-0018) : le jour de Dakar de la plus ancienne ligne due.
        $oldest = $row?->oldest === null ? null
            : CarbonImmutable::parse($row->oldest, (string) config('app.timezone'))
                ->setTimezone(CommissionEntry::DATE_TIMEZONE)->toDateString();

        return [
            'amount' => round((float) ($row->amount ?? 0), 2),
            'leases' => (int) ($row->leases ?? 0),
            'oldest_due_at' => $oldest,
        ];
    }
}
