<?php

namespace Database\Seeders\Support;

use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Support\Search\PropertyLabels;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Juge le jeu de données semé — et ne le corrige JAMAIS (TCK-2376).
 *
 * La version précédente « réparait » : un bien `rented` sans bail recevait un bail daté de deux
 * mois, au loyer égal au prix du bien, et ses paiements ; un client sans activité recevait une
 * réservation `completed` créée trois jours plus tôt. Mesuré le 2026-10-25 : 66 % des loyers
 * encaissés de la base semée venaient de ces baux, dont 40 sur des biens À VENDRE au loyer moyen
 * de 53,6 M XOF. *Un correctif silencieux déplace le défaut du seeder vers les chiffres* : chaque
 * invariant ci-dessous se tient désormais à la source, dans le seeder qui écrit la donnée, et ce
 * vérificateur fait échouer `db:seed` en nommant ce qui ne tient pas.
 *
 * Il juge le jeu RÉALISTE : `YearOfActivitySeeder` le joue avant les cas limites et la couverture
 * des filtres, qui violent certains de ces invariants exprès (un loyer de 301 M XOF, un bien loué
 * sans bail).
 */
class ReferentialIntegrityChecker
{
    /** Écart toléré entre le loyer d'un bail et le prix affiché du bien loué, dans les deux sens. */
    public const ECART_LOYER_PRIX = 3;

    /**
     * Lève si un invariant ne tient pas. N'écrit rien.
     *
     * @throws RuntimeException
     */
    public function assertIntegrity(): void
    {
        $violations = array_filter($this->violations());

        if ($violations === []) {
            return;
        }

        $lignes = array_map(
            fn (string $invariant, int $nombre) => "  · {$invariant} : {$nombre}",
            array_keys($violations),
            $violations,
        );

        throw new RuntimeException(
            "Le jeu semé viole ses invariants — corrige le seeder qui écrit la donnée, pas ce vérificateur :\n"
            .implode("\n", $lignes),
        );
    }

