<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\GeoNeighborhood;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0077 §3, §4) — la fiche annonceur en lecture et les files de travail du démarchage : à contacter,
 * en attente, à relancer. Toute lecture se fait sans prise en charge ; la fiche calcule ce qu'elle montre depuis
 * les colonnes enregistrées, elle ne régénère rien.
 */
class RadarAdvertiserCardTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-28 10:00:00');
        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function lue(RadarAdvertiser $annonceur, array $attributes = []): RadarListing
    {
        return RadarListing::factory()->reviewed()->create(
            $attributes + ['radar_advertiser_id' => $annonceur->id],
        );
    }

    public function test_la_fiche_rend_annonces_messages_reponses_et_prise_en_charge(): void
    {
        Storage::fake(config('media-library.disk_name'));
        $quartier = GeoNeighborhood::factory()->create(['name' => 'Ouakam']);
        $annonceur = RadarAdvertiser::factory()->create([
            'phone' => '+221771234567', 'display_name' => 'Awa Fall', 'nature_signals' => [['signal' => 'x', 'evidence' => 'y']],
        ]);
        $lue = RadarListing::factory()->extracted([
            'neighborhood' => ['value' => 'Mermoz', 'neighborhood_id' => $quartier->id],
            'bedrooms' => ['value' => 2],
        ])->create(['radar_advertiser_id' => $annonceur->id, 'stage' => RadarListingStage::Reviewed]);
        $purgee = RadarListing::factory()->create(['radar_advertiser_id' => $annonceur->id, 'stage' => RadarListingStage::Purged]);
        $outreach = RadarOutreach::factory()->withListings($lue)->sent()->create(['radar_advertiser_id' => $annonceur->id, 'created_by_id' => $this->operateur->id]);
        $reponse = RadarConsent::factory()->verified([
            'classification' => 'consent', 'confidence' => 'high', 'number_matches' => true,
            'clauses_found' => [1, 2, 3, 4], 'clauses_complete' => true, 'discordances' => [], 'reply_text' => 'OUI',
        ])->create(['radar_outreach_id' => $outreach->id, 'transcript' => 'Moi : OUI']);
        $media = $reponse->addMedia(UploadedFile::fake()->image('r.jpg'))->withCustomProperties(['sha256' => str_repeat('a', 64)])->toMediaCollection('radar_consent_captures');
        $annonceur->forceFill(['claimed_by_id' => $this->operateur->id, 'claimed_at' => now(), 'claim_expires_at' => now()->addMinutes(10)])->save();

        $data = $this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->assertOk()->json('data');

        $this->assertSame($annonceur->id, $data['id']);
        $this->assertSame('+221771234567', $data['phone']);
        $this->assertSame('Awa Fall', $data['display_name']);
        $this->assertSame([['signal' => 'x', 'evidence' => 'y']], $data['nature_signals']);
        $this->assertTrue($data['claim']['mine']);
        $this->assertSame('2026-10-28T10:10:00+00:00', $data['claim']['until']);

        // La purgée n'y est pas ; la lue porte ses valeurs, le quartier rattaché préféré au texte lu.
        $this->assertSame([$lue->id], array_column($data['listings'], 'id'));
        $this->assertSame(
            ['id' => $lue->id, 'stage' => 'reviewed', 'source_site' => 'other', 'title' => 'Appartement 3 chambres à Mermoz', 'price' => 450000,
                'property_type' => 'apartment', 'contract' => 'rent', 'neighborhood' => 'Ouakam', 'bedrooms' => 2,
                'covered_by_consent' => false, 'created_at' => '2026-10-28T10:00:00+00:00'],
            $data['listings'][0],
        );

        $message = $data['outreaches'][0];
        $this->assertSame($outreach->id, $message['id']);
        $this->assertSame('sent', $message['status']);
        $this->assertSame([$lue->id], $message['listing_ids']);
        $this->assertSame('accord.v1', $message['clauses_version']);
        $this->assertSame($outreach->message, $message['message']);
        $this->assertSame(['id' => $this->operateur->id, 'name' => $this->operateur->nameWithoutContact()], $message['created_by']);
        $this->assertNull($message['wa_me_url']);
        $this->assertNull($message['outcome']);

        $recu = $message['consents'][0];
        $this->assertSame($reponse->id, $recu['id']);
        $this->assertSame('screenshot', $recu['proof']);
        $this->assertSame('done', $recu['verification_status']);
        $this->assertSame('consent', $recu['verdict']['classification']);
        $this->assertSame('Moi : OUI', $recu['transcript']);
        $this->assertNull($recu['confirmed_by']);
        $this->assertSame($media->id, $recu['captures'][0]['id']);
        $this->assertSame(str_repeat('a', 64), $recu['captures'][0]['sha256']);
        $this->assertStringContainsString('signature=', $recu['captures'][0]['url']);
        $this->assertNotSame($purgee->id, $data['listings'][0]['id']);
    }

    public function test_une_annonce_couverte_par_un_accord_confirme_le_dit(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $couverte = $this->lue($annonceur);
        $autre = $this->lue($annonceur);
        $outreach = RadarOutreach::factory()->withListings($couverte)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $consent = RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $outreach->id]);

        $couvertes = fn () => collect($this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->json('data.listings'))
            ->where('covered_by_consent', true)->pluck('id')->all();

        $this->assertSame([$couverte->id], $couvertes());

        // Un accord révoqué ne couvre plus rien.
        $consent->forceFill(['revoked_at' => now()])->save();
        $this->assertSame([], $couvertes());
        $this->assertNotNull($autre);
    }

    public function test_le_statut_d_un_message_est_prepare_envoye_ou_clos(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $prepare = RadarOutreach::factory()->create(['radar_advertiser_id' => $annonceur->id]);
        $envoye = RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $clos = RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $annonceur->id, 'outcome' => 'refused', 'outcome_at' => now()]);
        $question = RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $annonceur->id, 'outcome' => 'question', 'outcome_at' => now()]);

        $statuts = collect($this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->json('data.outreaches'))->pluck('status', 'id');

        $this->assertSame('prepared', $statuts[$prepare->id]);
        $this->assertSame('sent', $statuts[$envoye->id]);
        $this->assertSame('closed', $statuts[$clos->id]);
        // `question` n'est pas final : une réponse déposée plus tard peut encore le changer.
        $this->assertSame('sent', $statuts[$question->id]);
    }

    public function test_un_message_a_relancer_porte_son_echeance(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $listing = $this->lue($annonceur, ['stage' => RadarListingStage::Contacted]);
        $outreach = RadarOutreach::factory()->withListings($listing)->create(['radar_advertiser_id' => $annonceur->id, 'sent_at' => now()->subDays(4), 'follow_up_rank' => 2]);
        $ferme = RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $annonceur->id]);

        $messages = collect($this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->json('data.outreaches'))->keyBy('id');

        $this->assertSame(['due_at' => '2026-10-27T10:00:00+00:00', 'propose_no_answer' => true], $messages[$outreach->id]['follow_up']);
        $this->assertNull($messages[$ferme->id]['follow_up']);
    }

    public function test_la_fiche_ne_rend_pas_de_prise_expiree(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $annonceur->forceFill(['claimed_by_id' => User::factory()->create()->id, 'claimed_at' => now()->subMinutes(20), 'claim_expires_at' => now()->subMinutes(10)])->save();

        $this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->assertOk()->assertJsonPath('data.claim', null);
    }

    public function test_la_prise_d_un_autre_se_lit_sans_etre_la_mienne(): void
    {
        $autre = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Sow']);
        $annonceur = RadarAdvertiser::factory()->create();
        $annonceur->forceFill(['claimed_by_id' => $autre->id, 'claimed_at' => now(), 'claim_expires_at' => now()->addMinutes(5)])->save();

        $this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")
            ->assertOk()
            ->assertJsonPath('data.claim.mine', false)
            ->assertJsonPath('data.claim.by', ['id' => $autre->id, 'name' => 'Moussa Sow']);
    }

    public function test_un_annonceur_inconnu_rend_404(): void
    {
        $this->getJson('/api/admin/radar/advertisers/999999')->assertNotFound();
    }

    // --- Les files --------------------------------------------------------------------------------

    /** @return list<int> */
    private function file(string $queue): array
    {
        return array_column($this->getJson("/api/admin/radar/advertisers?filter[queue]={$queue}")->assertOk()->json('data'), 'id');
    }

    public function test_la_file_a_contacter_veut_une_annonce_lue_et_un_annonceur_joignable(): void
    {
        $pret = RadarAdvertiser::factory()->create();
        $this->lue($pret);
        $sansLue = RadarAdvertiser::factory()->create();
        RadarListing::factory()->extracted()->create(['radar_advertiser_id' => $sansLue->id]);
        $refuse = RadarAdvertiser::factory()->doNotContact()->create();
        $this->lue($refuse);

        $this->assertSame([$pret->id], $this->file('to_contact'));
    }

    public function test_les_files_en_attente_et_a_relancer_se_separent_a_l_echeance(): void
    {
        $attend = RadarAdvertiser::factory()->create();
        $du = RadarAdvertiser::factory()->create();
        foreach ([[$attend, 2], [$du, 3]] as [$annonceur, $jours]) {
            $listing = $this->lue($annonceur, ['stage' => RadarListingStage::Contacted]);
            RadarOutreach::factory()->withListings($listing)->create(['radar_advertiser_id' => $annonceur->id, 'sent_at' => now()->subDays($jours)]);
        }

        $this->assertSame([$attend->id], $this->file('awaiting'));
        $this->assertSame([$du->id], $this->file('follow_up'));
    }

    public function test_une_ligne_de_file_porte_ses_comptes_et_son_message_ouvert(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $this->lue($annonceur);
        $contactee = $this->lue($annonceur, ['stage' => RadarListingStage::Contacted]);
        $this->lue($annonceur, ['stage' => RadarListingStage::Consented]);
        $outreach = RadarOutreach::factory()->withListings($contactee)->create(['radar_advertiser_id' => $annonceur->id, 'sent_at' => now()->subDays(4), 'follow_up_rank' => 1]);

        $ligne = $this->getJson('/api/admin/radar/advertisers')->assertOk()->json('data.0');

        $this->assertSame(['reviewed' => 1, 'contacted' => 1, 'consented' => 1], $ligne['counts']);
        $this->assertSame([
            'outreach_id' => $outreach->id, 'sent_at' => '2026-10-24T10:00:00+00:00', 'due_at' => '2026-10-27T10:00:00+00:00',
            'rank' => 1, 'propose_no_answer' => false,
        ], $ligne['follow_up']);
        $this->assertNull($ligne['claim']);
        $this->assertArrayNotHasKey('listings', $ligne);
    }

    public function test_une_ligne_sans_message_ouvert_n_a_pas_de_relance(): void
    {
        RadarAdvertiser::factory()->create();

        $this->getJson('/api/admin/radar/advertisers')->assertOk()->assertJsonPath('data.0.follow_up', null);
    }

    public function test_la_recherche_par_nom_replie_la_casse_des_lettres_accentuees(): void
    {
        $eloi = RadarAdvertiser::factory()->create(['display_name' => 'Élodie Sarr']);
        RadarAdvertiser::factory()->create(['display_name' => 'Moussa Sow']);

        $ids = fn (string $q) => array_column($this->getJson('/api/admin/radar/advertisers?filter[search]='.rawurlencode($q))->assertOk()->json('data'), 'id');

        $this->assertSame([$eloi->id], $ids('ÉLODIE'));
        $this->assertSame([$eloi->id], $ids('élodie sa'));
    }

    public function test_la_recherche_par_numero_accepte_l_ecriture_du_terrain(): void
    {
        $awa = RadarAdvertiser::factory()->create(['phone' => '+221771234567']);
        RadarAdvertiser::factory()->create(['phone' => '+221781234567']);

        $ids = fn (string $q) => array_column($this->getJson('/api/admin/radar/advertisers?filter[search]='.rawurlencode($q))->assertOk()->json('data'), 'id');

        $this->assertSame([$awa->id], $ids('77 123 45 67'));
        $this->assertSame([$awa->id], $ids('+221771234567'));
    }

    public function test_un_sparse_fieldset_n_invente_rien(): void
    {
        $annonceur = RadarAdvertiser::factory()->create(['display_name' => 'Awa']);

        $ligne = $this->getJson('/api/admin/radar/advertisers?fields[radar_advertisers]=id,display_name')->assertOk()->json('data.0');

        $this->assertSame($annonceur->id, $ligne['id']);
        $this->assertSame('Awa', $ligne['display_name']);
        foreach (['phone', 'nature', 'do_not_contact_at', 'claim'] as $cle) {
            $this->assertArrayNotHasKey($cle, $ligne, $cle);
        }
    }

    public function test_une_file_inconnue_ne_rend_rien(): void
    {
        $this->lue(RadarAdvertiser::factory()->create());

        $this->assertSame([], $this->file('nope'));
    }

    public function test_la_liste_se_pagine_par_derniere_activite(): void
    {
        $ancien = RadarAdvertiser::factory()->create(['updated_at' => now()->subDay()]);
        $recent = RadarAdvertiser::factory()->create(['updated_at' => now()]);

        $reponse = $this->getJson('/api/admin/radar/advertisers?per_page=1')->assertOk();

        $this->assertSame([$recent->id], array_column($reponse->json('data'), 'id'));
        $this->assertSame(2, $reponse->json('meta.total'));
        $this->assertNotNull($ancien);
    }

    public function test_viewer_403_support_200_sur_les_quatre_routes(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $routes = [
            ['getJson', '/api/admin/radar/advertisers'],
            ['getJson', "/api/admin/radar/advertisers/{$annonceur->id}"],
            ['postJson', "/api/admin/radar/advertisers/{$annonceur->id}/claim"],
            ['deleteJson', "/api/admin/radar/advertisers/{$annonceur->id}/claim"],
        ];

        $this->actingAsWithStepUp($this->operateur(PlatformProfileLevel::Viewer));
        foreach ($routes as [$verbe, $url]) {
            $this->{$verbe}($url)->assertForbidden()->assertJsonPath('code', 'platform.ability_missing');
        }

        $this->actingAsWithStepUp($this->operateur(PlatformProfileLevel::Support));
        foreach ($routes as [$verbe, $url]) {
            $this->assertContains($this->{$verbe}($url)->getStatusCode(), [200, 204], $url);
        }
    }
}
