<?php

namespace Tests\Feature\Radar;

use App\Exceptions\ApiError;
use App\Models\AiSuggestion;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\AdvertiserClaim;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0077 §11, modèle d'ADR-0043 §7, AC5) — la prise en charge d'un annonceur : un opérateur à la fois,
 * dix minutes, renouvelables ; la prise vit sur la ligne de l'annonceur. Les routes d'écriture des tâches suivantes
 * l'exigent par `AdvertiserClaim::assertHeld()` : leur jeu AC5 est complété avec elles.
 */
class AdvertiserClaimTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private User $awa;

    private User $moussa;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-28 10:00:00');
        $this->awa = $this->operateur(PlatformProfileLevel::Support, ['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->moussa = $this->operateur(PlatformProfileLevel::Support);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function url(RadarAdvertiser $advertiser): string
    {
        return "/api/admin/radar/advertisers/{$advertiser->id}/claim";
    }

    /**
     * AC5 — chaque route d'ÉCRITURE du démarchage exige la prise en charge : un second opérateur qui écrit sur un
     * annonceur pris en charge reçoit 409 `claimed_by_other`, et rien n'est écrit. Une ligne par route ; les tâches 5
     * et 6 ajoutent les leurs : le verbe, le chemin (`{id}` : l'annonceur, ou le message d'accord quand l'état
     * préalable est `message`), le corps (`{annonce}` : l'annonce validée de l'annonceur ; `{capture}` : une image), et cet état préalable.
     *
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>, 3: string}>
     */
    public static function routesDEcriture(): array
    {
        return [
            'la prise en charge elle-même' => ['postJson', '/api/admin/radar/advertisers/{id}/claim', [], 'annonceur'],
            'préparer un message d\'accord' => ['postJson', '/api/admin/radar/advertisers/{id}/outreaches', ['listing_ids' => ['{annonce}']], 'annonce'],
            'retoucher un message d\'accord' => ['patchJson', '/api/admin/radar/outreaches/{id}', ['salutation' => 'Bonjour'], 'message'],
            'marquer un message d\'accord envoyé' => ['postJson', '/api/admin/radar/outreaches/{id}/sent', [], 'message'],
            // Multipart : le verbe `post` (et non `postJson`), `{capture}` devient une vraie image.
            'déposer la réponse d\'un annonceur' => ['post', '/api/admin/radar/outreaches/{id}/reply', ['captures' => ['{capture}']], 'message'],
        ];
    }

    /**
     * L'état préalable d'une ligne de {@see self::routesDEcriture()} : l'identifiant du chemin et le corps résolu.
     *
     * @param  array<string, mixed>  $corps
     * @return array{0: string, 1: array<string, mixed>}
     */
    private function etatPrealable(string $etat, RadarAdvertiser $advertiser, array $corps): array
    {
        $corps = $this->resoudreLesImages($corps);
        if ($etat === 'annonceur') {
            return [(string) $advertiser->id, $corps];
        }
        $annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $advertiser->id]);
        if ($etat === 'annonce') {
            return [(string) $advertiser->id, json_decode(str_replace('"{annonce}"', (string) $annonce->id, (string) json_encode($corps)), true)];
        }
        $message = RadarOutreach::factory()->withListings($annonce)->create(['radar_advertiser_id' => $advertiser->id]);

        return [(string) $message->id, $corps];
    }

    /**
     * `{capture}` → une vraie image : un envoi multipart ne passe pas par `json_encode`.
     *
     * @param  array<string, mixed>  $corps
     * @return array<string, mixed>
     */
    private function resoudreLesImages(array $corps): array
    {
        array_walk_recursive($corps, function (mixed &$valeur): void {
            if ($valeur === '{capture}') {
                $valeur = UploadedFile::fake()->image('reponse.png', 40, 40);
            }
        });

        return $corps;
    }

    /** @param  array<string, mixed>  $corps */
    private function appeler(string $verbe, string $url, array $corps): TestResponse
    {
        return $verbe === 'post'
            ? $this->post($url, $corps, ['Accept' => 'application/json'])
            : $this->{$verbe}($url, $corps);
    }

    /** @return array<string, mixed> ce que les routes d'écriture touchent, pour prouver qu'un refus n'a rien écrit */
    private function etatDesEcritures(): array
    {
        return [
            RadarOutreach::query()->orderBy('id')->get()->map->getAttributes()->all(),
            DB::table('radar_outreach_listing')->orderBy('radar_outreach_id')->orderBy('radar_listing_id')->get()->map(fn ($ligne) => (array) $ligne)->all(),
            RadarListing::query()->orderBy('id')->get()->map->getAttributes()->all(),
            RadarConsent::query()->orderBy('id')->get()->map->getAttributes()->all(),
            DB::table('media')->count(),
            AiSuggestion::query()->count(),
        ];
    }

    /** @param  array<string, mixed>  $corps */
    #[DataProvider('routesDEcriture')]
    public function test_ac5_un_second_operateur_qui_ecrit_sur_un_annonceur_pris_en_charge_recoit_409(string $verbe, string $chemin, array $corps, string $etat): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        [$id, $corps] = $this->etatPrealable($etat, $advertiser, $corps);
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();
        $avant = $advertiser->fresh();
        $ecritures = $this->etatDesEcritures();

        $this->actingAsWithStepUp($this->moussa);
        $this->appeler($verbe, str_replace('{id}', $id, $chemin), $corps)
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.advertiser.claimed_by_other')
            ->assertJsonPath('params.claimed_until', $avant->claim_expires_at->utc()->format('c'));

        $apres = $advertiser->fresh();
        $this->assertSame($this->awa->id, $apres->claimed_by_id);
        $this->assertTrue($apres->claim_expires_at->equalTo($avant->claim_expires_at));
        $this->assertSame($ecritures, $this->etatDesEcritures());
    }

    /**
     * Les routes d'écriture qui EXIGENT une prise : toutes, sauf celle qui la pose.
     *
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>, 3: string}>
     */
    public static function routesExigeantUnePrise(): array
    {
        return array_filter(self::routesDEcriture(), fn (array $ligne) => $ligne[3] !== 'annonceur');
    }

    /**
     * AC5, l'autre moitié — sans AUCUNE prise en charge, chaque route d'écriture rend 409 `claim_required` (la prise
     * elle-même exceptée : c'est elle qui la pose, {@see self::routesExigeantUnePrise()}), et rien n'est écrit.
     *
     * @param  array<string, mixed>  $corps
     */
    #[DataProvider('routesExigeantUnePrise')]
    public function test_ac5_sans_prise_en_charge_une_ecriture_recoit_409_claim_required(string $verbe, string $chemin, array $corps, string $etat): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        [$id, $corps] = $this->etatPrealable($etat, $advertiser, $corps);
        $ecritures = $this->etatDesEcritures();

        $this->actingAsWithStepUp($this->awa);
        $this->appeler($verbe, str_replace('{id}', $id, $chemin), $corps)
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.advertiser.claim_required');

        $this->assertNull($advertiser->fresh()->claimed_by_id);
        $this->assertSame($ecritures, $this->etatDesEcritures());
    }

    public function test_prendre_en_charge_rend_ma_prise_pour_dix_minutes(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);

        $this->postJson($this->url($advertiser))
            ->assertOk()
            ->assertJsonPath('data.claim.mine', true)
            ->assertJsonPath('data.claim.by.id', $this->awa->id)
            ->assertJsonPath('data.claim.by.name', 'Awa Ndiaye')
            ->assertJsonPath('data.claim.until', '2026-10-28T10:10:00+00:00');

        $this->assertSame($this->awa->id, $advertiser->fresh()->claimed_by_id);
    }

    public function test_reprendre_sa_propre_prise_la_prolonge(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();

        Carbon::setTestNow('2026-10-28 10:07:00');
        $this->postJson($this->url($advertiser))->assertOk()->assertJsonPath('data.claim.until', '2026-10-28T10:17:00+00:00');
    }

    public function test_la_prise_encore_active_d_un_autre_rend_409_avec_son_echeance(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();

        $this->actingAsWithStepUp($this->moussa);
        $this->postJson($this->url($advertiser))
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.advertiser.claimed_by_other')
            ->assertJsonPath('params.claimed_until', '2026-10-28T10:10:00+00:00');

        $this->assertSame($this->awa->id, $advertiser->fresh()->claimed_by_id);
    }

    public function test_l_echeance_du_409_est_un_instant_utc_meme_sous_un_autre_fuseau_par_defaut(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();

        $this->actingAsWithStepUp($this->moussa);
        $fuseau = date_default_timezone_get();
        date_default_timezone_set('America/Los_Angeles');
        try {
            $reponse = $this->postJson($this->url($advertiser))->assertStatus(409);
        } finally {
            date_default_timezone_set($fuseau);
        }

        // La forme d'ADR-0018 (`BaseResource::instantOnWire()`), jamais le décalage local.
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/', $reponse->json('params.claimed_until'));
    }

    public function test_la_prise_expire_pile_a_dix_minutes(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();

        // 09 min 59 s : encore à Awa ; 10 min pile : libre, comme `ModerationClaim::isActive()` (échéance strictement future).
        Carbon::setTestNow('2026-10-28 10:09:59');
        $this->actingAsWithStepUp($this->moussa);
        $this->postJson($this->url($advertiser))->assertStatus(409);

        Carbon::setTestNow('2026-10-28 10:10:00');
        $this->postJson($this->url($advertiser))->assertOk()->assertJsonPath('data.claim.mine', true);
    }

    public function test_prendre_et_rendre_ne_touchent_pas_updated_at(): void
    {
        $advertiser = RadarAdvertiser::factory()->create(['updated_at' => '2026-10-01 08:00:00']);
        $this->actingAsWithStepUp($this->awa);

        $this->postJson($this->url($advertiser))->assertOk();
        $this->assertSame('2026-10-01 08:00:00', $advertiser->fresh()->updated_at->format('Y-m-d H:i:s'));
        $this->assertNotNull($advertiser->fresh()->claimed_by_id);

        // Le renouvellement d'un geste (`assertHeld`) non plus.
        Carbon::setTestNow('2026-10-28 10:05:00');
        $this->app->make(AdvertiserClaim::class)->assertHeld($advertiser->fresh(), $this->awa);
        $this->assertSame('2026-10-01 08:00:00', $advertiser->fresh()->updated_at->format('Y-m-d H:i:s'));

        $this->deleteJson($this->url($advertiser))->assertNoContent();
        $this->assertNull($advertiser->fresh()->claimed_by_id);
        $this->assertSame('2026-10-01 08:00:00', $advertiser->fresh()->updated_at->format('Y-m-d H:i:s'));
    }

    public function test_la_prise_expiree_d_un_autre_se_reprend(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();

        Carbon::setTestNow('2026-10-28 10:10:01');
        $this->actingAsWithStepUp($this->moussa);
        $this->postJson($this->url($advertiser))->assertOk()->assertJsonPath('data.claim.mine', true);

        $this->assertSame($this->moussa->id, $advertiser->fresh()->claimed_by_id);
    }

    public function test_rendre_sa_prise_vide_les_colonnes(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();

        $this->deleteJson($this->url($advertiser))->assertNoContent();

        $relu = $advertiser->fresh();
        $this->assertNull($relu->claimed_by_id);
        $this->assertNull($relu->claimed_at);
        $this->assertNull($relu->claim_expires_at);
    }

    public function test_rendre_une_prise_qui_n_existe_pas_ne_fait_rien(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);

        $this->deleteJson($this->url($advertiser))->assertNoContent();
    }

    public function test_rendre_la_prise_active_d_un_autre_rend_409(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson($this->url($advertiser))->assertOk();

        $this->actingAsWithStepUp($this->moussa);
        $this->deleteJson($this->url($advertiser))->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_not_held');

        $this->assertSame($this->awa->id, $advertiser->fresh()->claimed_by_id);

        // Expirée, elle n'est plus à personne : la rendre n'est plus refusé.
        Carbon::setTestNow('2026-10-28 10:11:00');
        $this->deleteJson($this->url($advertiser))->assertNoContent();
    }

    public function test_deux_prises_simultanees_une_seule_gagne(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        // Les deux opérateurs ont lu l'annonceur LIBRE avant que l'un des deux ne prenne.
        $vuParAwa = RadarAdvertiser::query()->findOrFail($advertiser->id);
        $vuParMoussa = RadarAdvertiser::query()->findOrFail($advertiser->id);
        $claim = $this->app->make(AdvertiserClaim::class);

        $claim->claim($vuParAwa, $this->awa);

        try {
            $claim->claim($vuParMoussa, $this->moussa);
            $this->fail('La seconde prise aurait dû être refusée.');
        } catch (ApiError $e) {
            $this->assertSame(409, $e->getStatusCode());
            $this->assertSame('radar.advertiser.claimed_by_other', $e->errorCode);
        }
        $this->assertSame($this->awa->id, $advertiser->fresh()->claimed_by_id);
    }

    public function test_assert_held_exige_une_prise_tenue_et_la_renouvelle(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $claim = $this->app->make(AdvertiserClaim::class);

        // Aucune prise : claim_required.
        try {
            $claim->assertHeld($advertiser, $this->awa);
            $this->fail('Sans prise, le geste aurait dû être refusé.');
        } catch (ApiError $e) {
            $this->assertSame('radar.advertiser.claim_required', $e->errorCode);
        }

        // Tenue par un autre : claimed_by_other.
        $claim->claim($advertiser, $this->moussa);
        try {
            $claim->assertHeld($advertiser->fresh(), $this->awa);
            $this->fail('Une prise d\'un autre aurait dû refuser le geste.');
        } catch (ApiError $e) {
            $this->assertSame('radar.advertiser.claimed_by_other', $e->errorCode);
        }

        // Tenue : le geste passe et la prise est prolongée.
        Carbon::setTestNow('2026-10-28 10:06:00');
        $claim->assertHeld($advertiser->fresh(), $this->moussa);
        $this->assertTrue($advertiser->fresh()->claim_expires_at->equalTo(Carbon::parse('2026-10-28 10:16:00')));

        // Sa propre prise, mais expirée : claim_required (elle ne se reprend pas en silence).
        Carbon::setTestNow('2026-10-28 10:17:00');
        try {
            $claim->assertHeld($advertiser->fresh(), $this->moussa);
            $this->fail('Une prise expirée aurait dû refuser le geste.');
        } catch (ApiError $e) {
            $this->assertSame('radar.advertiser.claim_required', $e->errorCode);
        }
    }

    public function test_un_annonceur_inconnu_rend_404_et_le_viewer_403(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $this->actingAsWithStepUp($this->awa);
        $this->postJson('/api/admin/radar/advertisers/999999/claim')->assertNotFound();

        $this->actingAsWithStepUp($this->operateur(PlatformProfileLevel::Viewer));
        $this->postJson($this->url($advertiser))->assertForbidden();
        $this->deleteJson($this->url($advertiser))->assertForbidden();
        $this->assertNull($advertiser->fresh()->claimed_by_id);
    }
}