    /**
     * Nombre de lignes fautives par invariant (0 = tenu).
     *
     * @return array<string, int>
     */
    public function violations(): array
    {
        return [
            'bail_de_location_sur_un_bien_a_vendre' => $this->bauxDeLocation()
                ->where('p.contract_type', ContractType::Sale->value)
                ->count(),
            'bail_residentiel_sur_un_bien_qui_n_est_pas_une_habitation' => $this->bauxDeLocation()
                ->where('l.type', LeaseType::ResidentialRent->value)
                ->whereNotIn('p.type', self::typesDeLaFamille(PropertyLabels::FAMILLE_HABITATION))
                ->count(),
            'loyer_hors_de_proportion_avec_le_prix_du_bien' => $this->bauxDeLocation()
                ->where('p.contract_type', ContractType::Rent->value)
                ->where('p.price', '>', 0)
                ->where(fn (Builder $q) => $q
                    ->whereRaw('l.monthly_rent > p.price * ?', [self::ECART_LOYER_PRIX])
                    ->orWhereRaw('l.monthly_rent < p.price / ?', [self::ECART_LOYER_PRIX]))
                ->count(),
            'facture_payee_sur_une_echeance_non_payee' => DB::table('invoices as i')
                ->join('lease_payments as lp', function ($join) {
                    $join->on('lp.lease_id', '=', 'i.invoiceable_id')
                        ->where('lp.payment_type', LeasePaymentType::Rent->value)
                        ->whereRaw("date_trunc('month', lp.period_start) = date_trunc('month', i.issue_date)");
                })
                ->where('i.invoiceable_type', (new Lease)->getMorphClass())
                ->where('i.status', InvoiceStatus::Paid->value)
                ->where('lp.status', '!=', PaymentStatus::Paid->value)
                ->count(),
            'reservation_terminee_avant_son_debut' => DB::table('bookings')
                ->where('status', BookingStatus::Completed->value)
                ->where('start_date', '>', now()->toDateString())
                ->count(),
            'bien_loue_sans_bail_actif' => DB::table('properties as p')
                ->where('p.status', PropertyStatus::Rented->value)
                ->whereNotExists(fn (Builder $q) => $q->from('leases as l')
                    ->whereColumn('l.property_id', 'p.id')
                    ->where('l.status', LeaseStatus::Active->value))
                ->count(),
            'bail_actif_sur_un_bien_qui_n_est_pas_loue' => DB::table('leases as l')
                ->join('properties as p', 'p.id', '=', 'l.property_id')
                ->where('l.status', LeaseStatus::Active->value)
                ->whereIn('l.type', self::typesDeLocation())
                ->where('p.status', '!=', PropertyStatus::Rented->value)
                ->count(),
            // TCK-2377 — le parcours se lit dans l'ordre du temps, et l'occupation d'un bien aussi.
            'bien_occupe_par_deux_baux_qui_se_chevauchent' => DB::table('leases as a')
                ->join('leases as b', fn ($join) => $join->on('b.property_id', '=', 'a.property_id')->whereColumn('b.id', '>', 'a.id'))
                ->where('a.status', '!=', LeaseStatus::Draft->value)
                ->where('b.status', '!=', LeaseStatus::Draft->value)
                ->whereRaw('a.start_date <= COALESCE(b.terminated_at::date, b.end_date)')
                ->whereRaw('b.start_date <= COALESCE(a.terminated_at::date, a.end_date)')
                ->distinct()
                ->count('a.property_id'),
            'bail_anterieur_a_son_bien' => DB::table('leases as l')
                ->join('properties as p', 'p.id', '=', 'l.property_id')
                ->whereRaw('l.start_date < p.created_at::date')
                ->count(),
            'visite_anterieure_a_son_bien' => DB::table('property_visits as v')
                ->join('properties as p', 'p.id', '=', 'v.property_id')
                ->whereColumn('v.scheduled_at', '<', 'p.created_at')
                ->count(),
            'reservation_anterieure_a_son_bien' => DB::table('bookings as b')
                ->join('properties as p', 'p.id', '=', 'b.property_id')
                ->whereColumn('b.created_at', '<', 'p.created_at')
                ->count(),
            'bail_expire_dont_la_fin_est_a_venir' => DB::table('leases')
                ->where('status', LeaseStatus::Expired->value)
                ->where('end_date', '>=', now()->toDateString())
                ->count(),
            'bail_actif_dont_la_fin_est_passee' => DB::table('leases')
                ->where('status', LeaseStatus::Active->value)
                ->where('end_date', '<', now()->toDateString())
                ->count(),
            'bail_renouvele_sans_successeur' => DB::table('leases as a')
                ->where('a.status', LeaseStatus::Renewed->value)
                ->whereNotExists(fn (Builder $q) => $q->from('leases as b')->whereColumn('b.renewed_from_lease_id', 'a.id'))
                ->count(),
            'locataire_qui_n_est_pas_converti' => DB::table('leases as l')
                ->join('customers as c', 'c.id', '=', 'l.tenant_id')
                ->where('l.status', '!=', LeaseStatus::Draft->value)
                ->where('c.pipeline_stage', '!=', CustomerPipelineStage::Converted->value)
                ->distinct()
                ->count('c.id'),
            'lead_qui_a_un_bail' => DB::table('leases as l')
                ->join('customers as c', 'c.id', '=', 'l.tenant_id')
                ->where('c.pipeline_stage', CustomerPipelineStage::Lead->value)
                ->distinct()
                ->count('c.id'),
            'avis_ecrit_par_le_personnel_ou_le_bailleur' => DB::table('reviews as r')
                ->join('properties as p', 'p.id', '=', 'r.reviewable_id')
                ->where('r.reviewable_type', (new Property)->getMorphClass())
                ->where(fn (Builder $q) => $q
                    ->whereColumn('r.author_id', 'p.user_id')
                    ->orWhereExists(fn (Builder $e) => $e->from('agent_profiles as ap')
                        ->whereColumn('ap.user_id', 'r.author_id')->whereColumn('ap.agency_id', 'p.agency_id'))
                    ->orWhereExists(fn (Builder $e) => $e->from('agency_admin_profiles as aa')
                        ->whereColumn('aa.user_id', 'r.author_id')->whereColumn('aa.agency_id', 'p.agency_id')))
                ->count(),
            'impaye_de_plus_de_90_jours_sur_un_bail_actif' => DB::table('lease_payments as lp')
                ->join('leases as l', 'l.id', '=', 'lp.lease_id')
                ->where('l.status', LeaseStatus::Active->value)
                ->where('lp.status', PaymentStatus::Late->value)
                ->where('lp.due_date', '<', now()->subDays(90)->toDateString())
                ->count(),
            'maintenance_sur_un_bien_non_bati' => DB::table('maintenance_requests as m')
                ->join('properties as p', 'p.id', '=', 'm.property_id')
                ->whereIn('p.type', self::typesDeLaFamille(PropertyLabels::FAMILLE_FONCIER))
                ->count(),
            'maintenance_demandee_ni_par_le_locataire_ni_par_le_bailleur' => DB::table('maintenance_requests as m')
                ->join('properties as p', 'p.id', '=', 'm.property_id')
                ->whereColumn('m.requester_id', '!=', 'p.user_id')
                ->whereNotExists(fn (Builder $q) => $q->from('leases as l')
                    ->join('customers as c', 'c.id', '=', 'l.tenant_id')
                    ->whereColumn('l.property_id', 'm.property_id')
                    ->whereColumn('c.user_id', 'm.requester_id'))
                ->count(),
            // TCK-2378 — un agent n'agit qu'entre son arrivée et son départ ; une agence individuelle
            // est une personne seule.
            'visite_menee_par_un_agent_absent' => $this->parUnAgentAbsent('property_visits', 'agent_id', 'scheduled_at'),
            'bail_suivi_par_un_agent_absent' => $this->parUnAgentAbsent('leases', 'agent_id', 'created_at'),
            'reservation_saisie_par_un_agent_absent' => $this->parUnAgentAbsent('bookings', 'created_by_id', 'created_at'),
            'agence_individuelle_avec_un_agent' => DB::table('agent_profiles as ap')
                ->join('agencies as a', 'a.id', '=', 'ap.agency_id')
                ->where('a.kind', AgencyKind::Individual->value)
                ->count(),
        ];
    }

