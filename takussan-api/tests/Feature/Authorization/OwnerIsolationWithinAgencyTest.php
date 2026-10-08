<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\ContractType;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Guarantor;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §2) — à l'intérieur d'une agence, un bailleur ne voit et ne touche que ce qui
 * le désigne.
 *
 * Une agence, deux bailleurs B1 et B2 — chacun avec un profil `OwnerProfile` ACTIF dans l'agence,
 * c'est tout le point : avant ce ticket, `$user->agency_id === $model->agency_id` suffisait, et
 * l'agence d'un bailleur est celle de son profil. B1 possède un exemplaire de chacune des onze
 * ressources du §1 ; B2 doit recevoir 403 sur chacune et ne la trouver dans aucune liste, quand
 * l'agent de l'agence la lit.
 *
 * Les fixtures sont construites par profil explicite (`withOwnerProfile` / `withAgentProfile`),
 * jamais par `['agency_id' => X]` — qui fabrique un bailleur sous le nom d'un agent.
 */
class OwnerIsolationWithinAgencyTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $b1;

    private User $b2;

    private User $agent;

    private User $admin;

    /** @var array<string, Model> */
    private array $r = [];

    /** @var array<string, Model> */
    private array $r2 = [];

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->b1 = User::factory()->withOwnerProfile($this->agency)->create();
        $this->b2 = User::factory()->withOwnerProfile($this->agency)->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);

        $this->r = $this->resourcesOf($this->b1);
        $this->r2 = $this->resourcesOf($this->b2);
    }

    /** @return array<string, Model> */
    private function resourcesOf(User $landlord): array
    {
        $agencyId = $this->agency->id;

        $property = Property::factory()->create([
            'user_id' => $landlord->id,
            'agency_id' => $agencyId,
            'visibility' => PropertyVisibility::Private,
            ...self::RESERVABLE,
        ]);
        $customer = Customer::factory()->create(['agency_id' => $agencyId, 'added_by_id' => $landlord->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $customer->id,
            'agency_id' => $agencyId,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'status' => PaymentStatus::Pending,
        ]);
        // TCK-593 — une quittance ne se délivre que pour une échéance payée (422 sinon) : le jeu
        // « quittance » porte la sienne, pour éprouver l'isolation et non la garde d'impayé.
        $paidPayment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'created_by_id' => $landlord->id,
            'agency_id' => $agencyId,
            'status' => BookingStatus::Pending,
        ]);
        $payout = Payout::factory()->create([
            'landlord_id' => $landlord->id,
            'agency_id' => $agencyId,
            'issued_by_id' => $this->admin->id,
            'status' => PayoutStatus::Pending,
        ]);
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
            'issued_by_id' => $landlord->id,
            'agency_id' => $agencyId,
        ]);
        $document = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $landlord->id,
        ]);
        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'conducted_by' => $landlord->id,
            'tenant_id' => $customer->id,
            'status' => InventoryStatus::Draft,
        ]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
        ]);
        $guarantor = Guarantor::factory()->create(['added_by_id' => $landlord->id]);

        // Vérification adverse (verif-587, B3) — un document par type de rattachement : chaque
        // branche de `DocumentPolicy::attachTo()` a sa clause d'agence, et un seul document de
        // bien laissait les cinq autres rouvrir la fuite sans qu'aucun test rougisse. Déposés par
        // le bailleur, sauf celui de l'agence (KYC, statuts) : l'agent n'y est donc admis que par
        // la branche, jamais comme téléverseur.
        $attached = fn (Model $to, User $by): Document => Document::factory()->create([
            'documentable_id' => $to->getKey(),
            'documentable_type' => $to::class,
            'uploaded_by' => $by->id,
        ]);
        $leaseDocument = $attached($lease, $landlord);
        $bookingDocument = $attached($booking, $landlord);
        $customerDocument = $attached($customer, $landlord);
        $inventoryDocument = $attached($inventory, $landlord);
        $agencyDocument = $attached($this->agency, $this->admin);

        return compact(
            'property', 'customer', 'lease', 'payment', 'paidPayment', 'booking', 'payout',
            'invoice', 'document', 'inventory', 'visit', 'guarantor',
            'leaseDocument', 'bookingDocument', 'customerDocument', 'inventoryDocument', 'agencyDocument',
        );
    }

    private function uri(string $template): string
    {
        return preg_replace_callback('/\{(\w+)\}/', fn ($m) => (string) $this->r[$m[1]]->getKey(), $template);
    }

    /**
     * Lecture et écriture de chaque ressource du §1. Le dernier champ nomme le membre du personnel
     * qui doit y être admis : l'agent du rôle système partout, sauf la modification du bien d'un
     * autre, qui exige `properties.update_any` (AC4) — l'admin.
     *
     * @return array<string, array{string, string, array<string, mixed>, string}>
     */
    public static function gestes(): array
    {
        return [
            'bien — lire' => ['GET', '/api/properties/{property}', [], 'agent'],
            'bien — modifier' => ['PATCH', '/api/properties/{property}', ['title' => 'Renommé'], 'admin'],
            // verif-587 (M1) — l'agent relit la proposition d'un bailleur (brouillon privé) avant de
            // la publier : il doit en voir les photos. `viewMedia` exigeait `update`, donc `update_any`.
            'bien — médias' => ['GET', '/api/properties/{property}/media', [], 'agent'],
            'bail — lire' => ['GET', '/api/leases/{lease}', [], 'agent'],
            'bail — modifier' => ['PATCH', '/api/leases/{lease}', ['late_fee_grace_days' => 3], 'agent'],
            'loyer — marquer payé' => ['POST', '/api/lease-payments/{payment}/mark-paid', [], 'agent'],
            'versement — lire' => ['GET', '/api/payouts/{payout}', [], 'agent'],
            'versement — traiter' => ['POST', '/api/payouts/{payout}/mark-processed', [], 'agent'],
            'facture — lire' => ['GET', '/api/invoices/{invoice}', [], 'agent'],
            'facture — envoyer' => ['POST', '/api/invoices/{invoice}/send', [], 'agent'],
            'réservation — lire' => ['GET', '/api/bookings/{booking}', [], 'agent'],
            'document — lire' => ['GET', '/api/documents/{document}', [], 'agent'],
            'document (bail) — lire' => ['GET', '/api/documents/{leaseDocument}', [], 'agent'],
            'document (bail) — versions' => ['GET', '/api/documents/{leaseDocument}/versions', [], 'agent'],
            'document (réservation) — lire' => ['GET', '/api/documents/{bookingDocument}', [], 'agent'],
            'document (client) — lire' => ['GET', '/api/documents/{customerDocument}', [], 'agent'],
            'document (état des lieux) — lire' => ['GET', '/api/documents/{inventoryDocument}', [], 'agent'],
            'document (agence) — lire' => ['GET', '/api/documents/{agencyDocument}', [], 'agent'],
            'document (agence) — versions' => ['GET', '/api/documents/{agencyDocument}/versions', [], 'agent'],
            'état des lieux — lire' => ['GET', '/api/inventories/{inventory}', [], 'agent'],
            'état des lieux — modifier' => ['PATCH', '/api/inventories/{inventory}', ['notes' => 'relu'], 'agent'],
            'visite — lire' => ['GET', '/api/property-visits/{visit}', [], 'agent'],
            'visite — modifier' => ['PATCH', '/api/property-visits/{visit}', ['notes' => 'relu'], 'agent'],
            'client — lire' => ['GET', '/api/customers/{customer}', [], 'agent'],
            'client — modifier' => ['PATCH', '/api/customers/{customer}', ['occupation' => 'Juriste'], 'agent'],
            'garant — lire' => ['GET', '/api/guarantors/{guarantor}', [], 'agent'],
            'garant — modifier' => ['PUT', '/api/guarantors/{guarantor}', ['occupation' => 'Juriste'], 'agent'],
        ];
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('gestes')]
    public function test_un_autre_bailleur_de_l_agence_est_refuse(string $method, string $template, array $body, string $staff): void
    {
        $this->actingAsApi($this->b2)
            ->json($method, $this->uri($template), $body)
            ->assertForbidden();
    }

    /** Supprimer un document est réservé à son téléverseur, quel que soit son rattachement. */
    public function test_un_autre_bailleur_ne_supprime_aucun_document_de_b1(): void
    {
        foreach (['document', 'leaseDocument', 'bookingDocument', 'customerDocument', 'inventoryDocument', 'agencyDocument'] as $key) {
            $this->actingAsApi($this->b2)
                ->deleteJson("/api/documents/{$this->r[$key]->getKey()}")
                ->assertForbidden();
            $this->assertModelExists($this->r[$key]);
        }
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('gestes')]
    public function test_le_personnel_de_l_agence_est_admis(string $method, string $template, array $body, string $staff): void
    {
        $this->actingAsApi($staff === 'admin' ? $this->admin : $this->agent)
            ->json($method, $this->uri($template), $body)
            ->assertSuccessful();
    }

    /**
     * Les listes. B2 y trouve ses propres ressources (sans quoi l'absence de celles de B1 ne
     * prouverait rien : une liste vide est aussi « sans B1 »), jamais celles de B1 ; l'agent y
     * trouve celles de B1.
     *
     * @return array<string, array{string, string}>
     */
    public static function listes(): array
    {
        return [
            'biens' => ['/api/properties?per_page=100', 'property'],
            'baux' => ['/api/leases?per_page=100', 'lease'],
            'versements' => ['/api/payouts?per_page=100', 'payout'],
            'factures' => ['/api/invoices?per_page=100', 'invoice'],
            'réservations' => ['/api/bookings?per_page=100', 'booking'],
            'états des lieux' => ['/api/inventories?per_page=100', 'inventory'],
            'visites' => ['/api/property-visits?per_page=100', 'visit'],
            'clients' => ['/api/customers?per_page=100', 'customer'],
        ];
    }

    #[DataProvider('listes')]
    public function test_les_listes_d_un_bailleur_ne_portent_que_ses_ressources(string $uri, string $key): void
    {
        $ids = $this->idsOf($this->actingAsApi($this->b2)->getJson($uri)->assertOk()->json('data'));

        $this->assertNotContains($this->r[$key]->getKey(), $ids, "{$key} de B1 visible par B2");
        $this->assertContains($this->r2[$key]->getKey(), $ids, "{$key} de B2 absent de sa propre liste");
    }

    /**
     * La liste des visites n'a jamais porté de périmètre d'agence (`PropertyVisitController::index` :
     * visiteur, agent assigné, propriétaire, client) — le personnel n'y voit que ce qui le désigne.
     * Ce n'est pas une fuite et ce ticket ne l'ouvre pas ; elle est absente d'ici, pas de la liste
     * du bailleur ci-dessus.
     *
     * @return array<string, array{string, string}>
     */
    public static function listesDuPersonnel(): array
    {
        return array_diff_key(self::listes(), ['visites' => true]);
    }

    #[DataProvider('listesDuPersonnel')]
    public function test_les_listes_du_personnel_portent_celles_de_l_agence(string $uri, string $key): void
    {
        $ids = $this->idsOf($this->actingAsApi($this->agent)->getJson($uri)->assertOk()->json('data'));

        $this->assertContains($this->r[$key]->getKey(), $ids);
        $this->assertContains($this->r2[$key]->getKey(), $ids);
    }

    /**
     * AC1b — les chemins qui jugeaient hors policy (helpers de contrôleur, requêtes, services).
     *
     * @return array<string, array{string, string, array<string, mixed>}>
     */
    public static function cheminsHorsPolicy(): array
    {
        return [
            'loyers d\'un bail — lister' => ['GET', '/api/leases/{lease}/payments', []],
            'loyers d\'un bail — encaisser' => ['POST', '/api/leases/{lease}/payments', [
                'amount' => 400000,
                'payment_type' => 'rent',
                'period_start' => '2026-01-01',
                'period_end' => '2026-01-31',
                'due_date' => '2026-01-05',
            ]],
            'paiements d\'une réservation' => ['GET', '/api/bookings/{booking}/payments', []],
            'partage d\'un document' => ['POST', '/api/documents/{document}/share', []],
            'quittance' => ['GET', '/api/leases/{lease}/receipts/{paidPayment}/pdf', []],
            'contrat de bail' => ['GET', '/api/leases/{lease}/contract/pdf', []],
            'facture PDF' => ['GET', '/api/invoices/{invoice}/pdf', []],
        ];
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('cheminsHorsPolicy')]
    public function test_hors_policy_un_autre_bailleur_est_refuse(string $method, string $template, array $body): void
    {
        $this->actingAsApi($this->b2)
            ->json($method, $this->uri($template), $this->withExpiry($template, $body))
            ->assertForbidden();
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('cheminsHorsPolicy')]
    public function test_hors_policy_le_personnel_est_admis(string $method, string $template, array $body): void
    {
        $this->actingAsApi($this->agent)
            ->json($method, $this->uri($template), $this->withExpiry($template, $body))
            ->assertSuccessful();
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    private function withExpiry(string $template, array $body): array
    {
        // Une date ne se fige pas dans un fournisseur de données statique.
        return str_ends_with($template, '/share')
            ? ['expires_at' => now()->addDays(7)->toDateTimeString()]
            : $body;
    }

    public function test_le_contexte_de_conversation_ne_rend_au_bailleur_que_ses_baux_et_biens(): void
    {
        $this->actingAsApi($this->b2);

        $leases = $this->idsOf($this->getJson('/api/conversations/context/leases')->assertOk()->json('data'));
        $properties = $this->idsOf($this->getJson('/api/conversations/context/properties')->assertOk()->json('data'));

        // Ensemble attendu, pas une longueur : exactement les siens.
        $this->assertSame([$this->r2['lease']->id], $leases);
        $this->assertSame([$this->r2['property']->id], $properties);

        $this->actingAsApi($this->agent);
        $agentLeases = $this->idsOf($this->getJson('/api/conversations/context/leases')->assertOk()->json('data'));
        $this->assertContains($this->r['lease']->id, $agentLeases);
    }

    // ─── AC1c — créer un bail sur le bien d'un autre ─────────────

    /** @return array<string, mixed> */
    private function leasePayload(Customer $tenant): array
    {
        return [
            'property_id' => $this->r['property']->id,
            'tenant_id' => $tenant->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 400000,
            'deposit_amount' => 800000,
            'currency' => 'XOF',
            'payment_day' => 5,
        ];
    }

    public function test_un_autre_bailleur_ne_cree_pas_de_bail_sur_le_bien_de_b1(): void
    {
        $this->actingAsApi($this->b2)
            ->postJson('/api/leases', $this->leasePayload($this->r2['customer']))
            ->assertForbidden();
    }

    /**
     * Le prédicat, pas la capacité seule : une agence peut donner `leases.create` au rôle de ses
     * bailleurs, et ce bailleur ne crée pas pour autant un bail sur le bien d'un AUTRE — c'est ce
     * cas que `$user->agency_id === $property->agency_id` laissait passer, la capacité en plus.
     */
    public function test_un_bailleur_tenant_leases_create_ne_cree_pas_de_bail_sur_le_bien_d_un_autre(): void
    {
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Owner)
            ->withCapabilities([Capability::PropertiesUpdateOwn, Capability::LeasesCreate])
            ->create(['agency_id' => $this->agency->id]);
        OwnerProfile::query()
            ->where('user_id', $this->b2->id)
            ->update(['agency_role_id' => $role->id]);

        $this->actingAsApi($this->b2->fresh())
            ->postJson('/api/leases', $this->leasePayload($this->r2['customer']))
            ->assertForbidden();
    }

    public function test_un_agent_sans_leases_create_ne_cree_pas_de_bail(): void
    {
        $this->actingAsApi($this->agentWithout($this->agency, Capability::LeasesCreate))
            ->postJson('/api/leases', $this->leasePayload($this->r['customer']))
            ->assertForbidden();
    }

    public function test_le_bailleur_du_bien_et_l_agent_du_role_systeme_creent_le_bail(): void
    {
        $this->actingAsApi($this->b1)
            ->postJson('/api/leases', $this->leasePayload($this->r['customer']))
            ->assertCreated();

        $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->leasePayload($this->r['customer']))
            ->assertCreated();
    }

    // ─── AC1e — rattacher le client ou le garant d'un autre à son bail ─────────────

    /**
     * Ajouté après vérification adverse (verif-587, B2). `StoreLeaseRequest` ne valide `tenant_id`
     * et `guarantor_id` que par `exists:` : B1 rattachait à SON bail le client ou le garant de
     * n'importe qui — de B2, ou d'une autre agence — puis lisait sa fiche par
     * `GET /api/leases/{id}?include=tenant` et `GET /api/leases/{id}/guarantors`. Même classe de
     * défaut qu'AC1d (`BookingService`, `customer_id` d'un tiers).
     *
     * @return array{customer: Customer, guarantor: Guarantor}
     */
    private function foreignAgencyContacts(): array
    {
        $other = Agency::factory()->create();
        $foreignAgent = User::factory()->withAgentProfile($other)->create();

        return [
            'customer' => Customer::factory()->create(['agency_id' => $other->id, 'added_by_id' => $foreignAgent->id]),
            'guarantor' => Guarantor::factory()->create(['added_by_id' => $foreignAgent->id]),
        ];
    }

    public function test_un_bailleur_ne_cree_pas_de_bail_au_nom_du_client_d_un_autre(): void
    {
        $before = Lease::query()->count();

        $this->actingAsApi($this->b1)
            ->postJson('/api/leases', $this->leasePayload($this->r2['customer']))
            ->assertForbidden();
        $this->actingAsApi($this->b1)
            ->postJson('/api/leases', $this->leasePayload($this->foreignAgencyContacts()['customer']))
            ->assertForbidden();

        $this->assertSame($before, Lease::query()->count());
    }

    public function test_un_bailleur_ne_cree_pas_de_bail_avec_le_garant_d_un_autre(): void
    {
        $this->actingAsApi($this->b1)
            ->postJson('/api/leases', $this->leasePayload($this->r['customer']) + ['guarantor_id' => $this->r2['guarantor']->id])
            ->assertForbidden();
        $this->actingAsApi($this->b1)
            ->postJson('/api/leases', $this->leasePayload($this->r['customer']) + ['guarantor_id' => $this->foreignAgencyContacts()['guarantor']->id])
            ->assertForbidden();
    }

    public function test_un_bailleur_n_attache_pas_le_garant_d_un_autre_a_son_bail(): void
    {
        $uri = "/api/leases/{$this->r['lease']->id}/guarantors";

        $this->actingAsApi($this->b1)->postJson($uri, ['guarantor_id' => $this->r2['guarantor']->id])->assertForbidden();
        $this->actingAsApi($this->b1)->postJson($uri, ['guarantor_id' => $this->foreignAgencyContacts()['guarantor']->id])->assertForbidden();

        $this->assertSame(0, $this->r['lease']->guarantors()->count());
    }

    public function test_le_bailleur_et_le_personnel_rattachent_les_contacts_qu_ils_lisent(): void
    {
        $this->actingAsApi($this->b1)
            ->postJson('/api/leases', $this->leasePayload($this->r['customer']) + ['guarantor_id' => $this->r['guarantor']->id])
            ->assertCreated();
        $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->leasePayload($this->r['customer']) + ['guarantor_id' => $this->r['guarantor']->id])
            ->assertCreated();

        $uri = "/api/leases/{$this->r['lease']->id}/guarantors";
        $this->actingAsApi($this->b1)->postJson($uri, ['guarantor_id' => $this->r['guarantor']->id])->assertCreated();
        $this->actingAsApi($this->agent)->postJson($uri, ['guarantor_id' => $this->r2['guarantor']->id])->assertCreated();
    }

    // ─── AC1d — réserver le bien d'un autre bailleur ─────────────

    /**
     * Un bien RÉSERVABLE : la fabrique tire `rent_period` au hasard, et un bien loué au mois ou à
     * l'année est refusé en 422 (`rent_period_not_bookable`) avant toute question d'autorisation —
     * le test rougissait une fois sur deux, sans rapport avec ce qu'il éprouve.
     */
    private const RESERVABLE = ['contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Daily];

    /** @return array<string, mixed> */
    private function bookingPayload(Property $property, array $extra = []): array
    {
        return array_merge([
            'property_id' => $property->id,
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
        ], $extra);
    }

    public function test_un_autre_bailleur_ne_reserve_pas_le_bien_prive_de_b1(): void
    {
        $this->actingAsApi($this->b2)
            ->postJson('/api/bookings', $this->bookingPayload($this->r['property']))
            ->assertForbidden();
    }

    public function test_sur_un_bien_public_l_autre_bailleur_reserve_en_son_nom_de_client(): void
    {
        $public = Property::factory()->create([
            'user_id' => $this->b1->id,
            'agency_id' => $this->agency->id,
            'visibility' => PropertyVisibility::Public,
            ...self::RESERVABLE,
        ]);

        $customerId = $this->actingAsApi($this->b2)
            ->postJson('/api/bookings', $this->bookingPayload($public))
            ->assertCreated()
            ->json('data.customer_id');

        $this->assertNotNull($customerId);
        $this->assertSame(
            Customer::query()->where('user_id', $this->b2->id)->value('id'),
            $customerId,
        );
    }

    public function test_l_autre_bailleur_ne_reserve_pas_au_nom_d_un_client_du_personnel(): void
    {
        $public = Property::factory()->create([
            'user_id' => $this->b1->id,
            'agency_id' => $this->agency->id,
            'visibility' => PropertyVisibility::Public,
            ...self::RESERVABLE,
        ]);
        $client = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);

        $this->actingAsApi($this->b2)
            ->postJson('/api/bookings', $this->bookingPayload($public, ['customer_id' => $client->id]))
            ->assertForbidden();
    }

    public function test_l_agent_reserve_le_bien_prive(): void
    {
        $this->actingAsApi($this->agent)
            ->postJson('/api/bookings', $this->bookingPayload($this->r['property'], ['customer_id' => $this->r['customer']->id]))
            ->assertCreated();
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $rows
     * @return list<int>
     */
    private function idsOf(?array $rows): array
    {
        $ids = array_map(static fn (array $row): int => (int) $row['id'], $rows ?? []);
        sort($ids);

        return $ids;
    }
}
