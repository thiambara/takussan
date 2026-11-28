<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Booking;
use App\Models\CommissionEntry;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use Database\Seeders\Activity\InventorySeeder;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\System\PlatformMetricsSeeder;
use Database\Seeders\YearOfActivitySeeder;
use Faker\Provider\Lorem;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\LazyCollection;
use Laravel\Scout\Builder;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\Engine;
use PDO;
use ReflectionProperty;
use Symfony\Component\Console\Output\BufferedOutput;
use Tests\Support\JeuSemePartage;
use Tests\Support\SearchableModels;
use Tests\Support\TestDatabase;
use Tests\TestCase;

/**
 * Le jeu que sème `YearOfActivitySeeder`, semé UNE fois et lu par chaque test (TCK-3013, ADR-0140).
 *
 * Ces tests ne font que LIRE le jeu semé. Ils vivaient dans six classes (`SeedingJourneyTest`,
 * `SeedingGrowthTest`, `SeededAgentDirectoryTest`, `SeedingFeatureTablesTest`, `SeedingInvariantsTest`,
 * `SeedingTextAndDeterminismTest`, `SeedingReindexTest`) qui semaient chacune le leur — sept semis
 * complets pour un seul jeu. Ils lisent désormais le même, semé une fois par {@see JeuSemePartage}
 * sous la configuration qui les sert tous : le plus grand volume de chaque table, les conversations
 * de `SeedingGrowthTest`, les contrats figés de `SeedingFeatureTablesTest`.
 *
 * Les tests qui FONT VARIER le semis gardent le leur : l'horloge au 31 octobre (`SeedingJourneyTest`),
 * les 800 réservations (`SeedingInvariantsTest`), la graine (`SeedingTextAndDeterminismTest`), les
 * échecs de médias (`SeedingMediaFailuresTest`).
 *
 * Le semis se fait sous les gardes de `SeedingFeatureTablesTest` — aucune requête sortante, le pilote
 * PDF d'un environnement déployé avec ses identifiants — et réindexe dans un moteur espion
 * (TCK-701) : quel que soit le test qui le déclenche, ces gardes tiennent.
 */
class JeuSemeTest extends TestCase
{
    use JeuSemePartage;

    /** TCK-2377 — les invariants du parcours d'un client. */
    private const INVARIANTS_DU_PARCOURS = [
        'bien_occupe_par_deux_baux_qui_se_chevauchent',
        'bail_anterieur_a_son_bien',
        'visite_anterieure_a_son_bien',
        'reservation_anterieure_a_son_bien',
        'bail_expire_dont_la_fin_est_a_venir',
        'bail_actif_dont_la_fin_est_passee',
        'bail_renouvele_sans_successeur',
        'locataire_qui_n_est_pas_converti',
        'lead_qui_a_un_bail',
        'avis_ecrit_par_le_personnel_ou_le_bailleur',
        'impaye_de_plus_de_90_jours_sur_un_bail_actif',
        'maintenance_sur_un_bien_non_bati',
        'maintenance_demandee_ni_par_le_locataire_ni_par_le_bailleur',
    ];

    /** TCK-2379, TCK-2381 — les invariants des tables des fonctionnalités livrées. */
    private const INVARIANTS_DES_FONCTIONNALITES = [
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
        'ligne_rapprochee_sans_paiement_du_meme_montant',
        'reprise_superieure_a_ce_que_le_reversement_a_pris',
        'metrique_du_jour_qui_ne_se_recalcule_pas',
    ];

    /**
     * TCK-2379 — le chemin de chaque table du lot 1 jusqu'à son agence : AC1 se compte par agence.
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
        // TCK-2381 — le lot 2.
        'bank_statements' => 'SELECT agency_id FROM bank_statements',
        'bank_statement_lines' => 'SELECT s.agency_id FROM bank_statement_lines l JOIN bank_statements s ON s.id = l.bank_statement_id',
        'reconciliation_ignored_payments' => 'SELECT agency_id FROM reconciliation_ignored_payments',
        'payout_clawbacks' => 'SELECT agency_id FROM payout_clawbacks',
        'owner_statement_snapshots' => 'SELECT agency_id FROM owner_statement_snapshots',
        'threshold_alerts' => 'SELECT agency_id FROM threshold_alerts',
        'tenant_onboarding_checklists' => 'SELECT l.agency_id FROM tenant_onboarding_checklists c JOIN leases l ON l.id = c.lease_id',
        'notification_delivery_attempts' => 'SELECT agency_id FROM notification_delivery_attempts',
    ];

    /** TCK-2381 — les tables de la plateforme, sans agence : au moins une ligne. */
    private const PLATEFORME = ['platform_metrics_daily', 'announcements', 'data_exports'];

