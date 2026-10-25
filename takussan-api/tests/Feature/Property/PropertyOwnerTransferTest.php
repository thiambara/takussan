<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-999 (P15.06, Q5 ; ADR-0036, amendement du 2026-10-19, voie 3) — « changer le titulaire » : l'admin
 * de l'agence rend à un bailleur actif un bien que le personnel a saisi à son propre nom. Les baux
 * `draft` de l'ancien titulaire suivent le bien ; les baux au-delà de `draft` et les reversements
 * déjà émis ne bougent pas. Le geste est explicite : un aperçu qui n'écrit rien, puis le transfert.
 */
class PropertyOwnerTransferTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agentA;

    private User $admin;

    private User $b;

    private Property $bien;

    private Lease $brouillon;

    private Lease $actif;

    private LeasePayment $loyer;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = $this->moneyAgency(['moderation_required' => false]);
        $this->agentA = $this->agencyAgent($this->agency);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->b = $this->landlordOf($this->agency);

        $this->bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agentA->id, 'title' => 'Immeuble Sacré-Cœur']);
        $this->brouillon = $this->bail(LeaseStatus::Draft);
        $this->actif = $this->bail(LeaseStatus::Active);
        $this->loyer = $this->leasePayment($this->actif, 300_000);
        // Le loyer du bail actif est déjà reversé à A : un reversement émis, que le geste ne touche pas.
        $this->actingAsApi($this->agencyAgent($this->agency))->postJson('/api/payouts', [
            'landlord_id' => $this->agentA->id,
            'lease_payment_ids' => [$this->loyer->id],
        ])->assertCreated();
    }

    private function bail(LeaseStatus $statut): Lease
    {
        return Lease::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->agentA->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Moussa', 'last_name' => 'Ndiaye'])->id,
            'status' => $statut,
            'signed_at' => $statut === LeaseStatus::Draft ? null : now(),
            'commission_rate' => 10,
        ]);
    }

    /** L'état que le geste ne doit pas toucher quand il refuse : titulaire, baux, journal. */
    private function etat(): array
    {
        return [
            'user_id' => (int) $this->bien->fresh()->user_id,
            'baux' => Lease::query()->where('property_id', $this->bien->id)->orderBy('id')->pluck('landlord_id', 'id')->all(),
            'journal' => Activity::query()->count(),
            'avis' => AppNotification::query()->where('code', 'property.assigned_to_owner')->count(),
        ];
    }

    private function transferer(User $acteur, int $ownerId): TestResponse
    {
        return $this->actingAsApi($acteur)->putJson("/api/properties/{$this->bien->id}/owner", ['owner_id' => $ownerId]);
    }

    public function test_ac1_l_admin_transfere_le_bien_a_b_avec_son_brouillon_et_rien_d_autre(): void
    {
        $reversements = DB::table('payouts')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        $paiements = DB::table('lease_payments')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();

        $this->transferer($this->admin, $this->b->id)
            ->assertOk()
            ->assertJsonPath('data.user_id', $this->b->id)
            ->assertJsonPath('data.leases_moved', [$this->brouillon->id])
            ->assertJsonPath('data.leases_kept', [$this->actif->id]);

        $this->assertSame($this->b->id, (int) $this->bien->fresh()->user_id);
        $this->assertSame($this->b->id, (int) $this->brouillon->fresh()->landlord_id);
        $this->assertSame($this->agentA->id, (int) $this->actif->fresh()->landlord_id);
        $this->assertSame($reversements, DB::table('payouts')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all());
        $this->assertSame($paiements, DB::table('lease_payments')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all());

        $this->actingAsApi($this->b)->getJson("/api/properties/{$this->bien->id}")->assertOk();
        $this->actingAsApi($this->b)->getJson("/api/leases/{$this->brouillon->id}")->assertOk();
        $this->actingAsApi($this->b)->getJson("/api/leases/{$this->actif->id}")->assertForbidden();

        $avis = AppNotification::query()->where('user_id', $this->b->id)->where('code', 'property.assigned_to_owner')->sole();
        $this->assertSame($this->bien->id, $avis->target['id'] ?? null);
        $this->assertSame('Immeuble Sacré-Cœur', $avis->params['property'] ?? null);
    }

    public function test_ac2_l_apercu_rend_les_deux_listes_et_n_ecrit_rien(): void
    {
        $avant = $this->etat();

        $this->actingAsApi($this->admin)
            ->getJson("/api/properties/{$this->bien->id}/owner-transfer?owner_id={$this->b->id}")
            ->assertOk()
            ->assertJsonPath('data.current_owner.id', $this->agentA->id)
            ->assertJsonPath('data.new_owner.id', $this->b->id)
            ->assertJsonCount(1, 'data.leases_moving')
            ->assertJsonPath('data.leases_moving.0.id', $this->brouillon->id)
            ->assertJsonPath('data.leases_moving.0.status', 'draft')
            ->assertJsonPath('data.leases_moving.0.tenant_name', 'Moussa Ndiaye')
            ->assertJsonCount(1, 'data.leases_staying')
            ->assertJsonPath('data.leases_staying.0.id', $this->actif->id)
            ->assertJsonPath('data.leases_staying.0.status', 'active');

        $this->assertSame($avant, $this->etat());
    }

    /** @return iterable<string, array{0: string}> */
    public static function acteursRefuses(): iterable
    {
        yield 'l\'agent titulaire' => ['agentA'];
        yield 'un agent qui tient properties.update_any' => ['agentUpdateAny'];
        yield 'le bailleur B' => ['b'];
    }

    #[DataProvider('acteursRefuses')]
    public function test_ac3_le_geste_est_refuse_a_qui_n_est_pas_admin_de_l_agence(string $qui): void
    {
        $acteur = match ($qui) {
            'agentA' => $this->agentA,
            'agentUpdateAny' => $this->agentWith($this->agency, Capability::PropertiesUpdateAny),
            'b' => $this->b,
        };
        $avant = $this->etat();

        $this->transferer($acteur, $this->b->id)->assertForbidden();
        $this->actingAsApi($acteur)->getJson("/api/properties/{$this->bien->id}/owner-transfer?owner_id={$this->b->id}")->assertForbidden();

        $this->assertSame($avant, $this->etat());
    }

    /** @return iterable<string, array{0: callable(Agency): int}> */
    public static function ciblesRefusees(): iterable
    {
        yield 'bailleur draft' => [fn (Agency $a): int => OwnerProfile::factory()->create(['agency_id' => $a->id, 'status' => 'draft'])->user_id];
        yield 'bailleur inactive' => [fn (Agency $a): int => OwnerProfile::factory()->inactive()->create(['agency_id' => $a->id])->user_id];
        yield 'bailleur d\'une autre agence' => [fn (Agency $a): int => User::factory()->withOwnerProfile(Agency::factory()->create())->create()->id];
        yield 'membre du personnel' => [fn (Agency $a): int => User::factory()->withAgentProfile($a)->create()->id];
        yield 'bailleur qui est aussi personnel' => [fn (Agency $a): int => User::factory()->withOwnerProfile($a)->withAgentProfile($a)->create()->id];
        yield 'compte inexistant' => [fn (Agency $a): int => 999_999];
    }

    /** @param  callable(Agency): int  $cible */
    #[DataProvider('ciblesRefusees')]
    public function test_ac3_la_cible_doit_etre_un_bailleur_actif_de_l_agence(callable $cible): void
    {
        $ownerId = $cible($this->agency);
        $avant = $this->etat();

        $this->transferer($this->admin, $ownerId)->assertStatus(422)->assertJsonPath('code', 'property.owner_not_in_agency');
        $this->actingAsApi($this->admin)
            ->getJson("/api/properties/{$this->bien->id}/owner-transfer?owner_id={$ownerId}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.owner_not_in_agency');

        $this->assertSame($avant, $this->etat());
    }

    public function test_ac3_un_bien_deja_tenu_par_un_bailleur_ne_change_pas_de_titulaire(): void
    {
        $c = $this->landlordOf($this->agency);
        $this->bien->forceFill(['user_id' => $c->id])->saveQuietly();
        $avant = $this->etat();

        $this->transferer($this->admin, $this->b->id)->assertStatus(422)->assertJsonPath('code', 'property.owner_transfer_forbidden');
        $this->actingAsApi($this->admin)
            ->getJson("/api/properties/{$this->bien->id}/owner-transfer?owner_id={$this->b->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.owner_transfer_forbidden');

        $this->assertSame($avant, $this->etat());
        $this->assertSame($c->id, (int) $this->bien->fresh()->user_id);
    }

    public function test_un_lot_sous_le_bien_d_un_autre_bailleur_ne_lui_est_pas_transfere(): void
    {
        $c = $this->landlordOf($this->agency);
        $immeuble = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $c->id]);
        $this->bien->forceFill(['parent_id' => $immeuble->id])->saveQuietly();
        $avant = $this->etat();

        $this->transferer($this->admin, $this->b->id)->assertStatus(422)->assertJsonPath('code', 'property.parent_owner_mismatch');

        $this->assertSame($avant, $this->etat());
    }

    public function test_la_fiche_offre_le_geste_au_seul_admin_et_tant_que_le_personnel_tient_le_bien(): void
    {
        $this->actingAsApi($this->admin)->getJson("/api/properties/{$this->bien->id}")
            ->assertOk()->assertJsonPath('data.abilities.transfer_owner', true);
        $this->actingAsApi($this->agentA)->getJson("/api/properties/{$this->bien->id}")
            ->assertOk()->assertJsonPath('data.abilities.transfer_owner', false);

        $this->transferer($this->admin, $this->b->id)->assertOk();

        $this->actingAsApi($this->admin)->getJson("/api/properties/{$this->bien->id}")
            ->assertOk()->assertJsonPath('data.abilities.transfer_owner', false);
    }

    public function test_ac5_le_transfert_est_journalise_sans_ligne_qui_reecrirait_le_titulaire(): void
    {
        $this->transferer($this->admin, $this->b->id)->assertOk();

        $ligne = Activity::query()->where('log_name', 'Property')->where('event', 'owner_transferred')->sole();
        $this->assertSame($this->bien->id, (int) $ligne->subject_id);
        $this->assertSame($this->admin->id, (int) $ligne->causer_id);
        $this->assertSame('manual', $ligne->properties['via']);
        $this->assertSame($this->agentA->id, $ligne->properties['from_user_id']);
        $this->assertSame($this->b->id, $ligne->properties['to_user_id']);
        $this->assertSame([$this->brouillon->id], $ligne->properties['leases_moved']);
        $this->assertSame([$this->actif->id], $ligne->properties['leases_kept']);

        $reecritures = Activity::query()->where('log_name', 'Property')->where('subject_id', $this->bien->id)->where('event', 'updated')->get()
            ->filter(fn (Activity $a): bool => array_key_exists('user_id', (array) ($a->attribute_changes['attributes'] ?? []))
                || array_key_exists('user_id', (array) ($a->properties['attributes'] ?? [])));
        $this->assertCount(0, $reecritures);
    }
}
