<?php

namespace App\Services\Crm;

use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\UserStatus;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\AllowedFilter;

/**
 * TCK-2583 — deux filtres de la boîte « Demandes », déclarés par
 * `PropertyContactLead::getAllowedQueryFilters()` :
 *
 *   · `filter[responded]=0|1` — la demande a-t-elle reçu un premier geste de contact
 *     (`first_responded_at`) ? Répondre ne vaut pas traiter : `filter[handled]` reste distinct.
 *   · `filter[unassigned]=1` — personne ne la porte : sans destinataire, ou adressée à quelqu'un qui
 *     n'est plus du personnel ACTIF et joignable de l'agence de la demande (profil d'agent ou
 *     d'admin actif, ou délégation d'agent / d'admin en vigueur — la même définition que
 *     `filter[assignable]` des membres de l'agence, `User::buildAgencyMembersQuery()`). Une
 *     demande sans agence n'a pas de personnel : seul son destinataire absent la rend orpheline.
 */
final class ContactLeadInboxFilters
{
    /** @return list<AllowedFilter> */
    public static function all(): array
    {
        return [self::responded(), self::unassigned()];
    }

    public static function responded(): AllowedFilter
    {
        return AllowedFilter::callback('responded', function (Builder $q, mixed $value): void {
            filter_var($value, FILTER_VALIDATE_BOOLEAN)
                ? $q->whereNotNull($q->qualifyColumn('first_responded_at'))
                : $q->whereNull($q->qualifyColumn('first_responded_at'));
        });
    }

    public static function unassigned(): AllowedFilter
    {
        return AllowedFilter::callback('unassigned', function (Builder $q, mixed $value): void {
            if (! filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                return;
            }

            $agency = $q->qualifyColumn('agency_id');
            $memeAgence = fn (string $table) => fn (Builder $p) => $p->whereColumn("{$table}.agency_id", $agency)->active();

            $personnelActif = fn (Builder $u) => $u
                ->whereNotIn('users.status', [UserStatus::Blocked->value, UserStatus::Deleted->value])
                ->where(fn (Builder $w) => $w
                    ->whereHas('agentProfiles', $memeAgence('agent_profiles'))
                    ->orWhereHas('agencyAdminProfiles', $memeAgence('agency_admin_profiles'))
                    ->orWhereHas('roleDelegations', fn (Builder $d) => $memeAgence('role_delegations')($d)
                        ->whereIn('role', [AgencyRoleBaseType::Agent->value, AgencyRoleBaseType::AgencyAdmin->value])));

            $q->where(fn (Builder $w) => $w
                ->whereNull($q->qualifyColumn('recipient_user_id'))
                ->orWhere(fn (Builder $x) => $x
                    ->whereNotNull($agency)
                    ->whereDoesntHave('recipient', $personnelActif)));
        });
    }
}