    /** TCK-2380 — colonnes de texte semé que l'interface affiche. */
    private const TEXTES = [
        'messages' => 'content',
        'tasks' => 'title',
        'maintenance_requests' => 'title',
        'reviews' => 'content',
        'customer_notes' => 'body',
        'conversations' => 'subject',
        'property_contact_leads' => 'message',
        'property_reports' => 'details',
        'property_unavailabilities' => 'reason',
    ];

    /**
     * @return array{contexte: SeedingContext, reindexes: list<class-string>, agences: int}
     */
    protected static function semerLeJeu(Application $app): array
    {
        $app->instance(SeedingConfig::class, new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 60,
            customersPerAgency: 60,
            bookingsPerAgency: 15,
            leasesPerAgency: 40,
            maintenanceRequestsPerAgency: 12,
            conversationsPerAgency: 20,
            documentsPerAgency: 2,
            includeDemoUsers: false,
        ));

        // TCK-2379, AC6 — aucun appel sortant : prestataires de paiement, SMS, et le rendu PDF déployé
        // (Cloudflare). Le pilote d'un environnement déployé, avec ses identifiants : le seed doit
        // rendre en local.
        Http::preventStrayRequests();
        config(['laravel-pdf.driver' => 'cloudflare', 'laravel-pdf.cloudflare.api_token' => 'jeton', 'laravel-pdf.cloudflare.account_id' => 'compte']);

        // TCK-701 — le seeder réindexe le moteur que la configuration déclare : un espion, dont
        // `flush()` est appelé une fois par modèle réindexé (`removeAllFromSearch()`).
        $espion = self::moteurEspion();
        $app[EngineManager::class]->extend('espion', fn () => $espion);
        config(['scout.driver' => 'espion']);

        $app[Kernel::class]->call('db:seed', ['--class' => YearOfActivitySeeder::class, '--force' => true], new BufferedOutput);