    /** Les lignes de `$table` dont l'agent n'était pas encore arrivé, ou déjà parti, à leur date. */
    private function parUnAgentAbsent(string $table, string $colonneAgent, string $colonneDate): int
    {
        return DB::table("{$table} as t")
            ->join('users as u', 'u.id', '=', "t.{$colonneAgent}")
            ->where(fn (Builder $q) => $q
                ->whereColumn('u.created_at', '>', "t.{$colonneDate}")
                ->orWhereExists(fn (Builder $e) => $e->from('agent_profiles as ap')
                    ->whereColumn('ap.user_id', 'u.id')
                    ->where('ap.status', AgentProfileStatus::Suspended->value)
                    ->whereColumn('ap.updated_at', '<=', "t.{$colonneDate}")))
            ->count();
    }

    private function bauxDeLocation(): Builder
    {
        return DB::table('leases as l')
            ->join('properties as p', 'p.id', '=', 'l.property_id')
            ->whereIn('l.type', self::typesDeLocation());
    }

    /** @return list<string> */
    private static function typesDeLocation(): array
    {
        return [LeaseType::ResidentialRent->value, LeaseType::CommercialRent->value, LeaseType::SeasonalRent->value];
    }

    /** @return list<string> */
    public static function typesDeLaFamille(string $famille): array
    {
        return array_keys(array_filter(PropertyLabels::FAMILLES, fn (string $f) => $f === $famille));
    }
}
