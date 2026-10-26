<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\BoostKind;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\PropertyBoost;
use App\Services\Credits\CreditLedger;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-2379 — le seed remplit les tables des fonctionnalités livrées, par leurs services.
 *
 * Mesuré le 2026-10-25 sur un seed par défaut : 25 tables lues par du code et vides, dont
 * `commission_entries`, `credit_lots`, `lease_signatures` et `kyc_dossiers` ; 162 vedettes sans
 * tranche ni statistique, nées de la conversion d'un drapeau `featured` tiré au hasard.
 */
class SeedingFeatureTablesTest extends TestCase
{
    use RefreshDatabase;

    /** Les invariants que ce ticket ajoute au vérificateur. */
    private const INVARIANTS = [
        'lot_de_credits_hors_du_grand_livre',
        'solde_de_credits_different_de_ses_mouvements',
        'commission_qui_ne_se_recalcule_pas',
        'commission_sur_un_renouvellement',
        'bail_fige_sans_ses_deux_signatures',
        'signature_sur_un_brouillon',
        'vedette_dont_les_tranches_ne_font_pas_le_total',
        'vedette_sans_une_statistique_par_jour',
        'statistique_hors_de_la_periode_de_sa_vedette',
        'indisponibilite_sur_une_reservation_confirmee',
        'demande_convertie_apres_sa_fiche',
        'reversement_vers_une_destination_non_verifiee',
    ];

    /**
     * Le chemin de chaque table du lot 1 jusqu'à son agence : AC1 se compte par agence.
     *
     * @var array<string, string>
     */
    private const PAR_AGENCE = [
        'commission_entries' => 'SELECT agency_id FROM commission_entries',
        'agency_subscriptions' => 'SELECT agency_id FROM agency_subscriptions',
        'credit_lots' => 'SELECT agency_id FROM credit_lots',
        'credit_movements' => 'SELECT agency_id FROM credit_movements',
        'lease_signatures' => 'SELECT l.agency_id FROM lease_signatures s JOIN leases l ON l.id = s.lease_id',
        'lease_payment_links' => 'SELECT l.agency_id FROM lease_payment_links k JOIN lease_payments p ON p.id = k.lease_payment_id JOIN leases l ON l.id = p.lease_id',
        'payout_methods' => 'SELECT v.agency_id FROM payout_methods m JOIN payout_method_verifications v ON v.payout_method_id = m.id',
        'kyc_dossiers' => "SELECT subject_id FROM kyc_dossiers WHERE subject_type = 'App\\Models\\Agency'",
        'invitations' => 'SELECT agency_id FROM invitations',
        'property_contact_leads' => 'SELECT agency_id FROM property_contact_leads',
        'property_contacts' => 'SELECT p.agency_id FROM property_contacts c JOIN properties p ON p.id = c.property_id',
        'property_unavailabilities' => 'SELECT p.agency_id FROM property_unavailabilities u JOIN properties p ON p.id = u.property_id',
        'property_reports' => 'SELECT p.agency_id FROM property_reports r JOIN properties p ON p.id = r.property_id',
        'property_boost_tranches' => 'SELECT b.agency_id FROM property_boost_tranches t JOIN property_boosts b ON b.id = t.property_boost_id',
        'property_boost_daily_stats' => 'SELECT b.agency_id FROM property_boost_daily_stats d JOIN property_boosts b ON b.id = d.property_boost_id',
    ];

