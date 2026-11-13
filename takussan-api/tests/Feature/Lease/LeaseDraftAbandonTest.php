<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Guarantor;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Model\InventoryService;
use App\Services\Model\LeaseService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2764 — abandonner un brouillon de bail jamais envoyé en signature (décision du porteur du
 * 2026-11-12 : suppression douce). Le brouillon cesse d'occuper le bien (`BookingService::bauxQuiOccupent`
 * part de `Lease::query()`, qui écarte les lignes supprimées), sans rien effacer d'autre ni rouvrir ou
 * fermer aucune candidature.
 *
 * Fixture du ticket : un bien P, une candidature A `confirmed` (client CA), un brouillon L tiré de A
 * (`booking_id = A`), et une candidature B `pending` (client CB) dont le début demandé est couvert par L.
 */
class LeaseDraftAbandonTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $bien;

    private Customer $clientA;

    private Booking $candidatureA;

    private Booking $candidatureB;

    private Lease $brouillon;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agence = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agence);
        $this->bien = Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 250_000,
        ]);
        $this->clientA = Customer::factory()->create(['agency_id' => $this->agence->id]);
        $this->candidatureA = $this->candidature($this->clientA, BookingStatus::Confirmed);
        $this->candidatureB = $this->candidature(Customer::factory()->create(['agency_id' => $this->agence->id]), BookingStatus::Pending);
        $this->brouillon = $this->bailDuBien($this->bien, LeaseStatus::Draft, ['booking_id' => $this->candidatureA->id, 'tenant_id' => $this->clientA->id]);
    }

    private function candidature(Customer $client, BookingStatus $statut): Booking
    {
        return Booking::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'customer_id' => $client->id,
            'kind' => BookingKind::Application,
            'status' => $statut,
            'start_date' => now()->addDays(60)->toDateString(),
            'end_date' => now()->addDays(425)->toDateString(),
        ]);
    }

    /** @param  array<string, mixed>  $attributs */
    private function bailDuBien(Property $bien, LeaseStatus $statut, array $attributs = []): Lease
    {
        return Lease::factory()->create($attributs + [
            'property_id' => $bien->id,
            'landlord_id' => $bien->user_id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $bien->agency_id])->id,
            'agency_id' => $bien->agency_id,
            'status' => $statut,
            'start_date' => now()->addDays(30)->toDateString(),
            'end_date' => now()->addDays(395)->toDateString(),
        ]);
    }

    private function abandonner(Lease $bail, ?User $par = null, array $corps = []): TestResponse
    {
        return $this->actingAsApi($par ?? $this->agent)->deleteJson("/api/leases/{$bail->id}", $corps);
    }

    private function confirmer(Booking $candidature): TestResponse
    {
        return $this->actingAsApi($this->agent)->postJson("/api/bookings/{$candidature->id}/confirm");
    }

    /**
     * AC1 — la prémisse, verte sur le code d'avant le ticket. ⚠ Le ticket l'écrit avec A `confirmed` ;
     * `confirm()` juge « une seule candidature acceptée » (TCK-2734) AVANT le bail qui occupe (TCK-2747),
     * et répondrait donc `application_already_accepted`. Le brouillon se voit seul quand A est close :
     * c'est l'état où il bloque B « sans limite de temps ».
     */
    public function test_ac1_avant_l_abandon_le_brouillon_bloque_la_candidature_b(): void
    {
        $this->confirmer($this->candidatureB)->assertStatus(409)->assertJsonPath('code', 'booking.application_already_accepted');

        $this->candidatureA->update(['status' => BookingStatus::Cancelled]);
        $this->confirmer($this->candidatureB)->assertStatus(409)->assertJsonPath('code', 'booking.property_already_leased');
        $this->assertSame(BookingStatus::Pending, $this->candidatureB->refresh()->status);
    }

    /** AC2 — l'abandon débloque le bien. */
    public function test_ac2_l_abandon_retire_le_brouillon_et_debloque_le_bien(): void
    {
        $this->abandonner($this->brouillon, corps: ['reason' => 'Le candidat se désiste'])
            ->assertOk()
            ->assertJsonPath('data.id', $this->brouillon->id)
            ->assertJsonPath('data.origin_booking', ['id' => $this->candidatureA->id, 'status' => 'confirmed']);

        $this->assertSoftDeleted('leases', ['id' => $this->brouillon->id]);
        $this->getJson("/api/leases/{$this->brouillon->id}")->assertNotFound();
        $this->assertNotContains($this->brouillon->id, array_column($this->getJson('/api/leases')->assertOk()->json('data'), 'id'));
        $this->assertSame(0, $this->getJson('/api/leases/summary')->assertOk()->json('data.draft'));

        // A reste acceptée : la règle « une seule acceptée » (TCK-2734) parle, plus le bail.
        $this->confirmer($this->candidatureB)->assertStatus(409)->assertJsonPath('code', 'booking.application_already_accepted');
        // A fermée par son propre geste, B passe.
        $this->actingAsApi($this->agent)->postJson("/api/bookings/{$this->candidatureA->id}/cancel")->assertOk();
        $this->confirmer($this->candidatureB)->assertOk();
        $this->assertSame(BookingStatus::Confirmed, $this->candidatureB->refresh()->status);
    }

    /** AC2 — `abandoned_at` est un instant ISO 8601 (ADR-0018). */
    public function test_ac2_abandoned_at_est_l_instant_de_la_suppression(): void
    {
        $this->travelTo('2026-11-13 09:30:00');

        $this->abandonner($this->brouillon)->assertOk()->assertJsonPath('data.abandoned_at', '2026-11-13T09:30:00+00:00');
    }

    /** AC3 — aucune candidature ne bouge, aucun avis ne part. */
    public function test_ac3_aucune_candidature_ne_bouge(): void
    {
        $this->abandonner($this->brouillon)->assertOk();

        $this->assertSame(BookingStatus::Confirmed, $this->candidatureA->refresh()->status);
        $this->assertSame(BookingStatus::Pending, $this->candidatureB->refresh()->status);
        Notification::assertNothingSent();
    }

    /** AC4 — `draft` seulement : la ligne est inchangée et rien n'est journalisé. */
    public function test_ac4_un_bail_qui_n_est_pas_un_brouillon_ne_s_abandonne_pas(): void
    {
        foreach ([LeaseStatus::PendingSignature, LeaseStatus::Active, LeaseStatus::Terminating, LeaseStatus::Terminated] as $statut) {
            $bail = $this->bailDuBien($this->bien, $statut);
            $avant = $bail->fresh()->getAttributes();

            $this->abandonner($bail)->assertStatus(422)->assertJsonPath('code', 'lease.not_draft_abandon');

            $this->assertSame($avant, $bail->fresh()->getAttributes(), $statut->value);
        }
        $this->assertSame(0, Activity::query()->where('event', 'lease_draft_abandoned')->count());
    }

    /** AC5 — de l'argent saisi ne disparaît pas avec un brouillon. */
    public function test_ac5_une_echeance_non_annulee_refuse_l_abandon(): void
    {
        $caution = LeasePayment::factory()->create([
            'lease_id' => $this->brouillon->id,
            'payment_type' => LeasePaymentType::Deposit,
            'status' => PaymentStatus::Pending,
        ]);

        $this->abandonner($this->brouillon)->assertStatus(422)->assertJsonPath('code', 'lease.abandon_has_payments');
        $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);

        $caution->update(['status' => PaymentStatus::Cancelled]);
        $this->abandonner($this->brouillon)->assertOk();
    }

    /** AC5 — de tout type : un loyer saisi bloque aussi. */
    public function test_ac5_une_echeance_de_loyer_bloque_aussi(): void
    {
        LeasePayment::factory()->create([
            'lease_id' => $this->brouillon->id,
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Paid,
        ]);

        $this->abandonner($this->brouillon)->assertStatus(422)->assertJsonPath('code', 'lease.abandon_has_payments');
    }

    /** AC6 — qui : la règle de `LeasePolicy::update`. */
    public function test_ac6_le_personnel_de_l_agence_et_le_bailleur_particulier_abandonnent(): void
    {
        $this->abandonner($this->brouillon, $this->agencyAdmin($this->agence))->assertOk();

        $bailleur = User::factory()->create();
        $sansAgence = Property::factory()->create(['agency_id' => null, 'user_id' => $bailleur->id, 'contract_type' => ContractType::Rent]);
        $bail = $this->bailDuBien($sansAgence, LeaseStatus::Draft, ['landlord_id' => $bailleur->id]);
        $this->abandonner($bail, $bailleur)->assertOk();
    }

    public function test_ac6_ni_une_autre_agence_ni_le_locataire_ni_un_bailleur_bloque(): void
    {
        $autreAgence = $this->agencyAgent(Agency::factory()->create());
        $locataire = User::factory()->create();
        $this->clientA->update(['user_id' => $locataire->id]);
        $bloque = User::factory()->withOwnerProfile($this->agence)->create();
        OwnerProfile::query()->where('user_id', $bloque->id)->update(['status' => OwnerProfileStatus::Blocked->value]);
        $deBloque = $this->bailDuBien($this->bien, LeaseStatus::Draft, ['landlord_id' => $bloque->id]);

        $this->abandonner($this->brouillon, $autreAgence)->assertForbidden();
        $this->abandonner($this->brouillon, $locataire)->assertForbidden();
        $this->abandonner($deBloque, $bloque)->assertForbidden();
        $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);
        $this->assertNotSoftDeleted('leases', ['id' => $deBloque->id]);
    }

    /** AC7 — ce qui reste : garants, documents, candidature d'origine, le journal et la ligne. */
    public function test_ac7_rien_d_autre_n_est_efface_et_le_journal_garde_le_motif(): void
    {
        $garant = Guarantor::factory()->create(['agency_id' => $this->agence->id]);
        $this->brouillon->guarantors()->attach($garant->id);
        $televerseur = $this->agencyAgent($this->agence);
        $document = Document::factory()->create([
            'documentable_type' => Lease::class,
            'documentable_id' => $this->brouillon->id,
            'uploaded_by' => $televerseur->id,
        ]);
        $this->actingAsApi($this->agent)->getJson("/api/documents/{$document->id}")->assertOk();

        $this->abandonner($this->brouillon, corps: ['reason' => 'Le candidat se désiste'])->assertOk();

        $relu = Lease::withTrashed()->findOrFail($this->brouillon->id);
        $this->assertSame(LeaseStatus::Draft, $relu->status);
        $this->assertSame($this->candidatureA->id, $relu->booking_id);
        $this->assertSame([$garant->id], $relu->guarantors()->pluck('guarantors.id')->all());
        $this->assertNotNull(Document::query()->find($document->id));
        $this->assertSame(BookingStatus::Confirmed, $this->candidatureA->refresh()->status);

        $journal = Activity::query()->where('event', 'lease_draft_abandoned')->sole();
        $this->assertSame('Lease', $journal->log_name);
        $this->assertSame($this->agent->id, (int) $journal->causer_id);
        // `assertEquals` : jsonb ne garde pas l'ordre des clés.
        $this->assertEquals([
            'lease_id' => $this->brouillon->id,
            'property_id' => $this->bien->id,
            'booking_id' => $this->candidatureA->id,
            'reason' => 'Le candidat se désiste',
        ], collect($journal->properties)->only(['lease_id', 'property_id', 'booking_id', 'reason'])->all());

        // Le document ne se lit plus que par son téléverseur : le porteur supprimé n'est plus atteint.
        $this->actingAsApi($televerseur)->getJson("/api/documents/{$document->id}")->assertOk();
        $this->actingAsApi($this->agent)->getJson("/api/documents/{$document->id}")->assertForbidden();
    }

    /**
     * AC8 — la course, dans ses deux ordres : l'abandon et la demande de signature prennent le bien puis
     * le bail (`LeaseService::verrouillerLeBienPuisLeBail`) ; le second relit la ligne et échoue proprement.
     */
    public function test_ac8_une_signature_demandee_apres_l_abandon_ne_trouve_plus_le_bail(): void
    {
        $this->abandonner($this->brouillon)->assertOk();

        $this->actingAsApi($this->agent)->postJson("/api/leases/{$this->brouillon->id}/signature-request")->assertNotFound();
        $this->assertSame(LeaseStatus::Draft, Lease::withTrashed()->findOrFail($this->brouillon->id)->status);
    }

    /**
     * AC8 — l'ordre des verrous (`takussan-api/CLAUDE.md`, piège n° 10) : le bien, puis le bail, et rien
     * n'est écrit avant. Épinglé par `DB::listen` : les deux ordres séquentiels ci-dessus restent verts
     * sans aucun verrou.
     */
    public function test_ac8_l_abandon_prend_le_bien_puis_le_bail_avant_d_ecrire(): void
    {
        $journal = [];
        DB::listen(function ($q) use (&$journal): void {
            if (preg_match('/from "(properties|leases)" where .* for update/', $q->sql, $m) === 1) {
                $journal[] = 'verrou '.$m[1];
            } elseif (preg_match('/^update "leases"/', $q->sql) === 1) {
                $journal[] = 'écriture leases';
            }
        });

        $this->abandonner($this->brouillon)->assertOk();

        $this->assertSame(['verrou properties', 'verrou leases', 'écriture leases'], $journal);
    }

    public function test_ac8_un_abandon_apres_l_envoi_en_signature_est_refuse(): void
    {
        $this->brouillon->update(['status' => LeaseStatus::PendingSignature]);

        $this->abandonner($this->brouillon)->assertStatus(422)->assertJsonPath('code', 'lease.not_draft_abandon');
        $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);
    }

    /**
     * AC8 — le statut se juge sur la ligne RELUE sous verrou, pas sur l'instance de l'appelant : une
     * demande de signature passée entre la lecture et l'abandon laisse un bail `pending_signature`, que
     * l'abandon refuse.
     */
    public function test_ac8_le_statut_se_juge_sur_la_ligne_relue_sous_verrou(): void
    {
        $perime = Lease::query()->findOrFail($this->brouillon->id);
        Lease::query()->whereKey($this->brouillon->id)->toBase()->update(['status' => LeaseStatus::PendingSignature->value]);

        try {
            app(LeaseService::class)->abandonDraft($perime, $this->agent);
            $this->fail('un bail envoyé en signature ne s\'abandonne pas');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);
    }

    public function test_le_motif_est_borne_a_500_caracteres(): void
    {
        $this->abandonner($this->brouillon, corps: ['reason' => str_repeat('x', 501)])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);
    }

    /** La fiche dit à l'écran qui peut abandonner : `abilities.abandon`, la règle de la policy. */
    public function test_la_fiche_sert_l_ability_et_la_candidature_d_origine(): void
    {
        $this->actingAsApi($this->agent)->getJson("/api/leases/{$this->brouillon->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.abandon', true)
            ->assertJsonPath('data.origin_booking', ['id' => $this->candidatureA->id, 'status' => 'confirmed']);

        $locataire = User::factory()->create();
        $this->clientA->update(['user_id' => $locataire->id]);
        $fiche = $this->actingAsApi($locataire)->getJson("/api/leases/{$this->brouillon->id}")->assertOk()->json('data');
        $this->assertFalse($fiche['abilities']['abandon']);
        $this->assertArrayNotHasKey('origin_booking', $fiche);

        // Hors d'un brouillon, l'action n'est pas offerte — mais l'API répond 422, pas 403 (AC4).
        $this->brouillon->update(['status' => LeaseStatus::PendingSignature]);
        $this->actingAsApi($this->agent)->getJson("/api/leases/{$this->brouillon->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.abandon', false)
            ->assertJsonMissingPath('data.origin_booking');
    }

    /** @param  array<string, mixed>  $attributs */
    private function etatDesLieux(InventoryStatus $statut, array $attributs = [], ?Lease $bail = null): Inventory
    {
        $bail ??= $this->brouillon;

        return Inventory::factory()->create($attributs + [
            'lease_id' => $bail->id,
            'property_id' => $bail->property_id,
            'tenant_id' => $bail->tenant_id,
            'type' => InventoryType::MoveIn,
            'status' => $statut,
            'tenant_signed' => false,
            'owner_signed' => false,
            'tenant_signed_at' => null,
            'owner_signed_at' => null,
            'signed_at' => null,
        ]);
    }

    /**
     * Les états des lieux ENGAGÉS (`Inventory::engage()`) : sortis du brouillon, ou portant une
     * signature, quelle qu'elle soit — un brouillon signé n'existe pas par l'API, mais la règle ne s'en
     * remet pas à cette absence.
     *
     * @return array<string, array{InventoryStatus, array<string, mixed>}>
     */
    private static function etatsEngages(): array
    {
        return [
            'envoyé en signature' => [InventoryStatus::PendingSignature, []],
            'signé' => [InventoryStatus::Signed, ['tenant_signed' => true, 'owner_signed' => true, 'signed_at' => now()]],
            'contesté' => [InventoryStatus::Disputed, []],
            'brouillon signé du locataire' => [InventoryStatus::Draft, ['tenant_signed' => true]],
            'brouillon signé du bailleur' => [InventoryStatus::Draft, ['owner_signed' => true]],
            'brouillon horodaté côté locataire' => [InventoryStatus::Draft, ['tenant_signed_at' => now()]],
            'brouillon horodaté côté bailleur' => [InventoryStatus::Draft, ['owner_signed_at' => now()]],
            'brouillon clos' => [InventoryStatus::Draft, ['signed_at' => now()]],
        ];
    }

    /**
     * TCK-2764 4a (décision du porteur du 2026-11-13, qui assouplit la réserve r1 de la vérification
     * d'ace044c18) — un état des lieux ENGAGÉ refuse l'abandon : il a engagé quelqu'un, il ne disparaît
     * pas avec un brouillon. Rien ne bouge, ni le bail ni l'état des lieux, et aucun journal n'est écrit.
     */
    public function test_4a_un_etat_des_lieux_engage_refuse_l_abandon(): void
    {
        foreach (self::etatsEngages() as $cas => [$statut, $attributs]) {
            $edl = $this->etatDesLieux($statut, $attributs);

            $this->abandonner($this->brouillon)->assertStatus(422)->assertJsonPath('code', 'lease.abandon_has_inventory');
            $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);
            $this->assertNotSoftDeleted('inventories', ['id' => $edl->id]);

            $edl->forceDelete();
        }
        $this->assertSame(0, Activity::query()->where('event', 'lease_draft_abandoned')->count());
    }

    /**
     * 4a — des brouillons d'état des lieux jamais signés partent avec le bail, en suppression douce : ils
     * ne restent pas sans bail dans la liste, et se relisent par `withTrashed`. Celui d'un autre bail ne
     * bouge pas ; le journal nomme ceux qui sont partis.
     */
    public function test_4a_les_brouillons_d_etat_des_lieux_partent_avec_le_bail(): void
    {
        $entree = $this->etatDesLieux(InventoryStatus::Draft);
        $sortie = $this->etatDesLieux(InventoryStatus::Draft, ['type' => InventoryType::MoveOut]);
        $autreBail = $this->bailDuBien($this->bien, LeaseStatus::Draft);
        $voisin = $this->etatDesLieux(InventoryStatus::Draft, [], $autreBail);

        $this->abandonner($this->brouillon)->assertOk();

        $this->assertSoftDeleted('leases', ['id' => $this->brouillon->id]);
        $this->assertSoftDeleted('inventories', ['id' => $entree->id]);
        $this->assertSoftDeleted('inventories', ['id' => $sortie->id]);
        $this->assertNotSoftDeleted('inventories', ['id' => $voisin->id]);
        $this->assertSame(InventoryStatus::Draft, Inventory::withTrashed()->findOrFail($entree->id)->status);

        $this->actingAsApi($this->agent)->getJson("/api/inventories/{$entree->id}")->assertNotFound();
        $listes = collect($this->actingAsApi($this->agent)->getJson('/api/inventories')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$voisin->id], $listes);

        $journal = Activity::query()->where('event', 'lease_draft_abandoned')->sole();
        $this->assertEqualsCanonicalizing([$entree->id, $sortie->id], $journal->properties['inventory_ids']);
    }

    /** 4a — tout ou rien : un brouillon et un état des lieux engagé, rien ne part. */
    public function test_4a_un_seul_etat_des_lieux_engage_retient_aussi_les_brouillons(): void
    {
        $brouillon = $this->etatDesLieux(InventoryStatus::Draft);
        $envoye = $this->etatDesLieux(InventoryStatus::PendingSignature, ['type' => InventoryType::MoveOut]);

        $this->abandonner($this->brouillon)->assertStatus(422)->assertJsonPath('code', 'lease.abandon_has_inventory');

        $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);
        $this->assertNotSoftDeleted('inventories', ['id' => $brouillon->id]);
        $this->assertNotSoftDeleted('inventories', ['id' => $envoye->id]);
    }

    /**
     * 4a — l'engagement se juge sur la ligne RELUE sous verrou : un état des lieux envoyé en signature
     * entre la lecture de l'appelant et l'abandon retient le bail.
     */
    public function test_4a_l_etat_des_lieux_se_juge_sur_la_ligne_relue(): void
    {
        $edl = $this->etatDesLieux(InventoryStatus::Draft);
        $perime = Lease::query()->with('inventories')->findOrFail($this->brouillon->id);
        Inventory::query()->whereKey($edl->id)->toBase()->update(['status' => InventoryStatus::PendingSignature->value]);

        try {
            app(LeaseService::class)->abandonDraft($perime, $this->agent);
            $this->fail('un état des lieux envoyé en signature retient le brouillon');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertNotSoftDeleted('inventories', ['id' => $edl->id]);
    }

    /**
     * 4a — l'ordre des verrous (piège n° 10) : le bien, le bail, puis les états des lieux, et rien n'est
     * écrit avant. Tout écrivain d'un état des lieux prend sa ligne (`InventoryService::underLock`,
     * `InventorySignatureService::sign`) : sous ce verrou, un envoi ou une signature concurrents passent
     * avant l'abandon (422) ou après (404, la ligne est supprimée).
     */
    public function test_4a_l_abandon_verrouille_les_etats_des_lieux_avant_de_les_supprimer(): void
    {
        $this->etatDesLieux(InventoryStatus::Draft);
        $journal = [];
        DB::listen(function ($q) use (&$journal): void {
            if (preg_match('/from "(properties|leases|inventories)" where .* for update/', $q->sql, $m) === 1) {
                $journal[] = 'verrou '.$m[1];
            } elseif (preg_match('/^update "(leases|inventories)"/', $q->sql, $m) === 1) {
                $journal[] = 'écriture '.$m[1];
            }
        });

        $this->abandonner($this->brouillon)->assertOk();

        $this->assertSame(['verrou properties', 'verrou leases', 'verrou inventories', 'écriture inventories', 'écriture leases'], $journal);
    }

    /**
     * r1, puis 4a — la fiche le dit à qui peut abandonner : `has_inventory` vaut pour un état des lieux
     * ENGAGÉ, qui remplace le geste par sa raison ; un brouillon d'état des lieux ne le retient pas.
     */
    public function test_r1_la_fiche_dit_qu_un_etat_des_lieux_existe(): void
    {
        $this->actingAsApi($this->agent)->getJson("/api/leases/{$this->brouillon->id}")
            ->assertOk()->assertJsonPath('data.has_inventory', false);

        $edl = $this->etatDesLieux(InventoryStatus::Draft);
        $this->actingAsApi($this->agent)->getJson("/api/leases/{$this->brouillon->id}")
            ->assertOk()->assertJsonPath('data.has_inventory', false);

        foreach (self::etatsEngages() as $cas => [$statut, $attributs]) {
            $edl->forceFill($attributs + ['status' => $statut, 'tenant_signed' => false, 'owner_signed' => false, 'tenant_signed_at' => null, 'owner_signed_at' => null, 'signed_at' => null])->save();
            $this->assertTrue($this->actingAsApi($this->agent)->getJson("/api/leases/{$this->brouillon->id}")->assertOk()->json('data.has_inventory'), $cas);
        }

        $locataire = User::factory()->create();
        $this->clientA->update(['user_id' => $locataire->id]);
        $this->assertArrayNotHasKey('has_inventory', $this->actingAsApi($locataire)->getJson("/api/leases/{$this->brouillon->id}")->assertOk()->json('data'));
    }

    /**
     * r1 — la course dans l'autre sens : un état des lieux créé avec une instance lue AVANT l'abandon ne
     * naît pas sur le brouillon supprimé (`InventoryService::create()` relit le bail sous verrou).
     */
    public function test_r1_un_etat_des_lieux_ne_nait_pas_sur_un_brouillon_abandonne(): void
    {
        $perime = Lease::query()->findOrFail($this->brouillon->id);
        $this->abandonner($this->brouillon)->assertOk();

        try {
            app(InventoryService::class)->create($perime, $this->agent, [
                'type' => InventoryType::MoveIn->value,
                'general_condition' => InventoryCondition::Good->value,
                'rooms' => [['name' => 'Salon', 'condition' => 'good']],
            ]);
            $this->fail('un état des lieux ne naît pas sur un brouillon abandonné');
        } catch (ModelNotFoundException) {
        }
        $this->assertSame(0, Inventory::query()->count());
    }

    /** r1 — l'état des lieux prend le bien puis le bail avant d'écrire, comme l'abandon (piège n° 10). */
    public function test_r1_l_etat_des_lieux_prend_le_bien_puis_le_bail_avant_d_ecrire(): void
    {
        $journal = [];
        DB::listen(function ($q) use (&$journal): void {
            if (preg_match('/from "(properties|leases)" where .* for update/', $q->sql, $m) === 1) {
                $journal[] = 'verrou '.$m[1];
            } elseif (preg_match('/^insert into "inventories"/', $q->sql) === 1) {
                $journal[] = 'écriture inventories';
            }
        });

        $this->actingAsApi($this->agent)->postJson('/api/inventories', [
            'lease_id' => $this->brouillon->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [['name' => 'Salon', 'condition' => 'good']],
        ])->assertCreated();

        $this->assertSame(['verrou properties', 'verrou leases', 'écriture inventories'], $journal);
    }
}
