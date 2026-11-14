<?php

namespace Tests\Feature\Lease;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\IdType;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Policies\LeasePolicy;
use App\Services\Lease\LandlordSignatory;
use App\Services\Lease\LeaseSignatureOtpService;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Pdf\DocumentPdfService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2803 — la suite de TCK-2780 : la LISTE des baux et les réponses des gestes ne rendent plus le
 * bloc `tenant` (téléphone, e-mail…) que sous `include=tenant`, borné par `fields[customers]`.
 */
class BailLocataireDeLaListeEtDesGestesTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Lease $lease;

    private Customer $tenant;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();

        $this->tenant = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'user_id' => $this->client->id,
            'first_name' => 'Awa',
            'last_name' => 'NDIAYE',
            'email' => 'awa.ndiaye@example.test',
            'phone' => '+221771234567',
            'id_type' => IdType::IdCard,
        ]);
        $this->lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id,
            'status' => LeaseStatus::Active,
        ]);

        $this->superAdmin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($this->superAdmin, 'super_admin');
    }

    /**
     * Les portes des onze gestes qui rendent `LeaseResource`, telles que leurs requêtes et contrôleurs
     * les jugent. `createOn` juge la création ; le bail créé porte le bailleur et l'agence du bien
     * (`LeaseService::create`), ceux du bail de référence.
     *
     * @return array<string, Closure(User, Lease): bool>
     */
    private static function portes(): array
    {
        $gate = fn (string $ability, array $args = []): Closure => fn (User $u, Lease $l): bool => Gate::forUser($u)->allows($ability, [$l, ...$args]);

        return [
            'POST leases (store)' => fn (User $u, Lease $l): bool => Gate::forUser($u)->allows('createOn', [Lease::class, $l->property]),
            'PATCH leases/{id} (update)' => $gate('update'),
            'POST activate' => fn (User $u, Lease $l): bool => Gate::forUser($u)->allows('update', $l) && LandlordSignatory::allows($u, $l),
            'POST terminate' => $gate('update'),
            'POST early-termination' => $gate('requestEarlyTermination'),
            'DELETE early-termination' => $gate('cancelEarlyTermination'),
            'POST early-termination/confirm' => $gate('confirmEarlyTermination'),
            'POST signature-request' => $gate('requestSignature'),
            'POST signature (locataire)' => $gate('sign', [LeaseSignature::ROLE_TENANT]),
            'POST signature (bailleur)' => $gate('sign', [LeaseSignature::ROLE_LANDLORD]),
            'POST renew' => $gate('renew'),
            'PATCH rent' => $gate('reviewRent'),
            'POST deposit-refund' => $gate('refundDeposit'),
        ];
    }

    /**
     * AC1 — tout utilisateur qu'une porte de geste admet, `LeasePolicy::view` l'admet aussi : la réponse
     * du geste ne sort jamais à quelqu'un qui ne lirait pas le bail par `GET /api/leases/{id}`.
     */
    public function test_ac1_chaque_porte_de_geste_est_incluse_dans_view(): void
    {
        $autreAgence = Agency::factory()->create();

        // L'agent qui a saisi un bien d'agence en est le `user_id`, recopié en `landlord_id` du bail
        // (TCK-1926) ; parti de l'agence, il ne lit plus le bail.
        $agentCreateur = $this->agencyAgent($this->agency);
        $bienDeLAgent = Property::factory()->create(['user_id' => $agentCreateur->id, 'agency_id' => $this->agency->id]);
        $bailDeLAgent = Lease::factory()->create([
            'property_id' => $bienDeLAgent->id, 'agency_id' => $this->agency->id,
            'landlord_id' => $agentCreateur->id, 'tenant_id' => $this->tenant->id, 'status' => LeaseStatus::PendingSignature,
        ]);
        AgentProfile::query()->where('user_id', $agentCreateur->id)->update(['status' => AgentProfileStatus::Inactive->value]);

        $membreParti = $this->agencyAgent($this->agency);
        AgentProfile::query()->where('user_id', $membreParti->id)->update(['status' => AgentProfileStatus::Inactive->value]);

        $cas = [
            'bailleur' => [fn () => $this->landlord->fresh(), $this->lease],
            'bailleur suspendu' => [function () {
                OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => OwnerProfileStatus::Blocked->value]);

                return $this->landlord->fresh();
            }, $this->lease],
            'bailleur parti' => [function () {
                OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => OwnerProfileStatus::Inactive->value]);

                return $this->landlord->fresh();
            }, $this->lease],
            'personnel' => [fn () => $this->agent->fresh(), $this->lease],
            'administrateur d\'agence' => [fn () => $this->agencyAdmin($this->agency), $this->lease],
            'locataire' => [fn () => $this->client->fresh(), $this->lease],
            'super-admin' => [fn () => $this->superAdmin->fresh(), $this->lease],
            'membre parti de l\'agence' => [fn () => $membreParti->fresh(), $this->lease],
            'agent créateur parti de l\'agence' => [fn () => $agentCreateur->fresh(), $bailDeLAgent],
            'autre bailleur de l\'agence' => [fn () => User::factory()->withOwnerProfile($this->agency)->create(), $this->lease],
            'personnel d\'une autre agence' => [fn () => $this->agencyAgent($autreAgence), $this->lease],
            'personnel de deux agences' => [function () use ($autreAgence) {
                $double = $this->agencyAgent($this->agency);
                AgentProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $autreAgence->id]);

                return $double->fresh();
            }, $this->lease],
            'inconnu' => [fn () => User::factory()->create(), $this->lease],
        ];

        $fuites = [];
        foreach ($cas as $qui => [$fabrique, $bail]) {
            $user = $fabrique();
            $bail = $bail->fresh();
            $voit = app(LeasePolicy::class)->view($user, $bail) || $user->isSuperAdmin();
            foreach (self::portes() as $porte => $admet) {
                if ($admet($user, $bail->fresh()) && ! $voit) {
                    $fuites[] = "{$porte} admet « {$qui} », que view refuse";
                }
            }
        }

        // La seule divergence admise, nommée (décision 3 du rapport de TCK-2803) : le personnel de deux
        // agences, sans profil actif dans celle du bail. `view` juge le personnel par le profil ACTIF
        // (`staffAgencyId`, ADR-0031 §3) ; la signature pour le bailleur par `isStaffAt` dans l'agence du
        // bail. Il est du personnel de cette agence, et lit le bail en y basculant : pas un accès hors
        // droit. La réponse ne porte plus le locataire (AC5). Toute autre divergence rougit.
        $this->assertSame(['POST signature (bailleur) admet « personnel de deux agences », que view refuse'], $fuites);
    }

    /**
     * AC1, la fuite que la confrontation a trouvée, de bout en bout : l'agent qui a saisi le bien,
     * parti de l'agence, ne lit plus le bail (403) ; il ne reçoit plus de code de signature pour le
     * bailleur, et ne signe plus pour lui. Avant, `/signature` lui rendait 200 et le locataire entier.
     */
    public function test_ac1_l_agent_createur_parti_ne_signe_plus_pour_le_bailleur(): void
    {
        $this->fauxContrat();
        $agentCreateur = $this->agencyAgent($this->agency);
        $bien = Property::factory()->create(['user_id' => $agentCreateur->id, 'agency_id' => $this->agency->id]);
        $bail = Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id,
            'landlord_id' => $agentCreateur->id, 'tenant_id' => $this->tenant->id, 'status' => LeaseStatus::Draft,
        ]);
        $this->en($this->agent)->postJson("/api/leases/{$bail->id}/signature-request")->assertOk();
        AgentProfile::query()->where('user_id', $agentCreateur->id)->update(['status' => AgentProfileStatus::Inactive->value]);

        $parti = $agentCreateur->fresh();
        $this->en($parti)->getJson("/api/leases/{$bail->id}")->assertForbidden();
        $this->en($parti)->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertForbidden();
        $this->en($parti)->postJson("/api/leases/{$bail->id}/signature", ['role' => 'landlord', 'code' => '123456'])->assertForbidden();
        Notification::assertNotSentTo($parti, LeaseSignatureCodeNotification::class);
    }

    /** @return array<string, User> */
    private function lecteurs(): array
    {
        return [
            'bailleur' => $this->landlord->fresh(),
            'personnel' => $this->agent->fresh(),
            'locataire' => $this->client->fresh(),
            'super-admin' => $this->superAdmin->fresh(),
        ];
    }

    private function en(User $qui): static
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($qui, 'sanctum');

        return $this;
    }

    /** @return array<string, mixed> la ligne du bail de référence dans `GET /api/leases{$requete}` */
    private function ligne(User $lecteur, string $requete): array
    {
        $lignes = $this->en($lecteur)->getJson('/api/leases'.$requete)->assertOk()->json('data');
        $ligne = collect($lignes)->firstWhere('id', $this->lease->id);
        $this->assertIsArray($ligne, "la ligne du bail manque à {$requete}");

        return $ligne;
    }

    private function assertSansCoordonnees(TestResponse $reponse, string $contexte): void
    {
        $json = (string) $reponse->getContent();
        $this->assertStringNotContainsString('771234567', $json, $contexte);
        $this->assertStringNotContainsString('awa.ndiaye@example.test', $json, $contexte);
    }

    /** AC2 — la liste sans `include=tenant` : ni la clé `tenant`, ni le téléphone ni l'e-mail, nulle part. */
    public function test_ac2_la_liste_sans_include_ne_porte_pas_le_locataire(): void
    {
        foreach ($this->lecteurs() as $qui => $lecteur) {
            foreach (['', '?include=property', '?include=property,landlord,agent,attention,due_summary', '?fields[customers]=id,phone,email'] as $requete) {
                $reponse = $this->en($lecteur)->getJson('/api/leases'.$requete)->assertOk();
                $this->assertNotEmpty($reponse->json('data'), "{$qui} {$requete}");
                foreach ($reponse->json('data') as $ligne) {
                    $this->assertArrayNotHasKey('tenant', $ligne, "{$qui} {$requete}");
                }
                $this->assertSansCoordonnees($reponse, "{$qui} {$requete}");
            }
        }
    }

    /** AC3 — sous `include=tenant`, `fields[customers]` borne le bloc de la liste comme celui de la fiche. */
    public function test_ac3_les_champs_demandes_bornent_le_bloc_de_la_liste(): void
    {
        foreach ($this->lecteurs() as $qui => $lecteur) {
            $requete = '?include=tenant,property&fields[customers]=id,first_name,last_name';
            $bloc = $this->ligne($lecteur, $requete)['tenant'];
            $this->assertArrayNotHasKey('phone', $bloc, $qui);
            $this->assertArrayNotHasKey('email', $bloc, $qui);
            $this->assertSame(['id' => $this->tenant->id, 'first_name' => 'Awa', 'last_name' => 'NDIAYE'], $bloc, $qui);
            $this->assertSansCoordonnees($this->en($lecteur)->getJson('/api/leases'.$requete), $qui);

            // La liste et la fiche acceptent la même forme, et rendent le même bloc.
            $fiche = $this->en($lecteur)->getJson("/api/leases/{$this->lease->id}{$requete}")->assertOk()->json('data.tenant');
            $this->assertSame($fiche, $bloc, $qui);

            // `id` est toujours rendu, demandé ou non.
            $this->assertSame(['id' => $this->tenant->id, 'first_name' => 'Awa'], $this->ligne($lecteur, '?include=tenant&fields[customers]=first_name')['tenant'], $qui);
        }
    }

    /** Une clé demandée sur la liste n'ouvre aucun droit : les gardes de `CustomerResource` se jugent sur la fiche complète. */
    public function test_une_cle_demandee_sur_la_liste_n_ouvre_aucun_droit(): void
    {
        $requete = '?include=tenant&fields[customers]=id,id_type,budget_max,phone';

        $this->assertSame(['id' => $this->tenant->id, 'phone' => '+221771234567'], $this->ligne($this->landlord->fresh(), $requete)['tenant']);
        $this->assertSame(['id' => $this->tenant->id, 'phone' => '+221771234567'], $this->ligne($this->client->fresh(), $requete)['tenant']);
        $personnel = $this->ligne($this->agent->fresh(), $requete)['tenant'];
        $this->assertSame('id_card', $personnel['id_type']);
        $this->assertArrayNotHasKey('email', $personnel);
    }

    /**
     * AC4 — `include=tenant` sans `fields` rend le bloc d'avant : les clés relevées sur l'arbre d'avant
     * TCK-2803 (le 2026-11-14, `BailLocataireALaDemandeTest` vert : la liste y rendait ces clés).
     */
    public function test_ac4_sans_fields_le_bloc_de_la_liste_est_celui_d_avant(): void
    {
        $attendues = [
            'bailleur' => self::CLES_COMMUNES,
            'personnel' => self::CLES_DU_PERSONNEL,
            'locataire' => self::CLES_COMMUNES,
            'super-admin' => self::CLES_DU_PERSONNEL,
        ];

        foreach ($this->lecteurs() as $qui => $lecteur) {
            foreach (['?include=tenant', '?include=tenant&fields[customers][]=first_name'] as $requete) {
                $bloc = $this->ligne($lecteur, $requete)['tenant'];
                $this->assertSame($attendues[$qui], array_keys($bloc), "{$qui} {$requete}");
                $this->assertSame('+221771234567', $bloc['phone'], $qui);
                $this->assertSame('awa.ndiaye@example.test', $bloc['email'], $qui);
            }
        }
    }

    /**
     * Pas de N+1 : la liste bornée se sert en un nombre de requêtes qui ne dépend pas du nombre de
     * lignes — les gardes de `CustomerResource` lisent la fiche déjà chargée, sans la relire.
     */
    public function test_la_liste_bornee_ne_relit_pas_une_fiche_par_ligne(): void
    {
        $requete = '/api/leases?per_page=50&include=tenant,property&fields[customers]=id,first_name,last_name,phone';
        foreach ([$this->landlord->fresh(), $this->agent->fresh()] as $lecteur) {
            $compter = function () use ($lecteur, $requete): int {
                $this->en($lecteur);
                DB::flushQueryLog();
                DB::enableQueryLog();
                $this->getJson($requete)->assertOk();
                $n = count(DB::getQueryLog());
                DB::disableQueryLog();

                return $n;
            };
            $this->autresBaux(2);
            $compter();
            $trois = $compter();
            $this->autresBaux(6);
            $neuf = $compter();
            $this->assertSame($trois, $neuf, "3 baux : {$trois} requêtes ; 9 baux : {$neuf}");
        }
    }

    private function autresBaux(int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            $locataire = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id, 'user_id' => User::factory()->create()->id]);
            $this->bail(['tenant_id' => $locataire->id]);
        }
    }

    /** @param  array<string, mixed>  $attributs */
    private function bail(array $attributs = []): Lease
    {
        $bien = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);

        return Lease::factory()->create($attributs + [
            'property_id' => $bien->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id,
            'status' => LeaseStatus::Active,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
            'monthly_rent' => 100_000,
            'deposit_amount' => 200_000,
        ]);
    }

    private function fauxContrat(): void
    {
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturn('%PDF-1.4 contrat');
        });
    }

    /**
     * AC5 — chacun des onze gestes (douze routes) rend sa réponse sans le locataire : ni la clé `tenant`,
     * ni son téléphone ni son e-mail. Les gestes du locataire passent par lui : `LeasePolicy` lit alors
     * `$lease->tenant` pour le reconnaître, ce qui charge la relation avant le rendu.
     */
    public function test_ac5_aucun_geste_ne_rend_le_locataire(): void
    {
        $this->fauxContrat();
        $bailleur = $this->landlord->fresh();
        $locataire = $this->client->fresh();
        $gestes = [];

        $bien = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        // Le personnel : la fiche du locataire est celle de l'agence, que le bailleur ne lit pas.
        $gestes['POST leases'] = $this->en($this->agent->fresh())->postJson('/api/leases', [
            'property_id' => $bien->id, 'tenant_id' => $this->tenant->id, 'type' => 'residential_rent',
            'start_date' => now()->addDays(3)->toDateString(), 'monthly_rent' => 100_000,
        ])->assertCreated();

        $brouillon = $this->bail(['status' => LeaseStatus::Draft, 'start_date' => now()->addDays(3)->toDateString()]);
        $gestes['PATCH leases/{id}'] = $this->en($bailleur)->patchJson("/api/leases/{$brouillon->id}", ['late_fee_percent' => 5])->assertOk();
        $gestes['POST activate'] = $this->en($bailleur)->post("/api/leases/{$brouillon->id}/activate",
            ['contract' => UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf')], ['Accept' => 'application/json'])->assertOk();

        $aSigner = $this->bail(['status' => LeaseStatus::Draft, 'start_date' => now()->addDays(3)->toDateString()]);
        $gestes['POST signature-request'] = $this->en($bailleur)->postJson("/api/leases/{$aSigner->id}/signature-request")->assertOk();
        $this->en($locataire)->postJson("/api/leases/{$aSigner->id}/signature/otp", ['role' => 'tenant'])->assertStatus(202);
        $code = null;
        Notification::assertSentTo($locataire, LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code): bool {
            $code = $n->code;

            return true;
        });
        $gestes['POST signature'] = $this->en($locataire)->postJson("/api/leases/{$aSigner->id}/signature", ['role' => 'tenant', 'code' => $code])->assertOk();

        $gestes['PATCH rent'] = $this->en($bailleur)->patchJson("/api/leases/{$this->bail()->id}/rent", ['new_rent' => 105_000, 'reason' => 'Révision annuelle'])->assertOk();
        $gestes['POST renew'] = $this->en($bailleur)->postJson("/api/leases/{$this->bail()->id}/renew", [
            'start_date' => now()->addMonths(6)->addDay()->toDateString(), 'end_date' => now()->addMonths(18)->toDateString(),
        ])->assertSuccessful();

        $preavis = $this->bail();
        $gestes['POST early-termination'] = $this->en($locataire)->postJson("/api/leases/{$preavis->id}/early-termination", ['effective_date' => now()->addDays(45)->toDateString()])->assertCreated();
        $gestes['DELETE early-termination'] = $this->en($locataire)->deleteJson("/api/leases/{$preavis->id}/early-termination")->assertOk();

        $confirme = $this->bail();
        $this->en($locataire)->postJson("/api/leases/{$confirme->id}/early-termination", ['effective_date' => now()->addDays(45)->toDateString()])->assertCreated();
        Invoice::query()->whereKey($confirme->fresh()->early_termination_invoice_id)->update(['status' => InvoiceStatus::Paid->value]);

        // La caution encaissée : une échéance `deposit` payée (`withCollectedDeposit`).
        $bienCaution = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $caution = Lease::factory()->withCollectedDeposit()->create([
            'property_id' => $bienCaution->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id, 'status' => LeaseStatus::Active, 'deposit_amount' => 200_000,
            'start_date' => now()->subMonths(6)->toDateString(), 'end_date' => now()->addMonths(6)->toDateString(),
        ]);
        $gestes['POST terminate'] = $this->en($bailleur)->postJson("/api/leases/{$caution->id}/terminate", ['reason' => 'Fin'])->assertOk();
        $gestes['POST deposit-refund'] = $this->en($bailleur)->postJson("/api/leases/{$caution->id}/deposit-refund", ['amount' => 200_000])->assertCreated();

        $this->travel(46)->days();
        $gestes['POST early-termination/confirm'] = $this->en($bailleur)->postJson("/api/leases/{$confirme->id}/early-termination/confirm")->assertOk();

        $this->assertCount(12, $gestes);
        // Toutes les fuites à la fois, geste par geste : une ablation les nomme toutes.
        $fuites = [];
        foreach ($gestes as $geste => $reponse) {
            $bail = $reponse->json('data.lease') ?? $reponse->json('data');
            $this->assertIsArray($bail, $geste);
            $this->assertArrayHasKey('status', $bail, $geste);
            $json = (string) $reponse->getContent();
            if (array_key_exists('tenant', $bail) || str_contains($json, '771234567') || str_contains($json, 'awa.ndiaye@example.test')) {
                $fuites[] = $geste;
            }
        }
        $this->assertSame([], $fuites, 'ces gestes rendent le locataire');
    }

    private const CLES_COMMUNES = ['id', 'first_name', 'last_name', 'email', 'phone', 'occupation', 'status', 'pipeline_stage', 'locale', 'agency_id', 'user_id', 'added_by_id', 'last_contacted_at', 'created_at', 'updated_at'];

    private const CLES_DU_PERSONNEL = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'id_type', 'id_number_masked', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone', 'status', 'pipeline_stage', 'locale', 'agency_id',
        'user_id', 'added_by_id', 'metadata', 'notes', 'seeking_contract_type', 'budget_min', 'budget_max',
        'seeking_property_types', 'seeking_cities', 'seeking_neighborhoods', 'min_bedrooms', 'last_contacted_at',
        'created_at', 'updated_at',
    ];

    /**
     * TCK-2803, exigence 1 de team-lead : l'agent créateur EN POSTE (le personnel de l'agence, rôle
     * système d'agent, donc `leases.sign`) mène encore la signature du bailleur jusqu'au même état final
     * qu'avant le correctif. Il y passe désormais par la voie du personnel mandaté (`isMandatedStaff`) et
     * non plus par `isLandlord` ; `onBehalfOf` garde sa comparaison brute : la preuve reste « pour
     * lui-même » (`on_behalf_of_user_id` nul). L'instantané a été relevé sur l'arbre d'AVANT, en
     * remettant la comparaison brute dans `isLandlord`, puis comparé à l'arbre d'après : identiques.
     */
    public function test_l_agent_createur_en_poste_mene_la_signature_jusqu_au_meme_etat_final(): void
    {
        $this->fauxContrat();
        $agentCreateur = $this->agencyAgent($this->agency);
        $this->client->forceFill(['phone_verified_at' => null])->save();
        $etiquettes = [$agentCreateur->id => 'agent créateur', $this->client->id => 'locataire'];
        $nommer = fn (?int $id): ?string => $id === null ? null : ($etiquettes[$id] ?? 'autre');
        $bailDeLAgent = function () use ($agentCreateur): Lease {
            $bien = Property::factory()->create(['user_id' => $agentCreateur->id, 'agency_id' => $this->agency->id]);

            return Lease::factory()->create([
                'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $agentCreateur->id,
                'tenant_id' => $this->tenant->id, 'status' => LeaseStatus::Draft,
                'start_date' => now()->addDays(3)->toDateString(), 'end_date' => now()->addYear()->toDateString(),
            ]);
        };
        $code = function (User $qui): string {
            $code = null;
            Notification::assertSentTo($qui, LeaseSignatureCodeNotification::class, function (LeaseSignatureCodeNotification $n) use (&$code): bool {
                $code = $n->code;

                return true;
            });

            return (string) $code;
        };

        // La voie par code : l'agent envoie, signe pour le bailleur, puis le locataire signe.
        $bail = $bailDeLAgent();
        $agent = $agentCreateur->fresh();
        $this->en($agent)->postJson("/api/leases/{$bail->id}/signature-request")->assertOk();
        $this->assertSame(['landlord'], $this->en($agent)->getJson("/api/leases/{$bail->id}")->assertOk()->json('data.can_sign_as'));
        $this->en($agent)->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'landlord'])->assertStatus(202);
        $this->en($agent)->postJson("/api/leases/{$bail->id}/signature", ['role' => 'landlord', 'code' => $code($agent)])->assertOk();
        $this->en($this->client->fresh())->postJson("/api/leases/{$bail->id}/signature/otp", ['role' => 'tenant'])->assertStatus(202);
        $this->en($this->client->fresh())->postJson("/api/leases/{$bail->id}/signature", ['role' => 'tenant', 'code' => $code($this->client->fresh())])->assertOk();

        // La voie papier, sur un second brouillon.
        $papier = $bailDeLAgent();
        $this->en($agent)->post("/api/leases/{$papier->id}/activate",
            ['contract' => UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf')], ['Accept' => 'application/json'])->assertOk();

        // L'état des lieux, signé par l'agent pour le bailleur.
        $etat = Inventory::factory()->pendingSignature()->create([
            'lease_id' => $bail->id, 'property_id' => $bail->property_id, 'tenant_id' => $this->tenant->id, 'conducted_by' => $agentCreateur->id,
        ]);
        $this->en($agent)->postJson("/api/inventories/{$etat->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE_DESSINEE])->assertOk();

        $preuves = fn (Lease $l): array => LeaseSignature::query()->where('lease_id', $l->id)->orderBy('role')->get()
            ->map(fn (LeaseSignature $s): array => [
                'role' => $s->role, 'method' => $s->method, 'user' => $nommer($s->user_id),
                'on_behalf_of' => $nommer($s->on_behalf_of_user_id), 'recorded_by' => $nommer($s->recorded_by_id),
                'contrat_courant' => $s->document_sha256 === $l->fresh()->contract_sha256,
            ])->all();
        $journal = fn (Lease $l): array => Activity::query()->where('subject_type', $l->getMorphClass())->where('subject_id', $l->id)
            ->orderBy('id')->get()->map(fn (Activity $a): string => $a->description.' / '.$nommer($a->causer_id))->all();
        $etatDuLieu = $etat->fresh();
        $instantane = [
            'bail' => ['statut' => $bail->fresh()->status->value, 'preuves' => $preuves($bail), 'journal' => $journal($bail)],
            'papier' => ['statut' => $papier->fresh()->status->value, 'preuves' => $preuves($papier), 'journal' => $journal($papier)],
            'etat_des_lieux' => [
                'owner_signed' => (bool) $etatDuLieu->owner_signed,
                'owner_signed_by' => $nommer($etatDuLieu->owner_signed_by_user_id),
                'owner_signed_on_behalf_of' => $nommer($etatDuLieu->owner_signed_on_behalf_of_user_id),
            ],
            'avis' => AppNotification::query()->whereIn('user_id', array_keys($etiquettes))->orderBy('id')->get()
                ->map(fn (AppNotification $n): string => $n->code.' → '.$nommer($n->user_id))->all(),
        ];
        if (($sortie = getenv('TCK2803_INSTANTANE')) !== false && $sortie !== '') {
            file_put_contents($sortie, json_encode($instantane, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }

        $this->assertSame('active', $instantane['bail']['statut']);
        $this->assertSame([
            ['role' => 'landlord', 'method' => 'otp', 'user' => 'agent créateur', 'on_behalf_of' => null, 'recorded_by' => null, 'contrat_courant' => true],
            ['role' => 'tenant', 'method' => 'otp', 'user' => 'locataire', 'on_behalf_of' => null, 'recorded_by' => null, 'contrat_courant' => true],
        ], $instantane['bail']['preuves']);
        $this->assertSame('active', $instantane['papier']['statut']);
        $this->assertSame([
            ['role' => 'landlord', 'method' => 'paper', 'user' => null, 'on_behalf_of' => null, 'recorded_by' => 'agent créateur', 'contrat_courant' => true],
            ['role' => 'tenant', 'method' => 'paper', 'user' => null, 'on_behalf_of' => null, 'recorded_by' => 'agent créateur', 'contrat_courant' => true],
        ], $instantane['papier']['preuves']);
        $this->assertSame(['owner_signed' => true, 'owner_signed_by' => 'agent créateur', 'owner_signed_on_behalf_of' => null], $instantane['etat_des_lieux']);
        $this->assertSame(['created / ', 'updated / agent créateur', 'updated / locataire', 'updated / locataire', 'tenant_welcomed / locataire'], $instantane['bail']['journal']);
        $this->assertSame([
            'lease.signature_requested → locataire', 'lease.signature_requested → agent créateur', 'lease.signed_by_party → locataire',
            'lease.signature_completed → locataire', 'lease.signature_completed → agent créateur',
        ], $instantane['avis']);
    }

    /**
     * Exigence 2 — chaque porte que le correctif ferme, éprouvée sur l'agent créateur PARTI, une par
     * test : une ablation nomme ainsi chaque porte qu'elle rouvre.
     *
     * @return array{0: User, 1: Lease, 2: Lease, 3: Inventory}
     */
    private function agentCreateurParti(): array
    {
        $this->fauxContrat();
        $agentCreateur = $this->agencyAgent($this->agency);
        $bien = Property::factory()->create(['user_id' => $agentCreateur->id, 'agency_id' => $this->agency->id]);
        $nouveau = fn (): Lease => Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $agentCreateur->id,
            'tenant_id' => $this->tenant->id, 'status' => LeaseStatus::Draft,
            'start_date' => now()->addDays(3)->toDateString(), 'end_date' => now()->addYear()->toDateString(),
        ]);
        $aSigner = $nouveau();
        $this->en($this->agent->fresh())->postJson("/api/leases/{$aSigner->id}/signature-request")->assertOk();
        $papier = $nouveau();
        $etat = Inventory::factory()->pendingSignature()->create([
            'lease_id' => $aSigner->id, 'property_id' => $bien->id, 'tenant_id' => $this->tenant->id, 'conducted_by' => $agentCreateur->id,
        ]);
        AgentProfile::query()->where('user_id', $agentCreateur->id)->update(['status' => AgentProfileStatus::Inactive->value]);

        return [$agentCreateur->fresh(), $aSigner->fresh(), $papier->fresh(), $etat];
    }

    public function test_porte_fermee_l_envoi_du_code(): void
    {
        [$parti, $aSigner] = $this->agentCreateurParti();
        $this->en($parti)->postJson("/api/leases/{$aSigner->id}/signature/otp", ['role' => 'landlord'])->assertForbidden();
        Notification::assertNotSentTo($parti, LeaseSignatureCodeNotification::class);
    }

    public function test_porte_fermee_la_signature(): void
    {
        [$parti, $aSigner] = $this->agentCreateurParti();
        // Un code émis pour lui (par le service, hors de la porte) : la porte seule le refuse.
        $code = app(LeaseSignatureOtpService::class)->issue($aSigner, $parti, 'landlord', 'mail', 'x•••@example.test');
        $this->en($parti)->postJson("/api/leases/{$aSigner->id}/signature", ['role' => 'landlord', 'code' => $code])->assertForbidden();
        $this->assertSame(0, LeaseSignature::query()->where('lease_id', $aSigner->id)->count());
    }

    public function test_porte_fermee_roles_for(): void
    {
        [$parti, $aSigner] = $this->agentCreateurParti();
        $this->assertSame([], LeaseSignatureService::rolesFor($parti, $aSigner));
    }

    public function test_porte_fermee_la_signature_d_etat_des_lieux(): void
    {
        [$parti, , , $etat] = $this->agentCreateurParti();
        $this->en($parti)->postJson("/api/inventories/{$etat->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE_DESSINEE])->assertForbidden();
        $this->assertFalse((bool) $etat->fresh()->owner_signed);
    }

    /** La voie papier : la requête (`update`, puis `LandlordSignatory`) et le service, qui revérifie. */
    public function test_porte_fermee_la_voie_papier(): void
    {
        [$parti, , $papier] = $this->agentCreateurParti();
        $this->en($parti)->post("/api/leases/{$papier->id}/activate",
            ['contract' => UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf')], ['Accept' => 'application/json'])->assertForbidden();
        try {
            app(LeaseSignatureService::class)->signOnPaper($papier, UploadedFile::fake()->create('bail.pdf', 120, 'application/pdf'), $parti);
            $this->fail('signOnPaper a accepté l\'agent créateur parti');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
        $this->assertSame(LeaseStatus::Draft, $papier->fresh()->status);
    }

    private const SIGNATURE_DESSINEE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';
}
