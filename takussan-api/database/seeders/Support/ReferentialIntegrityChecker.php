<?php

namespace Database\Seeders\Support;

use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
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
        ];
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
