<?php

namespace Tests\Feature\Authorization;

use App\Jobs\NotifyNewMessageJob;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\ParticipantRole;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Message;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Dashboard\DashboardOwnerService;
use App\Services\Export\ExportDataService;
use App\Services\Membership\TeamMemberSuspensionService;
use App\Services\Messaging\ConversationAccess;
use App\Services\Model\NotificationService;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-2275 (P232.01, P232.02, P232.03, P232.05, P232.06 ; ADR-0031, amendement du 2026-10-25,
 * D1) — une colonne de bailleur (`leases.landlord_id`, `properties.user_id`) ne désigne son bailleur
 * que selon `BailleurDuBien`, chez TOUS ses lecteurs : tableau de bord, export, archive RGPD, fils
 * de messagerie, obligations de l'effacement.
 *
 * L'agent qui a saisi un bien d'agence en est le `user_id`, et `LeaseService::create` le recopie en
 * `landlord_id`. Suspendu ou retiré, il n'est plus rien pour ces lignes ; actif, il agit au titre du
 * personnel, jamais du bailleur (archive et effacement, précédent TCK-1017).
 *
 * Témoins : aucun bailleur légitime ne perd une ligne — le particulier sans agence, l'hôte d'une
 * agence `individual`, le bailleur bloqué, et le bailleur d'une agence B qui est agent suspendu
 * d'une agence A.
 */
class ColonneDeBailleurAgentCreateurTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $tenant;

    private Lease $bail;

    private Property $bien;

    private User $proprietaire;

    private Lease $bailDuProprietaire;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
        $this->agent = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
        $this->tenant = User::factory()->create();

        // Le bien saisi par l'agent (`PropertyController::store`) et son bail (`LeaseService::create`).
        [$this->bien, $this->bail] = $this->bienLoue($this->agent, $this->agency->id, 150_000, $this->tenant);

        $this->proprietaire = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $this->proprietaire->id, 'agency_id' => $this->agency->id]);
        [, $this->bailDuProprietaire] = $this->bienLoue($this->proprietaire, $this->agency->id, 200_000);
    }

    /** @return array{0: Property, 1: Lease} un bien loué, un loyer encaissé ce mois-ci, un dépôt et un impayé */
    private function bienLoue(User $designe, ?int $agencyId, int $loyer, ?User $locataire = null): array
    {
        $bien = Property::factory()->create([
            'user_id' => $designe->id,
            'agency_id' => $agencyId,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'status' => PropertyStatus::Rented,
            'created_at' => now()->subYear(),
        ]);
        $customer = Customer::factory()->create(['user_id' => ($locataire ?? User::factory()->create())->id]);
        $bail = Lease::factory()->active()->create([
            'property_id' => $bien->id,
            'agency_id' => $agencyId,
            'landlord_id' => $designe->id,
            'tenant_id' => $customer->id,
            'monthly_rent' => $loyer,
            'start_date' => now()->subMonths(6)->toDateString(),
        ]);
        LeasePayment::factory()->paid()->create(['lease_id' => $bail->id, 'payer_id' => $customer->id, 'amount' => $loyer]);
        LeasePayment::factory()->paid()->create(['lease_id' => $bail->id, 'payer_id' => $customer->id, 'amount' => $loyer, 'payment_type' => LeasePaymentType::Deposit]);
        LeasePayment::factory()->late()->create(['lease_id' => $bail->id, 'payer_id' => $customer->id, 'amount' => $loyer]);

        return [$bien, $bail];
    }

    private function ecarter(string $ecartement, ?User $membre = null): User
    {
        $membre = ($membre ?? $this->agent)->fresh();
        match ($ecartement) {
            'suspendu' => app(TeamMemberSuspensionService::class)->suspend($this->agency, $membre, $this->admin),
            'retiré' => app(AgencyMemberRemovalService::class)->remove($this->agency, $membre, $this->admin, leaveUnassigned: true),
            'actif' => null,
        };

        return $membre->fresh();
    }

    /** @return array<string, array{string}> */
    public static function ecartes(): array
    {
        return ['suspendu' => ['suspendu'], 'retiré' => ['retiré']];
    }

    /** @return array<string, array{string}> */
    public static function agents(): array
    {
        return ['actif' => ['actif'], 'suspendu' => ['suspendu'], 'retiré' => ['retiré']];
    }

    /** @return list<int> */
    private function ids(array $rows): array
    {
        return array_map(fn (array $row): int => (int) $row['id'], $rows);
    }

    // --- P232.01 : le tableau de bord ----------------------------------------------------------

    #[DataProvider('ecartes')]
    public function test_p232_01_l_agent_createur_ecarte_n_a_plus_le_tableau_de_bord_du_bailleur(string $ecartement): void
    {
        $agent = $this->ecarter($ecartement);

        $this->actingAsApi($agent);
        $this->getJson('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'tenant');

        $resume = app(DashboardOwnerService::class)->summary($agent);
        $this->assertSame(0, $resume['portfolio']['total'], "agent {$ecartement} : bien saisi compté");
        $this->assertSame(0, $resume['leases']['active'], "agent {$ecartement} : bail saisi compté");
        $this->assertSame(0.0, $resume['finance']['expected_monthly']);
        $this->assertSame(0.0, $resume['finance']['lease_income_month'], 'loyer encaissé compté');
        $this->assertSame(0.0, $resume['finance']['deposits_held'], 'dépôt compté');
        $this->assertSame(0, $resume['finance']['overdue_count'], 'impayé compté');
        $this->assertNull($resume['occupancy']['rate_percent'], 'occupation comptée');
        $this->assertSame([], array_filter(app(DashboardOwnerService::class)->monthlyTimeseries($agent, 3)['occupancy']), 'occupation mensuelle comptée');
    }

    public function test_p232_01_l_agent_createur_actif_garde_la_vue_d_agent(): void
    {
        $this->actingAsApi($this->agent);

        $this->getJson('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'agent');
    }

    public function test_p232_01_le_particulier_l_hote_et_le_bailleur_bloque_gardent_leur_tableau_de_bord(): void
    {
        $particulier = User::factory()->create();
        $this->bienLoue($particulier, null, 90_000);

        $individuelle = Agency::factory()->individual()->create();
        $hote = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $hote->id, 'agency_id' => $individuelle->id]);
        OwnerProfile::query()->create(['user_id' => $hote->id, 'agency_id' => $individuelle->id]);
        $this->bienLoue($hote, $individuelle->id, 120_000);

        $bloque = $this->ecarter('suspendu', $this->proprietaire);
        $this->assertFalse($bloque->isOwnerAt($this->agency->id), 'prémisse : bailleur bloqué');

        foreach ([[$particulier, 90_000], [$hote, 120_000], [$bloque, 200_000]] as [$bailleur, $loyer]) {
            $this->actingAsApi($bailleur);
            $me = $this->getJson('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'owner')->json('data.metrics');
            $this->assertSame(1, $me['portfolio_total'], "bailleur {$bailleur->id}");
            $this->assertSame(1, $me['leases_active']);
            $this->assertEquals($loyer, $me['expected_monthly']);
            $this->assertSame(1, $me['overdue_count']);

            $resume = app(DashboardOwnerService::class)->summary($bailleur);
            $this->assertEquals($loyer, $resume['finance']['lease_income_month']);
            $this->assertEquals($loyer, $resume['finance']['deposits_held']);
            $this->assertNotNull($resume['occupancy']['rate_percent']);
        }
    }

    // --- P232.06 : bailleur dans une agence B, agent suspendu dans A -------------------------------

    public function test_p232_06_le_bailleur_de_b_suspendu_comme_agent_de_a_ne_compte_ni_n_exporte_les_lignes_de_a(): void
    {
        $agenceB = Agency::factory()->create();
        OwnerProfile::query()->create(['user_id' => $this->agent->id, 'agency_id' => $agenceB->id]);
        [$bienB, $bailB] = $this->bienLoue($this->agent, $agenceB->id, 80_000);
        $agent = $this->ecarter('suspendu');
        $this->assertSame($agenceB->id, (int) $agent->agency_id, 'prémisse : l\'agence active est B');

        $this->actingAsApi($agent);
        $resume = $this->getJson('/api/dashboard/owner')->assertOk()->json('data');
        $this->assertSame(1, $resume['portfolio']['total'], 'le bien de A compté');
        $this->assertSame(1, $resume['leases']['active'], 'le bail de A compté');
        $this->assertEquals(80_000, $resume['finance']['expected_monthly']);
        $this->assertEquals(80_000, $resume['finance']['lease_income_month']);

        $exports = app(ExportDataService::class);
        $this->assertSame([$bailB->id], $this->ids($exports->collect('leases', $agent)['rows']), 'export des baux');
        $this->assertSame([$bienB->id], $this->ids($exports->collect('properties', $agent)['rows']), 'export des biens');
        $paiements = LeasePayment::query()->whereIn('id', $this->ids($exports->collect('payments', $agent)['rows']))->pluck('lease_id')->unique()->values()->all();
        $this->assertSame([$bailB->id], $paiements, 'export des paiements');
    }

    public function test_p232_06_le_bailleur_de_l_agence_exporte_toujours_ses_lignes(): void
    {
        $exports = app(ExportDataService::class);

        $this->assertSame([$this->bailDuProprietaire->id], $this->ids($exports->collect('leases', $this->proprietaire)['rows']));
        $this->assertSame([$this->bailDuProprietaire->property_id], $this->ids($exports->collect('properties', $this->proprietaire)['rows']));
        $this->assertCount(3, $exports->collect('payments', $this->proprietaire)['rows']);
    }

    // --- P232.02 : l'archive RGPD -------------------------------------------------------------------

    #[DataProvider('agents')]
    public function test_p232_02_l_archive_de_l_agent_ne_contient_plus_les_baux_qu_il_a_saisis(string $ecartement): void
    {
        $agent = $this->ecarter($ecartement);

        $baux = array_column(app(DataExportBuilder::class)->payloads($agent)['leases.json'], 'id');

        $this->assertNotContains($this->bail->id, $baux, "agent {$ecartement} : bail saisi dans l'archive");
    }

    public function test_p232_02_le_bailleur_le_locataire_et_le_particulier_gardent_leurs_baux_dans_l_archive(): void
    {
        $particulier = User::factory()->create();
        [, $bailDuParticulier] = $this->bienLoue($particulier, null, 90_000);
        $bloque = $this->ecarter('suspendu', $this->proprietaire);
        $archive = app(DataExportBuilder::class);

        $this->assertContains($this->bailDuProprietaire->id, array_column($archive->payloads($bloque)['leases.json'], 'id'), 'bailleur bloqué');
        $this->assertContains($this->bail->id, array_column($archive->payloads($this->tenant)['leases.json'], 'id'), 'locataire');
        $this->assertContains($bailDuParticulier->id, array_column($archive->payloads($particulier)['leases.json'], 'id'), 'particulier');
    }

    // --- P232.05 : l'effacement ---------------------------------------------------------------------

    #[DataProvider('agents')]
    public function test_p232_05_les_baux_saisis_ne_sont_pas_des_obligations_de_l_agent(string $ecartement): void
    {
        $agent = $this->ecarter($ecartement);

        $baux = collect(app(AccountDeletionService::class)->collectOpenObligations($agent))->where('type', 'lease')->pluck('id')->all();

        $this->assertNotContains($this->bail->id, $baux, "agent {$ecartement} : bail saisi compté comme obligation");
    }

    public function test_p232_05_le_bailleur_le_bailleur_bloque_le_particulier_et_le_locataire_gardent_l_obligation(): void
    {
        $particulier = User::factory()->create();
        [, $bailDuParticulier] = $this->bienLoue($particulier, null, 90_000);
        $deletion = app(AccountDeletionService::class);
        $baux = fn (User $u): array => collect($deletion->collectOpenObligations($u))->where('type', 'lease')->pluck('id')->all();

        $this->assertContains($this->bailDuProprietaire->id, $baux($this->proprietaire), 'bailleur actif');
        $this->assertContains($bailDuParticulier->id, $baux($particulier), 'particulier');
        $this->assertContains($this->bail->id, $baux($this->tenant), 'locataire');
        $this->assertContains($this->bailDuProprietaire->id, $baux($this->ecarter('suspendu', $this->proprietaire)), 'bailleur bloqué');
    }

    // --- P232.03 : les fils de bail et de bien ------------------------------------------------------

    /** @param list<User> $membres */
    private function fil(array $contexte, array $membres, ConversationType $type = ConversationType::Group): Conversation
    {
        $fil = Conversation::create([
            'type' => $type->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $this->admin->id,
        ] + $contexte);
        $fil->participants()->attach($this->admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        foreach ($membres as $membre) {
            $fil->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        }

        return $fil;
    }

    public function test_p232_03_l_agent_createur_suspendu_perd_les_fils_du_bail_et_du_bien_qu_il_a_saisis(): void
    {
        $filDuBail = $this->fil(['lease_id' => $this->bail->id, 'property_id' => $this->bien->id], [$this->agent, $this->tenant]);
        $filDuBien = $this->fil(['property_id' => $this->bien->id], [$this->agent, $this->tenant]);
        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allows($this->agent, $filDuBail), 'avant la suspension');

        $agent = $this->ecarter('suspendu');

        foreach (['bail' => $filDuBail, 'bien' => $filDuBien] as $nom => $fil) {
            $this->assertFalse($access->allows($agent, $fil->fresh()), "fil du {$nom} ouvert");
            $this->assertTrue($access->allows($this->tenant, $fil->fresh()), "le locataire garde le fil du {$nom}");
        }
        $this->assertSame(0, $access->participatingQuery($agent)->count(), 'fils listés');
        $this->actingAsApi($agent);
        $this->getJson("/api/conversations/{$filDuBail->id}/messages")->assertForbidden();
        $this->assertSame([], collect($this->getJson('/api/conversations')->assertOk()->json('data'))->pluck('id')->all());

        // L'avis des messages : `NotifyNewMessageJob` filtre par `branchesAllow`.
        foreach ([$filDuBail, $filDuBien] as $fil) {
            $message = Message::query()->create(['conversation_id' => $fil->id, 'sender_id' => $this->admin->id, 'content' => 'Relance']);
            (new NotifyNewMessageJob($message->id))->handle(app(NotificationService::class));
        }
        $this->assertSame(0, AppNotification::query()->where('user_id', $agent->id)->count(), 'avis reçu par l\'agent suspendu');
        $this->assertSame(2, AppNotification::query()->where('user_id', $this->tenant->id)->count(), 'avis du locataire');
    }

    /**
     * Le cas du retiré, mesuré (P232.03) : ses profils sont supprimés, `inactiveOnlyAgencyIds` ne le
     * voit plus, et c'est le retrait qui lui fait quitter (`left_at`) les groupes du bail et du bien
     * (TCK-1711, TCK-2021). Il n'y a plus ni accès, ni liste, ni avis.
     */
    public function test_p232_03_l_agent_createur_retire_a_quitte_les_fils_du_bail_et_du_bien(): void
    {
        $filDuBail = $this->fil(['lease_id' => $this->bail->id, 'property_id' => $this->bien->id], [$this->agent, $this->tenant]);
        $filDuBien = $this->fil(['property_id' => $this->bien->id], [$this->agent, $this->tenant]);

        $agent = $this->ecarter('retiré');

        $access = app(ConversationAccess::class);
        foreach ([$filDuBail, $filDuBien] as $fil) {
            $this->assertFalse($access->allows($agent, $fil->fresh()));
            $message = Message::query()->create(['conversation_id' => $fil->id, 'sender_id' => $this->admin->id, 'content' => 'Relance']);
            (new NotifyNewMessageJob($message->id))->handle(app(NotificationService::class));
        }
        $this->assertSame(0, $access->participatingQuery($agent)->count());
        $this->assertSame(0, AppNotification::query()->where('user_id', $agent->id)->count());
    }

    public function test_p232_03_le_bailleur_bloque_garde_les_fils_de_son_bail_et_de_son_bien(): void
    {
        $filDuBail = $this->fil(['lease_id' => $this->bailDuProprietaire->id, 'property_id' => $this->bailDuProprietaire->property_id], [$this->proprietaire]);
        $filDuBien = $this->fil(['property_id' => $this->bailDuProprietaire->property_id], [$this->proprietaire]);

        $bloque = $this->ecarter('suspendu', $this->proprietaire);

        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allows($bloque, $filDuBail->fresh()));
        $this->assertTrue($access->allows($bloque, $filDuBien->fresh()));
        $this->assertSame(2, $access->participatingQuery($bloque)->count());
    }
}
