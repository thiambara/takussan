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

    private function etatDesLieux(InventoryStatus $statut): Inventory
    {
        return Inventory::factory()->create([
            'lease_id' => $this->brouillon->id,
            'property_id' => $this->bien->id,
            'tenant_id' => $this->clientA->id,
            'type' => InventoryType::MoveIn,
            'status' => $statut,
        ]);
    }

    /**
     * Réserve r1 de la vérification d'ace044c18 (décision du 2026-11-13) — un état des lieux sur le
     * brouillon, signé ou non, refuse l'abandon : aucune route ne le supprime, et il restait sans bail.
     */
    public function test_r1_un_etat_des_lieux_refuse_l_abandon(): void
    {
        foreach ([InventoryStatus::Draft, InventoryStatus::Signed] as $statut) {
            $edl = $this->etatDesLieux($statut);

            $this->abandonner($this->brouillon)->assertStatus(422)->assertJsonPath('code', 'lease.abandon_has_inventory');
            $this->assertNotSoftDeleted('leases', ['id' => $this->brouillon->id]);

            $edl->forceDelete();
        }
        $this->assertSame(0, Activity::query()->where('event', 'lease_draft_abandoned')->count());

        // Témoin : sans état des lieux, le même brouillon s'abandonne.
        $this->abandonner($this->brouillon)->assertOk();
    }

    /** r1 — la fiche le dit à qui peut abandonner : `has_inventory`, pour remplacer le geste par sa raison. */
    public function test_r1_la_fiche_dit_qu_un_etat_des_lieux_existe(): void
    {
        $this->actingAsApi($this->agent)->getJson("/api/leases/{$this->brouillon->id}")
            ->assertOk()->assertJsonPath('data.has_inventory', false);

        $this->etatDesLieux(InventoryStatus::Draft);

        $this->actingAsApi($this->agent)->getJson("/api/leases/{$this->brouillon->id}")
            ->assertOk()->assertJsonPath('data.has_inventory', true);

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