        return [
            'contexte' => $app[SeedingContext::class],
            'reindexes' => $espion->vides,
            'agences' => Agency::query()->count(),
        ];
    }

    /** TCK-2376 — le jeu semé par le pipeline tient TOUS les invariants du vérificateur. */
    public function test_un_jeu_seme_par_le_pipeline_tient_tous_ses_invariants(): void
    {
        // NON-VACUITÉ : chaque invariant porte sur une population présente. Sans biens à vendre, sans
        // factures payées, sans réservation terminée, un zéro ne prouverait rien.
        $this->assertGreaterThan(0, Property::query()->where('contract_type', ContractType::Sale)->count());
        $this->assertGreaterThan(0, Property::query()->where('status', PropertyStatus::Rented)->count());
        $this->assertGreaterThan(0, Lease::query()->where('status', LeaseStatus::Active)->count());
        $this->assertGreaterThan(0, Invoice::query()->where('status', InvoiceStatus::Paid)->count());
        $this->assertGreaterThan(0, Invoice::query()->where('status', InvoiceStatus::Overdue)->count());
        $this->assertGreaterThan(0, Booking::query()->where('status', BookingStatus::Completed)->count());

        $this->assertSame(
            array_fill_keys(array_keys((new ReferentialIntegrityChecker)->violations()), 0),
            (new ReferentialIntegrityChecker)->violations(),
        );
    }

    /** TCK-2376 — le jeu par défaut ne contient aucune fixture de cas limite ni de couverture. */
    public function test_le_jeu_par_defaut_ne_contient_aucune_fixture_de_cas_limite_ni_de_couverture(): void
    {
        $this->assertSame(0, Property::query()->where('reference_number', 'like', 'PR-EC-%')->orWhere('reference_number', 'like', 'PR-FC-%')->count());
        $this->assertSame(0, Lease::query()->where('reference_number', 'like', 'LS-EC-%')->orWhere('reference_number', 'like', 'LS-FC-%')->count());
        $this->assertSame(0, Booking::query()->where('reference_number', 'like', 'BK-EC-%')->count());
    }

    /**
     * TCK-2377 — le seed suit le parcours d'un client, dans l'ordre du temps, au lieu de tirer chaque
     * table au hasard. Mesuré le 2026-10-25 sur un seed par défaut : 76 biens à deux baux actifs, 273
     * baux antérieurs à leur bien, 92 locataires `lead`, 286 avis écrits par le personnel de l'agence,
     * 273 impayés jamais régularisés et aucun garant rattaché à un bail.
     */
    public function test_le_jeu_seme_raconte_des_parcours_coherents(): void
    {
        $violations = (new ReferentialIntegrityChecker)->violations();
        $this->assertSame(
            array_fill_keys(self::INVARIANTS_DU_PARCOURS, 0),
            array_intersect_key($violations, array_flip(self::INVARIANTS_DU_PARCOURS)),
        );

        // NON-VACUITÉ : chaque issue d'un bail existe, sans quoi les zéros ci-dessus ne disent rien.
        foreach ([LeaseStatus::Active, LeaseStatus::Expired, LeaseStatus::Renewed, LeaseStatus::Terminated, LeaseStatus::Draft] as $statut) {
            $this->assertGreaterThan(0, Lease::query()->where('status', $statut)->count(), "Aucun bail {$statut->value}.");
        }
        $this->assertGreaterThan(0, DB::table('reviews')->count(), 'Aucun avis : l\'invariant des auteurs n\'est pas exercé.');
        $this->assertGreaterThan(0, DB::table('maintenance_requests')->whereNotNull('lease_id')->count(), 'Aucune intervention signalée pendant un bail.');

        // Un renouvellement reprend le même locataire et le même bien, et commence le lendemain.
        $renouvellement = Lease::query()->whereNotNull('renewed_from_lease_id')->with('renewedFrom')->firstOrFail();
        $this->assertSame($renouvellement->renewedFrom->tenant_id, $renouvellement->tenant_id);
        $this->assertSame($renouvellement->renewedFrom->property_id, $renouvellement->property_id);
        $this->assertSame($renouvellement->renewedFrom->end_date->addDay()->toDateString(), $renouvellement->start_date->toDateString());

        // AC4 : le stade CRM se lit dans l'activité.
        $this->assertSame(0, DB::table('leases')->join('customers', 'customers.id', '=', 'leases.tenant_id')
            ->where('leases.status', LeaseStatus::Active->value)
            ->where('customers.pipeline_stage', '!=', CustomerPipelineStage::Converted->value)->count());
        $this->assertGreaterThan(0, DB::table('customers')->where('pipeline_stage', CustomerPipelineStage::Lead->value)->count());

        // AC6 : un impayé a une suite — au moins un loyer réglé en retard, pénalité comprise.
        $this->assertGreaterThan(0, LeasePayment::query()
            ->where('payment_type', LeasePaymentType::Rent)
            ->where('status', PaymentStatus::Paid)
            ->where('late_fee_amount', '>', 0)
            ->whereColumn('paid_at', '>', 'due_date')
            ->count());

        // AC7 : au moins un bail signé sur cinq a un garant.
        $signes = Lease::query()->where('status', '!=', LeaseStatus::Draft)->count();
        $avecGarant = DB::table('lease_guarantor')->distinct()->count('lease_id');
        $this->assertGreaterThanOrEqual(0.2, $avecGarant / $signes, "{$avecGarant} baux signés sur {$signes} ont un garant.");
    }

    /** TCK-2377 — les états des lieux semés décrivent les pièces du bien. */
    public function test_les_etats_des_lieux_semes_suivent_le_type_du_bien(): void
    {
        $inventaires = Inventory::query()->with('property')->get();
        $this->assertNotEmpty($inventaires);
        foreach ($inventaires as $inventaire) {
            $this->assertSame(
                InventorySeeder::piecesDuBien($inventaire->property),
                array_column($inventaire->rooms, 'name'),
                "L'état des lieux {$inventaire->id} ne décrit pas les pièces du bien {$inventaire->property->type->value}.",
            );
        }
        // Les pièces varient d'un bien à l'autre : le défaut était quatre pièces partout.
        $this->assertGreaterThan(1, $inventaires->map(fn (Inventory $i) => count($i->rooms))->unique()->count());
    }

    /**
     * TCK-2378 — le seed dessine une vie d'agence : des agences d'âges et de tailles différents, une
     * activité qui monte, des arrivées et un départ, des fils et des notifications qui vieillissent.
     *
     * Mesuré le 2026-10-25 : quatre agences nées le même jour avec 214 biens chacune, toutes les équipes
     * arrivées le premier mois, 87 % des messages des fils de plus de six mois datés du dernier mois,
     * des notifications de six mois non lues à 47 %, et aucun auteur au journal d'activité.
     */
    public function test_le_jeu_seme_raconte_la_vie_des_agences(): void
    {
        $violations = (new ReferentialIntegrityChecker)->violations();
        foreach (['visite_menee_par_un_agent_absent', 'bail_suivi_par_un_agent_absent', 'reservation_saisie_par_un_agent_absent', 'agence_individuelle_avec_un_agent'] as $invariant) {
            $this->assertSame(0, $violations[$invariant], $invariant);
        }

        // AC1 — ni deux dates de fondation, ni deux tailles égales ; l'agence individuelle est seule.
        $agences = Agency::query()->withCount('properties')->get();
        $this->assertGreaterThanOrEqual(4, $agences->count());
        $this->assertCount($agences->count(), $agences->pluck('founded_at')->map(fn ($d) => (string) $d)->unique());
        $this->assertCount($agences->count(), $agences->pluck('properties_count')->unique(), 'Deux agences ont le même nombre de biens.');
        $individuelle = $agences->firstWhere('kind', AgencyKind::Individual);
        $this->assertNotNull($individuelle);
        $this->assertSame(0, AgentProfile::query()->where('agency_id', $individuelle->id)->count());
        $this->assertGreaterThan(0, DB::table('leases')->where('agency_id', $individuelle->id)->count(), 'L\'agence individuelle n\'a aucune activité.');

        // AC2 — l'activité monte : le dernier tiers de la fenêtre a plus de biens que le premier.
        $tiers = Timeline::seedStart()->diffInSeconds(Timeline::seedEnd()) / 3;
        $premier = DB::table('properties')->whereBetween('created_at', [Timeline::seedStart(), Timeline::seedStart()->addSeconds((int) $tiers)])->count();
        $dernier = DB::table('properties')->whereBetween('created_at', [Timeline::seedEnd()->subSeconds((int) $tiers), Timeline::seedEnd()])->count();
        // Le double au moins : un tirage uniforme passe « dernier > premier » une fois sur deux, par le
        // seul hasard (vérifié par ablation) ; la croissance linéaire en donne environ cinq fois plus.
        $this->assertGreaterThanOrEqual(2 * $premier, $dernier, "Premier tiers {$premier}, dernier {$dernier}.");

        // AC3 — des arrivées chacun des six derniers mois, et un départ dont l'historique reste.
        for ($m = 0; $m < 6; $m++) {
            $this->assertGreaterThan(0, DB::table('users')
                ->whereBetween('created_at', [now()->subDays(30 * ($m + 1)), now()->subDays(30 * $m)])->count(), "Aucune arrivée il y a {$m} mois.");
        }
        // Les comptes clients suffisaient à tenir la boucle ci-dessus sans aucune arrivée dans l'équipe
        // (vérifié par ablation) : il faut aussi un agent arrivé dans les six derniers mois.
        $this->assertGreaterThan(0, AgentProfile::query()
            ->whereHas('user', fn ($q) => $q->where('created_at', '>', now()->subMonths(6)))->count(), 'Aucun agent arrivé dans les six derniers mois.');
        $parti = AgentProfile::query()->where('status', AgentProfileStatus::Suspended)->firstOrFail();
        $this->assertGreaterThan(0, DB::table('property_visits')->where('agent_id', $parti->user_id)->where('scheduled_at', '<', $parti->updated_at)->count());
        $this->assertSame(0, DB::table('property_visits')->where('agent_id', $parti->user_id)->where('scheduled_at', '>=', $parti->updated_at)->count());
        $this->assertSame(0, DB::table('users')->whereNull('last_login_at')->whereExists(fn ($q) => $q->from('agent_profiles')->whereColumn('agent_profiles.user_id', 'users.id'))->count());

        // AC4 — un fil ancien a son activité près de son ouverture, pas dans le dernier mois.
        $messages = DB::table('messages as m')
            ->join('conversations as c', 'c.id', '=', 'm.conversation_id')
            ->where('c.created_at', '<', now()->subMonths(6))
            ->selectRaw('count(*) AS total, count(*) FILTER (WHERE m.created_at > ?) AS recents', [now()->subDays(30)])
            ->first();
        $this->assertGreaterThan(20, $messages->total);
        $this->assertLessThan(0.3, $messages->recents / $messages->total, "{$messages->recents} messages récents sur {$messages->total}.");

        // AC5 — une notification ancienne est lue ; une récente l'est moins souvent.
        $nonLues = fn ($q) => DB::table('app_notifications')->where($q)->selectRaw('count(*) AS total, count(*) FILTER (WHERE read_at IS NULL) AS non_lues')->first();
        $anciennes = $nonLues(fn ($q) => $q->where('created_at', '<', now()->subMonths(6)));
        $recentes = $nonLues(fn ($q) => $q->where('created_at', '>', now()->subDays(7)));
        $this->assertGreaterThan(0, $anciennes->total);
        $this->assertGreaterThan(0, $recentes->total);
        $this->assertLessThan(0.1, $anciennes->non_lues / $anciennes->total);
        $this->assertLessThan($recentes->non_lues / $recentes->total, $anciennes->non_lues / $anciennes->total);
        $this->assertGreaterThan(0, DB::table('app_notifications')->where('code', 'lease_payment.overdue_landlord')->count(), 'Aucune relance d\'impayé.');

        // AC6 — le journal d'activité nomme un auteur pour plus de la moitié de ses lignes.
        $journal = DB::table('activity_log')->selectRaw('count(*) AS total, count(causer_id) AS avec_auteur')->first();
        $this->assertGreaterThan(0.5, $journal->avec_auteur / $journal->total, "{$journal->avec_auteur} lignes avec auteur sur {$journal->total}.");
    }

    /**
     * TCK-2532 — la démo montre un annuaire d'agents EN EXERCICE.
     *
     * Mesuré le 2026-11-09 sur la base de dev semée : `GET /api/public/agents` → `total 0` depuis
     * TCK-2506. Tous les biens avaient pour titulaire (`properties.user_id`) un bailleur
     * (`PropertySeeder` ne tirait que des `OwnerProfile`), et l'annuaire ne liste plus d'office les
     * propriétaires. Le jeu est semé par le PIPELINE entier : les baux qui suivent font passer des
     * biens en `rented`, et c'est le portefeuille public d'APRÈS qui compte.
     */
    public function test_l_annuaire_seme_montre_des_agents_en_exercice_et_un_proprietaire_qui_l_a_choisi(): void
    {
        // Comme après le semis d'origine : le seeder rendait à Scout le moteur nul qu'il avait trouvé.
        config(['scout.driver' => null]);

        $lignes = collect($this->getJson('/api/public/agents?per_page=48')->assertOk()->json('data'));
        $agents = $lignes->where('public_role', 'agent');

        // Les agents EN EXERCICE : profil actif, agence active. Le parti (profil suspendu) n'en est pas.
        $enExercice = AgentProfile::query()
            ->where('status', AgentProfileStatus::Active->value)
            ->whereHas('agency', fn ($a) => $a->where('status', AgencyStatus::Active->value))
            ->pluck('user_id')->map(fn ($id) => (int) $id)->unique();

        $this->assertGreaterThan(0, $agents->count(), 'Aucun agent dans l\'annuaire semé.');
        // « La majorité des agents actifs » — pour que l'annuaire ait de quoi trier.
        $this->assertGreaterThan($enExercice->count() / 2, $agents->count(), sprintf(
            '%d agents listés sur %d en exercice.', $agents->count(), $enExercice->count(),
        ));

        foreach ($agents as $ligne) {
            $this->assertTrue($enExercice->contains((int) $ligne['id']), "Ligne « agent » {$ligne['id']} sans AgentProfile actif d'une agence active.");
            // Titulaire d'un bien public, pas seulement collaborateur : c'est ce que lit l'annuaire.
            $this->assertTrue(Property::query()->where('user_id', $ligne['id'])->publicPortfolio()->exists());
        }

        // TCK-2506 sur les données semées : un propriétaire listé paraît, un non listé jamais.
        $proprietaires = User::query()->whereHas('ownerProfiles')
            ->whereDoesntHave('agentProfiles')->whereDoesntHave('agencyAdminProfiles')->get();
        $listes = $proprietaires->where('listed_in_public_directory', true)->pluck('id')->map(fn ($id) => (int) $id);
        $nonListes = $proprietaires->where('listed_in_public_directory', false)->pluck('id')->map(fn ($id) => (int) $id);
        $ids = $lignes->pluck('id')->map(fn ($id) => (int) $id);

        $this->assertNotEmpty($nonListes, 'Tous les propriétaires sont listés : le défaut de TCK-2506 n\'est plus exercé.');
        $this->assertGreaterThan(0, $ids->intersect($listes)->count(), 'Aucun propriétaire listé ne paraît dans l\'annuaire.');
        $this->assertSame([], $ids->intersect($nonListes)->values()->all(), 'Un propriétaire non listé paraît dans l\'annuaire.');
        // Non-vacuité du « jamais » : des propriétaires non listés publient bien des biens publics.
        $this->assertTrue(Property::query()->whereIn('user_id', $nonListes)->publicPortfolio()->exists());
        $this->assertGreaterThan(0, OwnerProfile::query()->count());

        $this->assertTourniquetDesTitulaires($this->jeu()['contexte']);
    }

    /**
     * TCK-2379 — le seed remplit les tables des fonctionnalités livrées, par leurs services. TCK-2381
     * (lot 2) : rapprochement bancaire, reprises, relevés de gérance envoyés, métriques plateforme,
     * annonces, alertes de seuil, Espace résident, exports de données et tentatives d'envoi SMS.
     *
     * Mesuré le 2026-10-25 sur un seed par défaut : 25 tables lues par du code et vides, dont
     * `commission_entries`, `credit_lots`, `lease_signatures` et `kyc_dossiers` ; 162 vedettes sans
     * tranche ni statistique, nées de la conversion d'un drapeau `featured` tiré au hasard. Les gardes
     * d'AC6 (aucun appel sortant, pilote PDF déployé) sont posées par {@see semerLeJeu()}.
     */
    public function test_chaque_fonctionnalite_livree_s_ouvre_sur_des_donnees_coherentes(): void
    {
        $violations = (new ReferentialIntegrityChecker)->violations();
        foreach (self::INVARIANTS_DES_FONCTIONNALITES as $invariant) {
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

        // TCK-2381, AC1 — les tables de la plateforme.
        foreach (self::PLATEFORME as $table) {
            $this->assertTrue(DB::table($table)->exists(), "{$table} est vide.");
        }
        // TCK-2381, AC2 — non-vacuité de l'invariant : des lignes rapprochées, de chaque sens, et des reprises.
        $confirmees = BankStatementLine::query()->where('match_status', BankStatementLineMatchStatus::Confirmed);
        $this->assertTrue($confirmees->clone()->where('direction', 'credit')->exists(), 'Aucun crédit rapproché.');
        $this->assertTrue($confirmees->clone()->where('direction', 'debit')->exists(), 'Aucun débit rapproché.');
        $this->assertTrue(BankStatement::query()->where('status', BankStatementStatus::ReadyForReview)->exists(), 'Aucun relevé en cours de revue.');
        $this->assertTrue(BankStatement::query()->whereIn('status', [BankStatementStatus::Reconciled, BankStatementStatus::PartiallyReconciled])->exists(), 'Aucun relevé clôturé.');
        $this->assertTrue(DB::table('payout_clawbacks')->exists());
        // TCK-2381, AC4 — les avis d'import et de clôture de relevé ne partent pas pendant le seed :
        // `Http::preventStrayRequests()` ne voit pas une notification.
        $this->assertSame(0, DB::table('app_notifications')->whereIn('code', ['bank_statement.imported', 'bank_statement.finalized'])->count());
        // TCK-2381, AC3 — la série et ses stocks : la veille seule les porte.
        $this->assertSame(PlatformMetricsSeeder::JOURS, DB::table('platform_metrics_daily')->count());
        $this->assertSame(1, DB::table('platform_metrics_daily')->whereNotNull('stocks_captured_at')->count());
        $this->assertTrue(DB::table('platform_metrics_daily')->where('gmv_amount', '>', 0)->exists(), 'Aucun encaissé dans la série.');

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

        // TCK-2382 — ce qu'un visiteur voit aujourd'hui : chaque agence standard a des Vedettes en
        // cours, et non les seules survivantes de six mois d'achats (2 sur 582 biens en préproduction).
        foreach ($standards as $agencyId) {
            $actives = PropertyBoost::query()->where('agency_id', $agencyId)->where('kind', BoostKind::Featured)
                ->where('status', BoostStatus::Active)->where('ends_at', '>', now())->count();
            $this->assertGreaterThanOrEqual(3, $actives, "Vedettes actives de l'agence {$agencyId}.");
        }
    }

    /**
     * TCK-2380 — le seed écrit en français de métier. Mesuré le 2026-10-25 : messages, tâches,
     * interventions et avis semés étaient en latin (`faker()->sentence()`).
     */
    public function test_aucun_texte_seme_n_est_du_lorem_ipsum(): void
    {
        $lorem = array_flip((new ReflectionProperty(Lorem::class, 'wordList'))->getValue());
        $textes = 0;

        foreach (self::TEXTES as $table => $colonne) {
            foreach (DB::table($table)->whereNotNull($colonne)->pluck($colonne) as $texte) {
                $textes++;
                $mots = preg_split('/[^\p{L}]+/u', mb_strtolower($texte), -1, PREG_SPLIT_NO_EMPTY);
                $latins = array_filter($mots, fn (string $mot) => isset($lorem[$mot]));

                // « et », « est », « a » existent dans les deux langues : c'est la PART qui signe le lorem.
                $this->assertFalse(
                    count($latins) >= 3 && count($latins) * 2 >= count($mots),
                    "{$table}.{$colonne} contient du lorem ipsum : « {$texte} »",
                );
            }
        }

        $this->assertGreaterThan(50, $textes, 'Trop peu de textes semés pour que la mesure dise quelque chose.');
    }

    /** TCK-2380 — les loyers passent par plusieurs moyens de paiement. */
    public function test_les_loyers_passent_par_plusieurs_moyens_de_paiement(): void
    {
        // Les LOYERS : les cautions ont leurs propres moyens, et les compter ensemble laissait vert un
        // seed où tous les loyers passaient par Wave (vérifié par ablation).
        $this->assertGreaterThanOrEqual(3, LeasePayment::query()->where('payment_type', LeasePaymentType::Rent)->distinct()->count('payment_method'));
    }

    /**
     * TCK-701 (piste P16.01) — après un seed, TOUS les modèles indexés sont réindexés.
     *
     * Le seeder coupe Scout pendant les insertions, puis ne réindexait qu'une liste écrite à la main :
     * `Property`, `Document`, `Message`. `Customer`, `MaintenanceRequest`, `User` et `Agency`, devenus
     * `Searchable` avec TCK-281, n'y étaient pas : leurs index restaient vides (2 clients indexés pour
     * 564 en base), et `filter[search]` rendait une liste vide sur une base pleine. Le semis passe par
     * un moteur espion : `removeAllFromSearch()` appelle `flush()` une fois par modèle réindexé — par
     * le seeder entier, sans réflexion sur ses méthodes privées (ADR-0140 § 5, TCK-3013).
     */
    public function test_le_seeder_reindexe_chaque_modele_searchable(): void
    {
        $reindexes = array_values(array_unique($this->jeu()['reindexes']));
        sort($reindexes);

        $this->assertSame(SearchableModels::all(), $reindexes);
    }

    /**
     * TCK-3013, AC2 — un test qui écrit dans le jeu partagé ne laisse rien au test suivant. Les deux
     * tests sont symétriques : quel que soit l'ordre, le second voit ce que le premier aurait laissé.
     */
    public function test_une_ecriture_dans_le_jeu_partage_ne_se_voit_pas_du_test_suivant_a(): void
    {
        $this->assertLeJeuEstIntactPuisEcrire('a');
    }

    /** TCK-3013, AC2 — la jumelle du test précédent. */
    public function test_une_ecriture_dans_le_jeu_partage_ne_se_voit_pas_du_test_suivant_b(): void
    {
        $this->assertLeJeuEstIntactPuisEcrire('b');
    }

    /**
     * TCK-3013 — le jeu, validé hors de toute transaction, ne vit pas dans la base du processus : une
     * autre classe du même processus (séquentiel ou `--parallel`, où chaque processus a la sienne) ne
     * le voit pas.
     */
    public function test_la_base_du_processus_ne_voit_rien_du_jeu(): void
    {
        $this->assertSame(self::nomDeLaBaseDuJeu(), DB::connection()->getDatabaseName());
        $this->assertNotSame(TestDatabase::name(), DB::connection()->getDatabaseName());
        $this->assertGreaterThan(0, Agency::query()->count());

        $c = config('database.connections.pgsql');
        $baseDuProcessus = new PDO(sprintf('pgsql:host=%s;port=%s;dbname=%s', $c['host'], $c['port'], TestDatabase::name()), $c['username'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        // Pas encore migrée (cette classe est la première du processus) ou migrée et vide : dans les
        // deux cas, aucune agence du jeu.
        $migree = $baseDuProcessus->query("SELECT to_regclass('public.agencies') IS NOT NULL")->fetchColumn();
        $agences = $migree ? (int) $baseDuProcessus->query('SELECT count(*) FROM agencies')->fetchColumn() : 0;
        $this->assertSame(0, $agences);
    }

    private function assertLeJeuEstIntactPuisEcrire(string $marque): void
    {
        $this->assertSame($this->jeu()['agences'], Agency::query()->count(), 'Une agence du jeu a disparu, ou une autre est apparue.');
        $this->assertSame(0, Agency::query()->where('name', 'like', 'marque-%')->count(), 'Un test précédent a laissé son écriture dans le jeu partagé.');

        Agency::query()->update(['name' => "marque-{$marque}"]);
        Agency::factory()->create(['name' => "marque-{$marque}"]);

        $this->assertSame($this->jeu()['agences'] + 1, Agency::query()->where('name', "marque-{$marque}")->count());
    }

    /**
     * Les deux règles du tourniquet de {@see PropertySeeder} (un bien sur
     * {@see PropertySeeder::AGENT_TITULAIRE_UN_SUR} a pour titulaire un agent), jugées sur le jeu déjà
     * semé — aucun seed de plus :
     *
     * 1. un agent PARTI (départ dans `SeedingContext::$departs`, profil d'agent suspendu) n'est jamais
     *    titulaire — l'annuaire ne le liste pas, son portefeuille y serait orphelin ;
     * 2. un agent ARRIVÉ APRÈS le bien n'en est pas titulaire.
     *
     * Chaque règle n'est jugée qu'après avoir vérifié que son cas se produit : sans départ ni arrivée
     * tardive, les deux assertions seraient vraies de toute façon.
     */
    private function assertTourniquetDesTitulaires(SeedingContext $ctx): void
    {
        $profils = AgentProfile::query()->get(['user_id', 'status']);
        $idsAgents = $profils->pluck('user_id')->map(fn ($id) => (int) $id)->unique();
        $suspendus = $profils->where('status', AgentProfileStatus::Suspended)->pluck('user_id')->map(fn ($id) => (int) $id);
        $partis = collect(array_keys($ctx->departs))->map(fn ($id) => (int) $id);

        $tenusParUnAgent = Property::query()->whereIn('user_id', $idsAgents)->get(['id', 'user_id', 'created_at']);
        $arrivees = User::query()->whereIn('id', $idsAgents)->pluck('created_at', 'id');

        $this->assertGreaterThan(0, $tenusParUnAgent->count(), 'Aucun bien tenu par un agent : le tourniquet ne tourne pas.');
        $this->assertNotEmpty($partis, 'Aucun départ dans le jeu : la règle 1 n\'est pas exercée.');
        $this->assertEqualsCanonicalizing($partis->all(), $suspendus->all(), 'Un parti sans profil suspendu, ou l\'inverse.');
        $premierBien = Property::query()->whereNotNull('agency_id')->min('created_at');
        $this->assertNotEmpty(
            $arrivees->filter(fn ($arrivee) => $arrivee->greaterThan($premierBien)),
            'Aucun agent arrivé après le premier bien : la règle 2 n\'est pas exercée.',
        );

        // Règle 1.
        $this->assertSame(
            [],
            $tenusParUnAgent->filter(fn (Property $p) => $partis->contains((int) $p->user_id))->pluck('id')->all(),
            'Des biens ont pour titulaire un agent parti (profil suspendu).',
        );
        // Règle 2.
        $this->assertSame(
            [],
            $tenusParUnAgent->filter(fn (Property $p) => $p->created_at->lessThan($arrivees[(int) $p->user_id]))->pluck('id')->all(),
            'Des biens sont nés avant l\'arrivée de leur agent titulaire.',
        );
    }

    /** Un moteur Scout qui ne fait rien, sinon noter chaque modèle vidé. */
    private static function moteurEspion(): Engine
    {
        return new class extends Engine
        {
            /** @var array<int,class-string> */
            public array $vides = [];

            public function update($models): void {}

            public function delete($models): void {}

            public function search(Builder $builder): mixed
            {
                return [];
            }

            public function paginate(Builder $builder, $perPage, $page): mixed
            {
                return [];
            }

            public function mapIds($results): \Illuminate\Support\Collection
            {
                return collect();
            }

            public function map(Builder $builder, $results, $model): Collection
            {
                return $model->newCollection();
            }

            public function lazyMap(Builder $builder, $results, $model): LazyCollection
            {
                return LazyCollection::empty();
            }

            public function getTotalCount($results): int
            {
                return 0;
            }

            public function flush($model): void
            {
                $this->vides[] = $model::class;
            }

            public function createIndex($name, array $options = []): mixed
            {
                return null;
            }

            public function deleteIndex($name): mixed
            {
                return null;
            }
        };
    }
}