    public function test_chaque_fonctionnalite_livree_s_ouvre_sur_des_donnees_coherentes(): void
    {
        // AC6 — aucun appel sortant : prestataires de paiement, SMS, et le rendu PDF déployé (Cloudflare).
        Http::preventStrayRequests();
        // Le pilote d'un environnement déployé, avec ses identifiants : le seed doit rendre en local.
        config(['laravel-pdf.driver' => 'cloudflare', 'laravel-pdf.cloudflare.api_token' => 'jeton', 'laravel-pdf.cloudflare.account_id' => 'compte']);
        $this->semer();

        $violations = (new ReferentialIntegrityChecker)->violations();
        foreach (self::INVARIANTS as $invariant) {
            $this->assertSame(0, $violations[$invariant], "Invariant {$invariant} violé.");
        }

        // AC1 — chaque table du lot 1, au moins une ligne par agence `standard`.
        $standards = Agency::query()->where('kind', AgencyKind::Standard)->pluck('id');
        $this->assertNotEmpty($standards);
        $manques = [];
        foreach (self::PAR_AGENCE as $table => $agences) {
            $couvertes = collect(DB::select("SELECT DISTINCT x.agency_id AS id FROM ({$agences}) AS x(agency_id)"))->pluck('id')->map(fn ($id) => (int) $id);
            foreach ($standards->diff($couvertes) as $agencyId) {
                $manques[] = "{$table} : aucune ligne pour l'agence {$agencyId}";
            }
        }
        $this->assertSame([], $manques);

        // AC2 — le solde que l'application rend est Σ des mouvements.
        foreach (Agency::query()->pluck('id') as $agencyId) {
            $this->assertSame(
                (int) DB::table('credit_movements')->where('agency_id', $agencyId)->sum('amount'),
                app(CreditLedger::class)->balance((int) $agencyId),
                "Solde de crédits de l'agence {$agencyId}.",
            );
        }
        $this->assertTrue(DB::table('credit_movements')->where('type', 'spend')->exists(), 'Aucune dépense de crédits.');

        // AC3 — chaque commission se recalcule depuis les frais d'agence du bail et sa part.
        $this->assertGreaterThan(0, CommissionEntry::query()->count());
        foreach (CommissionEntry::query()->with('lease')->get() as $ligne) {
            $this->assertNull($ligne->lease->renewed_from_lease_id);
            $this->assertNotNull($ligne->lease->signed_at);
            $this->assertEquals((float) $ligne->lease->commission_amount, (float) $ligne->base_amount);
            // La forme de `CommissionLedgerService` : l'arrondi à 10⁻⁶ avant la troncature absorbe le
            // flottant — sans lui, un montant entier se recalculait à une unité de moins.
            $this->assertEquals(floor(round((float) $ligne->base_amount * (float) $ligne->share_percent / 100, 6)), (float) $ligne->amount);
        }
        $this->assertTrue(CommissionEntry::query()->where('status', 'paid')->exists(), 'Aucune commission versée.');

        // AC4 — chaque bail signé a son contrat figé et lisible ; un premier bail, ses deux signatures.
        $signes = Lease::query()->whereNotIn('status', [LeaseStatus::Draft, LeaseStatus::PendingSignature])->get();
        $this->assertNotEmpty($signes);
        foreach ($signes as $bail) {
            $this->assertNotNull($bail->contract_sha256, "Bail {$bail->id} sans contrat figé.");
            $roles = $bail->signatures()->where('document_sha256', $bail->contract_sha256)->distinct()->pluck('role')->sort()->values()->all();
            $this->assertSame($bail->renewed_from_lease_id === null ? ['landlord', 'tenant'] : [], $roles, "Signatures du bail {$bail->id}.");
        }
        $this->assertNotNull($signes->first()->frozenContractBytes(), 'Le contrat figé ne se relit pas.');
        $this->assertSame(0, Lease::query()->where('status', LeaseStatus::Draft)->whereHas('signatures')->count());

        // AC5 — chaque Vedette a ses tranches et une statistique par jour écoulé (invariants ci-dessus),
        // et il y en a.
        $this->assertTrue(PropertyBoost::query()->where('kind', BoostKind::Featured)->exists(), 'Aucune Vedette.');
        $this->assertTrue(DB::table('property_boost_daily_stats')->exists());
    }

    private function semer(): void
    {
        app()->instance(SeedingConfig::class, new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 60,
            customersPerAgency: 60,
            bookingsPerAgency: 15,
            leasesPerAgency: 40,
            maintenanceRequestsPerAgency: 12,
            conversationsPerAgency: 2,
            documentsPerAgency: 2,
            includeDemoUsers: false,
        ));
        config(['scout.driver' => null]);

        $this->seed(YearOfActivitySeeder::class);
    }
}
