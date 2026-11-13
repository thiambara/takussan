<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Document;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Owners\OwnerDepartureService;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Payout\PayoutClawbacks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;

/**
 * TCK-2753 (ADR-0108) — le départ d'un bailleur : `DELETE /api/owners/{P}` et sa lecture
 * `GET /api/owners/{P}/departure`.
 *
 * Fixture commune (celle du ticket) : une agence A, son administrateur Ad, le bailleur L (compte U,
 * profil P), et l'histoire de L dans A — un bien SUPPRIMÉ portant un bail `terminated` à 10 %, le
 * loyer d'octobre (100 000) encaissé le 5 octobre, reversé (90 000) et versé le 3 novembre, le relevé
 * d'octobre envoyé ; on agit le 20 novembre. Le solde est nul, aucune pièce n'attend : L peut partir.
 */
class OwnerDepartureTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private const VIDE = ['properties' => 0, 'leases' => 0, 'positive_balance' => 0, 'upcoming_payouts' => 0, 'unpaid_out_pieces' => 0];

    private Agency $agency;

    private User $admin;

    private User $landlord;

    private OwnerProfile $profile;

    private Property $property;

    private Lease $lease;

    private LeasePayment $october;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->fixture();
    }

    private function fixture(): void
    {
        $this->travelTo('2026-10-05 10:00:00');
        $this->agency = $this->moneyAgency();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = $this->landlordOf($this->agency);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->lease = $this->leaseOf($this->agency, $this->landlord, 10);
        $this->property = $this->lease->property;
        $this->october = $this->rent($this->lease, 100_000, '2026-10-05 10:00:00');
        $this->soldeParLAgence($this->october, $this->agency);

        $this->travelTo('2026-11-03 08:00:00');
        $this->paidOut([$this->october->id], 90000, '2026-11-03 09:00:00');
        $this->assertTrue(app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2026-10', now()));

        Lease::query()->whereKey($this->lease->id)->update(['status' => LeaseStatus::Terminated->value]);
        $this->property->delete();
        $this->assertSoftDeleted($this->property);

        $this->travelTo('2026-11-20 10:00:00');
    }

    private function rent(Lease $lease, float $amount, string $paidAt): LeasePayment
    {
        $month = substr($paidAt, 0, 7);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $amount,
            'payment_type' => LeasePaymentType::Rent,
            'status' => 'paid',
            'paid_at' => $paidAt,
            'period_start' => "{$month}-01",
            'period_end' => date('Y-m-t', strtotime("{$month}-01")),
            'due_date' => "{$month}-05",
        ]);
    }

    /**
     * Un reversement préparé par l'application (`POST /api/payouts`), puis porté au statut voulu.
     *
     * @param  list<int>  $leaseIds
     */
    private function paidOut(array $leaseIds, int $net, ?string $processedAt, PayoutStatus $status = PayoutStatus::Completed): Payout
    {
        Sanctum::actingAs($this->agencyAgent($this->agency));
        $id = $this->postJson('/api/payouts', ['landlord_id' => $this->landlord->id, 'lease_payment_ids' => $leaseIds])
            ->assertCreated()->assertJsonPath('data.net_amount', $net)->json('data.id');
        Payout::query()->whereKey($id)->update(['status' => $status->value, 'processed_at' => $processedAt]);
        $this->app['auth']->forgetGuards();

        return Payout::findOrFail($id);
    }

    /** Un trop-versé : un reversement terminé dont le net dépasse celui de sa pièce, inséré directement. */
    private function overpaid(int $net): void
    {
        $piece = $this->rent($this->lease, 100_000, '2026-11-06 10:00:00');
        $over = Payout::factory()->create([
            'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id, 'payee_role' => PayeeRole::Landlord,
            'status' => PayoutStatus::Completed, 'processed_at' => '2026-11-10 09:00:00', 'net_amount' => $net,
            'clawback_amount' => null,
        ]);
        DB::table('payout_lease_payment')->insert([
            'payout_id' => $over->id, 'lease_payment_id' => $piece->id, 'amount' => 100_000, 'commission_rate' => 10, 'commission_amount' => 10_000,
        ]);
    }

    private function asAdmin(): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->admin, 'sanctum');
    }

    private function departedEntries(): int
    {
        return Activity::query()->where('event', OwnerDepartureService::EVENEMENT)->where('subject_id', $this->profile->id)->count();
    }

    /** @return array<string, array{0: string, 1: array<string, int>}> */
    public static function blocages(): array
    {
        return [
            '(a) un bien archivé' => ['archive', ['properties' => 1]],
            '(b) un bail draft sur un bien supprimé' => ['brouillon', ['leases' => 1]],
            '(c) un bail pending_signature' => ['en_signature', ['leases' => 1]],
            '(d) novembre encaissé, octobre reversé (TCK-2760)' => ['solde', ['positive_balance' => 1, 'unpaid_out_pieces' => 1]],
            '(e) un reversement scheduled qui porte tout' => ['programme', ['upcoming_payouts' => 1, 'positive_balance' => 1]],
            '(f) une pièce non portée sous un trop-versé' => ['trop_verse', ['unpaid_out_pieces' => 1]],
        ];
    }

    private function poser(string $cas): void
    {
        match ($cas) {
            'archive' => Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'archived_at' => now()]),
            'brouillon' => Lease::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id, 'status' => LeaseStatus::Draft]),
            'en_signature' => Lease::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id, 'status' => LeaseStatus::PendingSignature]),
            'solde' => $this->rent($this->lease, 100_000, '2026-11-05 10:00:00'),
            'programme' => $this->paidOut([$this->rent($this->lease, 100_000, '2026-11-05 10:00:00')->id], 90000, null, PayoutStatus::Scheduled),
            'trop_verse' => [$this->rent($this->lease, 100_000, '2026-11-05 10:00:00'), $this->overpaid(200_000)],
        };
    }

    /** AC1 + AC3 — chaque condition bloque, se compte au vecteur exact, et la lecture dit la même chose. */
    #[DataProvider('blocages')]
    public function test_ac1_chaque_condition_bloque_et_se_compte(string $cas, array $attendu): void
    {
        $this->poser($cas);
        $vecteur = array_merge(self::VIDE, $attendu);
        $this->asAdmin();

        $lecture = $this->getJson("/api/owners/{$this->profile->id}/departure")->assertOk();
        $this->assertSame($vecteur, $lecture->json('data.blocking'), 'AC3 — la lecture');
        $this->assertFalse($lecture->json('data.can_depart'));

        $this->deleteJson("/api/owners/{$this->profile->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'owner.departure_not_empty')
            ->assertJsonPath('blocking', $vecteur);

        $this->assertSame(OwnerProfileStatus::Active, $this->profile->fresh()->status);
        $this->assertSame(0, $this->departedEntries());
    }

    /** AC1 (d) — le reste DU MOIS de novembre est nul : c'est bien le solde qui refuse. */
    public function test_ac1_d_le_reste_du_mois_est_nul_et_le_depart_est_refuse(): void
    {
        $this->poser('solde');
        $this->asAdmin();

        $releve = $this->getJson("/api/owner-statements?period=2026-11&landlord_id={$this->landlord->id}")->assertOk();
        $this->assertEquals(0, $releve->json('data.totals.remaining_to_pay'));
        $this->assertEquals(90000, $releve->json('data.balance.remaining_to_pay'));

        $this->deleteJson("/api/owners/{$this->profile->id}")->assertStatus(422);
    }

    /** AC3 — sur la fixture seule, la lecture ouvre le geste. */
    public function test_ac3_sur_la_fixture_seule_le_depart_est_possible(): void
    {
        $this->asAdmin();

        $this->getJson("/api/owners/{$this->profile->id}/departure")
            ->assertOk()
            ->assertJsonPath('data.blocking', self::VIDE)
            ->assertJsonPath('data.balance.remaining_to_pay', 0)
            ->assertJsonPath('data.can_depart', true);
    }

    /** AC2 — ce qui ne bloque pas : un bail expiré, un bail renouvelé, une reprise en attente, un trop-versé. */
    public function test_ac2_ce_qui_ne_bloque_pas(): void
    {
        foreach ([LeaseStatus::Expired, LeaseStatus::Renewed] as $statut) {
            Lease::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id, 'status' => $statut]);
        }
        // Une reprise : 50 000 remboursés du loyer d'octobre, déjà versé — 45 000 dus par L, non imputés.
        $this->assertSame(1, $this->refundByWebhook($this->october, 50_000));
        $this->assertEquals(45000, app(PayoutClawbacks::class)->outstanding($this->agency->id, $this->landlord->id)->sum('remaining'));
        // Un trop-versé de 30 000 : 120 000 versés pour une pièce de 90 000 net.
        $this->overpaid(120_000);

        $this->asAdmin();
        $this->getJson("/api/owners/{$this->profile->id}/departure")
            ->assertOk()
            ->assertJsonPath('data.blocking', self::VIDE)
            ->assertJsonPath('data.balance.remaining_to_pay', -30000)
            ->assertJsonPath('data.can_depart', true);

        $this->deleteJson("/api/owners/{$this->profile->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $this->profile->id)
            ->assertJsonPath('data.status', 'inactive')
            ->assertJsonPath('data.departed_at', now()->toIso8601String());

        $this->assertSame(OwnerProfileStatus::Inactive, $this->profile->fresh()->status);

        $entree = Activity::query()->where('event', OwnerDepartureService::EVENEMENT)->where('subject_id', $this->profile->id)->sole();
        $this->assertSame($this->admin->id, (int) $entree->causer_id);
        $this->assertEquals(self::VIDE, $entree->properties['inventory']);
        $this->assertEquals(45000, $entree->properties['outstanding_clawback']);
        $this->assertEquals(-30000, $entree->properties['negative_balance']);
        $this->assertSame($this->agency->id, $entree->properties['agency_id']);

        // L'audit du modèle porte le changement de statut.
        $audit = Activity::query()->where('subject_type', $this->profile->getMorphClass())->where('subject_id', $this->profile->id)
            ->where('event', 'updated')->latest('id')->firstOrFail();
        $changes = $audit->attribute_changes->toArray();
        $this->assertSame('inactive', $changes['attributes']['status'] ?? null);
        $this->assertSame('active', $changes['old']['status'] ?? null);
    }

    /** AC4 — rien n'est effacé : biens, baux, paiements, reversements, relevés, documents, fils. */
    public function test_ac4_rien_n_est_efface(): void
    {
        Document::factory()->create(['documentable_type' => Lease::class, 'documentable_id' => $this->lease->id, 'uploaded_by' => $this->landlord->id]);
        $fil = Conversation::factory()->create(['created_by' => $this->admin->id]);
        $fil->participants()->attach($this->landlord->id, ['joined_at' => now()]);

        $compter = fn (): array => [
            'biens' => Property::withTrashed()->where('agency_id', $this->agency->id)->where('user_id', $this->landlord->id)->count(),
            'baux' => Lease::withTrashed()->where('agency_id', $this->agency->id)->where('landlord_id', $this->landlord->id)->count(),
            'paiements' => LeasePayment::query()->whereIn('lease_id', Lease::withTrashed()->where('landlord_id', $this->landlord->id)->select('id'))->count(),
            'reversements' => Payout::query()->where('agency_id', $this->agency->id)->where('landlord_id', $this->landlord->id)->count(),
            'instantanes' => DB::table(OwnerStatementSnapshots::TABLE)->where('landlord_id', $this->landlord->id)->count(),
            'documents' => Document::query()->where('documentable_type', Lease::class)->where('documentable_id', $this->lease->id)->count(),
            'fils' => DB::table('conversation_participants')->where('user_id', $this->landlord->id)->count(),
        ];
        $avant = $compter();
        $this->assertSame(['biens' => 1, 'baux' => 1, 'paiements' => 1, 'reversements' => 1, 'instantanes' => 1, 'documents' => 1, 'fils' => 1], $avant);

        $this->asAdmin();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();

        $this->assertSame($avant, $compter());
    }

    /** AC7 — sans autre profil actif, les jetons de U sont révoqués. */
    public function test_ac7_sans_autre_profil_actif_les_jetons_sont_revoques(): void
    {
        $this->landlord->createToken('mobile');
        $this->landlord->createToken('web');

        $this->asAdmin();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();

        $this->assertSame(0, $this->landlord->tokens()->count());
        $this->assertSame(2, Activity::query()->where('event', OwnerDepartureService::EVENEMENT)->sole()->properties['tokens_revoked']);
    }

    /** AC7 — avec un profil actif dans une autre agence, ils restent. */
    public function test_ac7_avec_un_profil_actif_ailleurs_les_jetons_restent(): void
    {
        AgentProfile::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => Agency::factory()->create()->id]);
        $this->landlord->createToken('mobile');

        $this->asAdmin();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();

        $this->assertSame(1, $this->landlord->tokens()->count());
    }

    /** AC9 — un brouillon d'invitation ne part pas : il se révoque. */
    public function test_ac9_un_brouillon_ne_part_pas(): void
    {
        $brouillon = OwnerProfile::factory()->create(['agency_id' => $this->agency->id, 'user_id' => null, 'status' => OwnerProfileStatus::Draft]);
        $this->asAdmin();

        $this->getJson("/api/owners/{$brouillon->id}/departure")->assertOk()->assertJsonPath('data.can_depart', false);
        $this->deleteJson("/api/owners/{$brouillon->id}")->assertStatus(422)->assertJsonPath('code', 'owner.departure_draft');
        $this->assertSame(OwnerProfileStatus::Draft, $brouillon->fresh()->status);
    }

    /** AC9 — un départ ne se rejoue pas. */
    public function test_ac9_un_bailleur_deja_parti(): void
    {
        $this->asAdmin();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertStatus(422)->assertJsonPath('code', 'owner.already_departed');
        $this->getJson("/api/owners/{$this->profile->id}/departure")->assertOk()->assertJsonPath('data.can_depart', false);

        $this->assertSame(1, $this->departedEntries());
    }

    /** AC9 — l'administrateur ne retire pas son propre profil de bailleur. */
    public function test_ac9_soi_meme(): void
    {
        $propre = OwnerProfile::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->admin->id, 'status' => OwnerProfileStatus::Active]);
        $this->asAdmin();

        $this->getJson("/api/owners/{$propre->id}/departure")->assertOk()->assertJsonPath('data.can_depart', false);
        $this->deleteJson("/api/owners/{$propre->id}")->assertStatus(422)->assertJsonPath('code', 'owner.departure_self');

        $this->assertSame(OwnerProfileStatus::Active, $propre->fresh()->status);
        $this->assertSame(0, Activity::query()->where('event', OwnerDepartureService::EVENEMENT)->count());
    }

    /** AC9 — l'hôte d'une agence `individual`, par le super-admin. */
    public function test_ac9_l_hote_d_une_agence_individuelle(): void
    {
        $individuelle = Agency::factory()->individual()->create();
        $hote = $this->agencyAdmin($individuelle);
        $sien = OwnerProfile::factory()->create(['agency_id' => $individuelle->id, 'user_id' => $hote->id, 'status' => OwnerProfileStatus::Active]);
        $this->app['auth']->forgetGuards();
        $this->actingAsRole('super_admin');

        $this->deleteJson("/api/owners/{$sien->id}")->assertStatus(422)->assertJsonPath('code', 'owner.departure_individual');

        $this->assertSame(OwnerProfileStatus::Active, $sien->fresh()->status);
        $this->assertSame(0, Activity::query()->where('event', OwnerDepartureService::EVENEMENT)->count());
    }

    /**
     * L'ordre des verrous (piège n° 10 du CLAUDE.md de l'API) : les biens du bailleur dans l'agence,
     * puis la ligne du profil.
     */
    public function test_les_biens_se_verrouillent_avant_le_profil(): void
    {
        $this->poser('archive');
        $verrous = [];
        DB::listen(function ($query) use (&$verrous): void {
            if (str_contains($query->sql, 'for update') && preg_match('/from "([a-z_]+)"/', $query->sql, $m) === 1) {
                $verrous[] = $m[1];
            }
        });

        $this->asAdmin();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertStatus(422);

        $properties = array_search('properties', $verrous, true);
        $profils = array_search('owner_profiles', $verrous, true);
        $this->assertNotFalse($properties, implode(', ', $verrous));
        $this->assertNotFalse($profils, implode(', ', $verrous));
        $this->assertLessThan($profils, $properties, implode(', ', $verrous));
    }

    private function refundByWebhook(LeasePayment $payment, int $amount): int
    {
        $payment->refresh();
        $integration = Integration::query()->findOrFail($payment->metadata['gateway']['integration_id']);

        return app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $payment->metadata['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of($integration),
        ));
    }
}
