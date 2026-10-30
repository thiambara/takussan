<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\PublishClaimedRadarListings;
use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\UserStatus;
use App\Models\GeoNeighborhood;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Property\PublishReadiness;
use App\Services\Radar\ClaimLinks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2413 (ADR-0077 §3, §6, §11) — deux suites de la réclamation (TCK-2390) :
 *  - le compte que le Radar avait créé, puis supprimé, bloquait toute réclamation : le super-admin le délie, sans jamais
 *    passer outre un STOP, un `do_not_contact` ni une révocation ;
 *  - l'annonce que la publication laisse à l'opérateur ne se dit plus « en cours de publication » : la page la range à part,
 *    et l'opérateur la retrouve dans sa file.
 */
class RadarClaimSupportTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const NUMERO = '+221741234567';

    private FakeSmsRouter $sms;

    private RadarAdvertiser $annonceur;

    private GeoNeighborhood $quartier;

    private RadarOutreach $message;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        config(['auth.phone_login.enabled' => true, 'radar.claim.link_ttl_days' => 30]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->quartier = GeoNeighborhood::factory()->create();
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Diop']);
        $this->message = RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v2']);
    }

    /** Une annonce démarchée par le message, sa réserve garnie de `$photos` photos (source texte : rien à lire ailleurs). */
    private function annonce(int $photos = 1, ?RadarAdvertiser $annonceur = null, RadarListingStage $etape = RadarListingStage::Contacted): RadarListing
    {
        $annonce = RadarListing::factory()
            ->extracted(['neighborhood' => ['neighborhood_id' => $this->quartier->id]])
            ->create([
                'radar_advertiser_id' => ($annonceur ?? $this->annonceur)->id,
                'stage' => $etape,
                'source_kind' => RadarSourceKind::Text,
            ]);
        for ($i = 0; $i < $photos; $i++) {
            $image = imagecreatetruecolor(16, 12);
            imagefill($image, 0, 0, (int) imagecolorallocate($image, 100 + $i * 20, 83, 50));
            ob_start();
            imagejpeg($image);
            $annonce->addMediaFromString((string) ob_get_clean())->usingFileName("p{$i}.jpg")->toMediaCollection('radar_photos');
        }
        if ($annonceur === null) {
            $this->message->listings()->attach($annonce->id);
        }

        return $annonce->fresh();
    }

    private function jeton(): string
    {
        return app(ClaimLinks::class)->token($this->annonceur, $this->message->created_at);
    }

    private function lire(): TestResponse
    {
        return $this->getJson('/api/radar/claims/'.$this->jeton());
    }

    private function demanderLeCode(): TestResponse
    {
        return $this->postJson('/api/radar/claims/'.$this->jeton().'/otp');
    }

    /** @param  list<int>  $ids */
    private function confirmer(array $ids): TestResponse
    {
        return $this->postJson('/api/radar/claims/'.$this->jeton().'/confirm', [
            'code' => $this->sms->lastCodeFor(self::NUMERO),
            'accept_terms' => true,
            'terms_version' => PublishReadiness::TERMS_VERSION,
            'listings' => array_map(fn (int $id) => ['id' => $id], $ids),
        ]);
    }

    /** Le compte que « Publier pour lui » avait créé (sans mot de passe ni e-mail, numéro non vérifié), puis supprimé. */
    private function compteDuRadarSupprime(): User
    {
        $compte = new User;
        $compte->forceFill([
            'first_name' => 'Awa', 'last_name' => 'Diop', 'email' => null, 'password' => bcrypt('x'),
            'phone' => self::NUMERO, 'phone_verified_at' => null, 'status' => 'active', 'preferred_language' => 'fr',
        ])->save();
        Agency::factory()->create(['primary_admin_id' => $compte->id, 'name' => 'Espace de Awa', 'kind' => 'individual']);
        $this->annonceur->forceFill(['user_id' => $compte->id])->save();
        $compte->delete();

        return $compte;
    }

    /** Le geste, par un opérateur du niveau donné ; la session de l'opérateur se referme après (la page est publique). */
    private function delier(array $corps = [], PlatformProfileLevel $niveau = PlatformProfileLevel::SuperAdmin): TestResponse
    {
        $this->agirEnOperateur($niveau);
        $reponse = $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/release-account", $corps);
        $this->app['auth']->forgetGuards();

        return $reponse;
    }

    // --- AC1 : le geste débloque la réclamation ---------------------------------------------------------------------------

    public function test_ac1_le_titulaire_verifie_reclame_une_fois_le_compte_supprime_delie(): void
    {
        $supprime = $this->compteDuRadarSupprime();
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $annonce = $this->annonce();
        Sanctum::actingAs($titulaire);
        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'support');
        $this->app['auth']->forgetGuards();

        $this->delier(['reason' => 'Compte supprimé à sa demande, il veut republier'])->assertOk()
            ->assertJsonPath('data.advertiser_id', $this->annonceur->id)
            ->assertJsonPath('data.previous_user_id', $supprime->id);

        $this->assertNull($this->annonceur->fresh()->user_id);
        $journal = Activity::query()->where('event', 'radar_account_released')->sole();
        $this->assertTrue(User::query()->findOrFail($journal->causer_id)->isSuperAdmin());
        $this->assertSame([RadarAdvertiser::class, $this->annonceur->id], [$journal->subject_type, $journal->subject_id]);
        $this->assertSame($supprime->id, $journal->properties['previous_user_id']);
        $this->assertSame('Compte supprimé à sa demande, il veut republier', $journal->properties['reason']);

        Sanctum::actingAs($titulaire);
        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'existing')->assertJsonPath('data.account.viewer_is_owner', true);
        $this->demanderLeCode()->assertStatus(202);
        Queue::fake();
        $this->confirmer([$annonce->id])->assertOk()->assertJsonPath('claim.state', 'existing');

        $this->assertSame($titulaire->id, $this->annonceur->fresh()->user_id);
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
        // Le compte supprimé reste supprimé : le geste ne le rouvre ni ne le réunit.
        $this->assertSoftDeleted($supprime);
        $this->assertSame(0, Activity::query()->where('event', 'radar_orphan_absorbed')->count());
    }

    public function test_ac1_sans_titulaire_la_reclamation_ouvre_un_compte_neuf_une_fois_le_compte_supprime_delie(): void
    {
        $supprime = $this->compteDuRadarSupprime();
        $annonce = $this->annonce();
        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'unavailable');

        $this->delier()->assertOk();

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'new');
        $this->demanderLeCode()->assertStatus(202);
        Queue::fake();
        $compte = $this->confirmer([$annonce->id])->assertOk()->assertJsonPath('claim.state', 'new')->json('user.id');

        $this->assertNotSame($supprime->id, $compte);
        $this->assertSame($compte, $this->annonceur->fresh()->user_id);
        $this->assertSoftDeleted($supprime);
    }

    // --- AC2 : ce que le geste refuse -------------------------------------------------------------------------------------

    /** @return array<string, array{\Closure(RadarAdvertiser, RadarOutreach): void}> */
    public static function annonceursRevoques(): array
    {
        return [
            'STOP (ne plus contacter)' => [fn (RadarAdvertiser $a) => $a->forceFill(['do_not_contact_at' => now()])->save()],
            'accord retiré' => [fn (RadarAdvertiser $a, RadarOutreach $m) => RadarConsent::factory()->create([
                'radar_outreach_id' => $m->id, 'radar_advertiser_id' => $a->id, 'revoked_at' => now(),
            ])],
            'numéro purgé' => [fn (RadarAdvertiser $a) => $a->forceFill(['phone' => null])->save()],
        ];
    }

    #[DataProvider('annonceursRevoques')]
    public function test_ac2_le_geste_ne_passe_pas_outre_un_stop_ni_une_revocation(\Closure $revoquer): void
    {
        $supprime = $this->compteDuRadarSupprime();
        $revoquer($this->annonceur, $this->message);

        $this->delier()->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.do_not_contact');

        $this->assertSame($supprime->id, $this->annonceur->fresh()->user_id);
        $this->assertSame(0, Activity::query()->where('event', 'radar_account_released')->count());
    }

    /** @return array<string, array{\Closure(User): void}> */
    public static function comptesQuiNeSeDelientPas(): array
    {
        return [
            'compte actif' => [fn (User $compte) => $compte->restore()],
            'compte bloqué (décision du support)' => [function (User $compte): void {
                $compte->restore();
                $compte->forceFill(['status' => UserStatus::Blocked])->save();
            }],
        ];
    }

    #[DataProvider('comptesQuiNeSeDelientPas')]
    public function test_ac2_seul_un_compte_supprime_se_delie(\Closure $etat): void
    {
        $compte = $this->compteDuRadarSupprime();
        $etat($compte);

        $this->delier()->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.account_not_deleted');

        $this->assertSame($compte->id, $this->annonceur->fresh()->user_id);
        $this->assertSame(0, Activity::query()->where('event', 'radar_account_released')->count());
    }

    public function test_ac2_un_annonceur_sans_compte_n_a_rien_a_delier(): void
    {
        $this->delier()->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.account_not_deleted');
    }

    public function test_ac2_le_support_ne_delie_pas(): void
    {
        $supprime = $this->compteDuRadarSupprime();

        $this->delier(niveau: PlatformProfileLevel::Support)->assertForbidden();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/release-account")->assertUnauthorized();

        $this->assertSame($supprime->id, $this->annonceur->fresh()->user_id);
    }

    public function test_le_motif_est_facultatif_et_borne(): void
    {
        $this->compteDuRadarSupprime();

        $this->delier(['reason' => str_repeat('a', 501)])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->delier(['reason' => null])->assertOk();

        $this->assertArrayNotHasKey('reason', Activity::query()->where('event', 'radar_account_released')->sole()->properties->all());
    }

    public function test_la_fiche_dit_le_compte_supprime_et_si_le_geste_est_offert(): void
    {
        $supprime = $this->compteDuRadarSupprime();
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}")->assertOk()
            ->assertJsonPath('data.account', ['user_id' => $supprime->id, 'deleted' => true, 'releasable' => true]);

        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}")->assertOk()
            ->assertJsonPath('data.account.releasable', false);

        $supprime->restore();
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}")->assertOk()
            ->assertJsonPath('data.account', ['user_id' => $supprime->id, 'deleted' => false, 'releasable' => false]);

        $this->annonceur->forceFill(['user_id' => null])->save();
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}")->assertOk()->assertJsonPath('data.account', null);
    }

    // --- AC3 : l'annonce que la publication laisse à l'opérateur ----------------------------------------------------------

    public function test_ac3_l_annonce_laissee_par_la_publication_attend_l_equipe_sur_la_page(): void
    {
        Queue::fake();
        $prete = $this->annonce();
        $sansPhoto = $this->annonce(photos: 0);
        $this->demanderLeCode()->assertStatus(202);
        $compte = User::query()->findOrFail($this->confirmer([$prete->id, $sansPhoto->id])->assertOk()->json('user.id'));
        $this->app['auth']->forgetGuards();

        // Avant le job : les deux sont « en cours de publication ».
        Sanctum::actingAs($compte);
        $this->lire()->assertOk()
            ->assertJsonPath('data.publishing.0.id', $prete->id)
            ->assertJsonPath('data.publishing.1.id', $sansPhoto->id)
            ->assertJsonPath('data.awaiting_review', []);

        $job = null;
        Queue::assertPushed(PublishClaimedRadarListings::class, function (PublishClaimedRadarListings $pousse) use (&$job): bool {
            $job = $pousse;

            return true;
        });
        $this->app->call([$job->withFakeQueueInteractions(), 'handle']);

        $reponse = $this->lire()->assertOk()
            ->assertJsonPath('data.listings', [])
            ->assertJsonPath('data.publishing', [])
            ->assertJsonPath('data.awaiting_review.0.id', $sansPhoto->id)
            ->assertJsonCount(1, 'data.awaiting_review')
            ->assertJsonCount(1, 'data.published');
        // Rien de la raison ne sort sur la page publique : ni le code, ni l'étape.
        $corps = (string) $reponse->getContent();
        foreach (['radar.publish', 'no_photo', '"stage', 'reason'] as $interdit) {
            $this->assertStringNotContainsString($interdit, $corps, $interdit);
        }
        $this->assertSame(
            ['id', 'title', 'description', 'price', 'contract', 'rent_period', 'property_type', 'bedrooms', 'bathrooms', 'surface_m2', 'furnished', 'neighborhood', 'photo_url'],
            array_keys($reponse->json('data.awaiting_review.0')),
        );
    }

    public function test_ac3_l_annonceur_dont_une_annonce_attend_l_operateur_est_dans_sa_file(): void
    {
        $laissee = $this->annonce(etape: RadarListingStage::Consented);
        $laissee->forceFill(['stage_reason' => 'radar.publish.no_photo'])->save();
        // En vol : réclamée, le job ne l'a pas encore vue (aucun motif) — elle n'attend personne.
        $enVol = RadarAdvertiser::factory()->create(['phone' => '+221741234568']);
        $this->annonce(annonceur: $enVol, etape: RadarListingStage::Consented);
        // Un STOP depuis : il ne se reprend pas.
        $stoppe = RadarAdvertiser::factory()->create(['phone' => '+221741234569', 'do_not_contact_at' => now()]);
        $this->annonce(annonceur: $stoppe, etape: RadarListingStage::Consented)->forceFill(['stage_reason' => 'radar.publish.no_photo'])->save();
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $file = $this->getJson('/api/admin/radar/advertisers?filter[queue]=left_to_operator')->assertOk();

        $this->assertSame([$this->annonceur->id], array_column($file->json('data'), 'id'));
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}")->assertOk()
            ->assertJsonPath('data.listings.0.stage_reason', 'radar.publish.no_photo');
    }
}
