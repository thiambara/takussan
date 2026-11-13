<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Owners\OwnerDepartureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FakeSmsRouter;

/**
 * TCK-2753 (ADR-0108 § 5 et 6) — ce que le départ ferme et ce qu'il garde.
 *
 * Fixture : une agence A, son administrateur Ad, le bailleur L (compte U, numéro vérifié, profil P),
 * un bien SUPPRIMÉ portant un bail `terminated` dont le loyer de novembre (100 000) est encore DÛ ; Ad
 * fait partir L le 20 novembre. Un loyer non encaissé n'est ni un solde ni une pièce : il ne bloque pas.
 */
class OwnerDepartedTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const NUMERO = '+221770002753';

    private Agency $agency;

    private User $admin;

    private User $landlord;

    private OwnerProfile $profile;

    private Lease $lease;

    private LeasePayment $arrears;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'status' => LeaseStatus::Terminated, 'commission_rate' => 10,
        ]);
        $this->arrears = LeasePayment::factory()->create([
            'lease_id' => $this->lease->id, 'amount' => 100_000, 'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Pending, 'paid_at' => null,
            'period_start' => '2026-11-01', 'period_end' => '2026-11-30', 'due_date' => '2026-11-05',
        ]);
        $property->delete();
    }

    private function asAdmin(): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->admin, 'sanctum');
    }

    private function depart(): void
    {
        $this->asAdmin();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();
        $this->app['auth']->forgetGuards();
    }

    private function asLandlord(): void
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->landlord->fresh());
    }

    /** AC5 — l'indice de profil actif ne fait plus de P le profil de la requête, et `me` ne dit plus `owner`. */
    public function test_ac5_le_profil_parti_ne_se_resout_plus(): void
    {
        $this->asLandlord();
        $this->withHeaders(['X-Active-Profile-Hint' => "owner:{$this->profile->id}"])->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('active_profile_id', "owner:{$this->profile->id}")
            ->assertJsonPath('roles', ['owner', 'customer']);

        $this->depart();

        $this->asLandlord();
        $me = $this->withHeaders(['X-Active-Profile-Hint' => "owner:{$this->profile->id}"])->getJson('/api/auth/me')->assertOk();
        $this->assertNull($me->json('active_profile_id'));
        $this->assertNotContains('owner', $me->json('roles'));
    }

    /**
     * AC5 — joindre un document à son bail terminé est refusé après le départ (témoin : 201 avant).
     * Le refus de `DocumentPolicy::attachTo` sort en 404 `document.owner_not_found` : un porteur
     * interdit rend la même réponse qu'un porteur introuvable (TCK-732), le 403 de l'AC n'existe pas
     * sur cette route.
     */
    public function test_ac5_le_bailleur_parti_ne_joint_plus_de_document(): void
    {
        $joindre = fn () => $this->postJson('/api/documents', [
            'documentable_type' => Lease::class,
            'documentable_id' => $this->lease->id,
            'name' => 'Quittance',
            'type' => 'other',
            'file' => UploadedFile::fake()->create('quittance.pdf', 20, 'application/pdf'),
        ]);

        $this->asLandlord();
        $joindre()->assertCreated();

        $this->depart();

        $this->asLandlord();
        $joindre()->assertNotFound()->assertJsonPath('code', 'document.owner_not_found');
    }

    /** AC5 — « Réactiver » ne ramène pas un bailleur parti. */
    public function test_ac5_la_reactivation_ne_ramene_pas_le_bailleur(): void
    {
        $this->depart();

        $this->asAdmin();
        $this->postJson("/api/agencies/{$this->agency->id}/team/{$this->landlord->id}/reactivate")
            ->assertStatus(422)
            ->assertJsonPath('code', 'team.nothing_to_reactivate');
        $this->assertSame(OwnerProfileStatus::Inactive, $this->profile->fresh()->status);
    }

    /** AC6 — U lit son bail, le personnel lit son relevé. */
    public function test_ac6_les_lectures_restent(): void
    {
        $this->depart();

        $this->asLandlord();
        $this->getJson("/api/leases/{$this->lease->id}")->assertOk()->assertJsonPath('data.id', $this->lease->id);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->agencyAgent($this->agency));
        $this->getJson("/api/owner-statements?period=2026-11&landlord_id={$this->landlord->id}")->assertOk();
    }

    /** AC6 — un arriéré encaissé APRÈS le départ se reverse au bailleur parti. */
    public function test_ac6_un_arriere_encaisse_apres_le_depart_se_reverse(): void
    {
        $this->depart();

        $this->travelTo('2026-11-25 10:00:00');
        $this->arrears->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => now()])->save();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->agencyAgent($this->agency));
        $preparation = $this->getJson("/api/payouts/preparation?landlord_id={$this->landlord->id}&period_start=2026-11-01&period_end=2026-11-30")->assertOk();
        $this->assertSame([$this->arrears->id], array_column($preparation->json('data.lines.lease_payments'), 'id'));

        $this->postJson('/api/payouts', ['landlord_id' => $this->landlord->id, 'lease_payment_ids' => [$this->arrears->id]])
            ->assertCreated()
            ->assertJsonPath('data.net_amount', 90000);
    }

    /** AC10 — le carnet ne liste plus P, sauf à le demander ; le résumé le retire ; la fiche reste. */
    public function test_ac10_le_carnet(): void
    {
        $this->asAdmin();
        $avant = $this->getJson('/api/owners')->assertOk();
        $this->assertContains($this->profile->id, array_column($avant->json('data'), 'id'));
        $owners = $avant->json('meta.summary.owners');

        $this->depart();

        $this->asAdmin();
        $apres = $this->getJson('/api/owners')->assertOk();
        $this->assertNotContains($this->profile->id, array_column($apres->json('data'), 'id'));
        $this->assertSame($owners - 1, $apres->json('meta.summary.owners'));

        $partis = $this->getJson('/api/owners?filter[status]=inactive')->assertOk();
        $this->assertSame([$this->profile->id], array_column($partis->json('data'), 'id'));

        $this->getJson("/api/owners/{$this->profile->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'inactive')
            ->assertJsonPath('data.departed_at', now()->toIso8601String());
    }

    /** La fiche d'un bailleur présent ne porte pas de date de départ. */
    public function test_la_fiche_d_un_bailleur_present_n_a_pas_de_depart(): void
    {
        $this->asAdmin();
        $this->getJson("/api/owners/{$this->profile->id}")->assertOk()->assertJsonPath('data.departed_at', null);
        $this->assertNull(OwnerDepartureService::departedAt($this->profile));
    }

    /**
     * AC11 — réinviter U, par son e-mail puis par son numéro vérifié : 409 sous un CODE distinct,
     * `owner.invite_departed` (« a quitté »). Le 409 « déjà membre » est une `HttpException` dont
     * l'enveloppe globale remplace le message (`http.conflict`) : seul un code se distingue.
     */
    public function test_ac11_le_bailleur_parti_ne_se_reinvite_pas(): void
    {
        Mail::fake();
        config(['auth.phone_login.enabled' => true]);
        FakeSmsRouter::install();
        $this->depart();

        $this->asAdmin();
        $identite = ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'owner_type' => 'individual'];
        foreach (['email' => $this->landlord->email, 'phone' => self::NUMERO] as $champ => $valeur) {
            $this->withHeaders(['Accept-Language' => 'fr'])
                ->postJson("/api/agencies/{$this->agency->id}/owners/invite", $identite + [$champ => $valeur])
                ->assertStatus(409)
                ->assertJsonPath('code', 'owner.invite_departed')
                ->assertJsonPath('message', __('errors.owner.invite_departed', [], 'fr'));
        }
    }

    /** AC11 — témoin : un bailleur actif reçoit toujours le refus « déjà membre ». */
    public function test_ac11_un_bailleur_actif_reste_deja_membre(): void
    {
        Mail::fake();

        $this->asAdmin();
        $this->postJson("/api/agencies/{$this->agency->id}/owners/invite", ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'owner_type' => 'individual', 'email' => $this->landlord->email])
            ->assertStatus(409)
            ->assertJsonPath('code', 'http.conflict');
    }
}
