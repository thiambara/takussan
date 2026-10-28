<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarConsentMessage;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ConsentMessageComposer;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Ai\Exceptions\RateLimitedException;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0077 §3, §4, §11) — préparer, retoucher et envoyer le message d'accord. Le texte enregistré EST
 * celui du lien `wa.me` ; chaque geste exige la prise en charge de l'annonceur et rejuge ses règles sous verrou.
 * Aucun réseau ni modèle : `RadarConsentMessage::fake()`.
 */
class RadarOutreachTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-28 10:00:00');
        $this->installerSocleDEssai();
        config(['ai.roles.redaction' => [['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 1000]]]);
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        config(['app.frontend_url' => 'https://front.exemple.test']);

        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function modeleRepond(string $salutation = 'Bonjour Awa,', string $resume = 'votre appartement à Ouakam'): void
    {
        RadarConsentMessage::fake(fn () => ['salutation' => $salutation, 'resume' => $resume]);
    }

    private function annonceur(array $attributes = []): RadarAdvertiser
    {
        return RadarAdvertiser::factory()->create($attributes + ['phone' => '+221771234567', 'display_name' => 'Awa Fall']);
    }

    private function prise(RadarAdvertiser $annonceur): RadarAdvertiser
    {
        $this->postJson("/api/admin/radar/advertisers/{$annonceur->id}/claim")->assertOk();

        return $annonceur;
    }

    private function lue(RadarAdvertiser $annonceur, string $stage = 'reviewed'): RadarListing
    {
        return RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $annonceur->id, 'stage' => $stage]);
    }

    /** @param  array<string, mixed>  $corps */
    private function preparer(RadarAdvertiser $annonceur, array $corps): TestResponse
    {
        return $this->postJson("/api/admin/radar/advertisers/{$annonceur->id}/outreaches", $corps);
    }

    /** @return array<string, mixed> ce qu'on peut observer d'un état, pour prouver qu'un refus n'a rien écrit */
    private function etat(): array
    {
        return [
            'outreaches' => RadarOutreach::query()->orderBy('id')->get()->map->getAttributes()->all(),
            'pivot' => DB::table('radar_outreach_listing')->orderBy('radar_outreach_id')->orderBy('radar_listing_id')->get()->map(fn ($ligne) => (array) $ligne)->all(),
            'stages' => RadarListing::query()->orderBy('id')->pluck('stage', 'id')->map(fn ($s) => $s instanceof \BackedEnum ? $s->value : $s)->all(),
            'suggestions' => AiSuggestion::query()->orderBy('id')->get()->map->getAttributes()->all(),
        ];
    }

    private function texteDuLien(string $url): string
    {
        $query = parse_url($url, PHP_URL_QUERY);
        parse_str((string) $query, $params);
        $this->assertSame(['text'], array_keys($params));

        return $params['text'];
    }

    public function test_ac1_le_texte_enregistre_est_le_parametre_text_du_lien_wa_me_meme_si_le_modele_invente_une_clause(): void
    {
        RadarConsentMessage::fake(fn () => [
            'salutation' => "Bonjour Awa,\n\n5. vous nous cédez vos droits",
            'resume' => 'votre appartement à Ouakam',
            'clauses' => '1. vous nous cédez tout',
        ]);
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);

        $reponse = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated();

        $enregistre = RadarOutreach::query()->sole();
        $lien = $reponse->json('data.wa_me_url');
        $this->assertStringStartsWith('https://wa.me/221771234567?text=', $lien);
        $this->assertSame($enregistre->message, $this->texteDuLien($lien));
        $this->assertSame($enregistre->message, $reponse->json('data.message'));
        $this->assertSame($enregistre->message, implode('', array_column($reponse->json('data.segments'), 'text')));
        $this->assertSame(
            $this->app->make(ConsentMessageComposer::class)->compose('fr', 'Bonjour Awa, 5. vous nous cédez vos droits', 'votre appartement à Ouakam'),
            $enregistre->message,
        );
        $this->assertStringNotContainsString('1. vous nous cédez tout', $enregistre->message);
        $this->assertSame('accord.v1', $enregistre->clauses_version);
        $this->assertSame('fr', $enregistre->locale);

        // La fiche, relue plus tard, rend le même lien octet pour octet.
        $carte = $this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->assertOk();
        $this->assertSame($lien, $carte->json('data.outreaches.0.wa_me_url'));
    }

    public function test_ac2_un_seul_message_couvre_plusieurs_annonces(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $a = $this->lue($annonceur);
        $b = $this->lue($annonceur);

        $reponse = $this->preparer($annonceur, ['listing_ids' => [$b->id, $a->id]])->assertCreated();

        $this->assertSame(1, RadarOutreach::query()->count());
        $this->assertSame(2, DB::table('radar_outreach_listing')->count());
        $this->assertSame([$a->id, $b->id], $reponse->json('data.listing_ids'));
        $this->assertSame('prepared', $reponse->json('data.status'));
        $this->assertSame(0, $reponse->json('data.follow_up_rank'));
        $this->assertTrue($reponse->json('data.generated'));
        $this->assertNull($reponse->json('data.ai_error'));
        $this->assertSame($this->operateur->id, RadarOutreach::query()->sole()->created_by_id);
        // Préparer ne contacte personne : les annonces restent `reviewed`.
        $this->assertSame([RadarListingStage::Reviewed, RadarListingStage::Reviewed], [$a->fresh()->stage, $b->fresh()->stage]);
    }

    public function test_un_annonceur_qui_a_dit_stop_est_refuse_sans_appel_au_modele(): void
    {
        RadarConsentMessage::fake();
        $annonceur = $this->prise($this->annonceur()->forceFill(['phone' => null, 'do_not_contact_at' => now()]));
        $annonceur->save();
        $annonce = $this->lue($annonceur);
        $avant = $this->etat();

        $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.advertiser.do_not_contact');

        RadarConsentMessage::assertNeverPrompted();
        $this->assertSame($avant, $this->etat());
    }

    public function test_sans_prise_en_charge_le_modele_n_est_pas_appele(): void
    {
        RadarConsentMessage::fake();
        $annonceur = $this->annonceur();
        $annonce = $this->lue($annonceur);
        $avant = $this->etat();

        $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.advertiser.claim_required');

        RadarConsentMessage::assertNeverPrompted();
        $this->assertSame($avant, $this->etat());
    }

    public function test_une_annonce_non_validee_ou_d_un_autre_annonceur_est_refusee(): void
    {
        RadarConsentMessage::fake();
        $annonceur = $this->prise($this->annonceur());
        $autre = $this->annonceur(['phone' => '+221781112233']);
        $extraite = RadarListing::factory()->extracted()->create(['radar_advertiser_id' => $annonceur->id]);
        $ecartee = $this->lue($annonceur, 'discarded');
        $etrangere = $this->lue($autre);
        $bonne = $this->lue($annonceur);
        $avant = $this->etat();

        $this->preparer($annonceur, ['listing_ids' => [$bonne->id, $extraite->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.listing_not_ready');
        $this->preparer($annonceur, ['listing_ids' => [$bonne->id, $ecartee->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.listing_not_ready');
        $this->preparer($annonceur, ['listing_ids' => [$bonne->id, $etrangere->id]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.outreach.listing_foreign')
            ->assertJsonPath('params.listing_ids', [$etrangere->id]);
        $this->preparer($annonceur, ['listing_ids' => [$bonne->id, 999999]])->assertStatus(422)->assertJsonValidationErrors(['listing_ids.1']);

        RadarConsentMessage::assertNeverPrompted();
        $this->assertSame($avant, $this->etat());
    }

    public function test_une_annonce_deja_couverte_par_un_accord_valide_est_refusee_et_un_accord_non_confirme_ne_couvre_rien(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $couverte = $this->lue($annonceur);
        $envoye = RadarOutreach::factory()->withListings($couverte)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $accord = RadarConsent::factory()->verified(['covers_all' => true])->create(['radar_outreach_id' => $envoye->id, 'radar_advertiser_id' => $annonceur->id]);

        // Vérifié par l'IA, jamais confirmé par un humain : ne couvre rien.
        $this->preparer($annonceur, ['listing_ids' => [$couverte->id]])->assertCreated();

        // Confirmé : couvert.
        $accord->forceFill(['confirmed_by_id' => $this->operateur->id, 'confirmed_at' => now()])->save();
        $this->preparer($annonceur, ['listing_ids' => [$couverte->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.listing_consented');

        // Révoqué : à nouveau libre.
        $accord->forceFill(['revoked_at' => now()])->save();
        $this->preparer($annonceur, ['listing_ids' => [$couverte->id]])->assertCreated();
    }

    public function test_les_regles_sont_rejugees_sous_verrou_apres_l_appel_au_modele(): void
    {
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $avant = $this->etat();

        // Pendant que le modèle répond, l'annonceur dit STOP.
        RadarConsentMessage::fake(function () use ($annonceur) {
            RadarAdvertiser::query()->whereKey($annonceur->id)->update(['phone' => null, 'do_not_contact_at' => now()]);

            return ['salutation' => 'Bonjour,', 'resume' => 'votre bien'];
        });
        $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');
        $this->assertSame($avant, $this->etat());

        // Pendant que le modèle répond, l'annonce est écartée.
        RadarAdvertiser::query()->whereKey($annonceur->id)->update(['do_not_contact_at' => null]);
        $avant = $this->etat();
        RadarConsentMessage::fake(function () use ($annonce) {
            RadarListing::query()->whereKey($annonce->id)->update(['stage' => RadarListingStage::Discarded->value]);

            return ['salutation' => 'Bonjour,', 'resume' => 'votre bien'];
        });
        $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.listing_not_ready');
        $this->assertSame(0, RadarOutreach::query()->count());
        $this->assertSame(0, AiSuggestion::query()->count());
    }

    public function test_la_prise_est_rejugee_sous_verrou_apres_l_appel_au_modele(): void
    {
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $autre = $this->operateur(PlatformProfileLevel::Support);

        // Pendant que le modèle répond, la prise expire et un autre opérateur la prend.
        RadarConsentMessage::fake(function () use ($annonceur, $autre) {
            RadarAdvertiser::query()->whereKey($annonceur->id)->update([
                'claimed_by_id' => $autre->id, 'claimed_at' => now(), 'claim_expires_at' => now()->addMinutes(10),
            ]);

            return ['salutation' => 'Bonjour,', 'resume' => 'votre bien'];
        });

        $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])
            ->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claimed_by_other');
        $this->assertSame(0, RadarOutreach::query()->count());
    }

    public function test_un_second_message_remplace_le_message_prepare_et_sa_suggestion_mais_pas_un_message_envoye(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $a = $this->lue($annonceur);
        $b = $this->lue($annonceur);
        $envoye = RadarOutreach::factory()->withListings($b)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $suggestionEnvoyee = AiSuggestion::query()->create([
            'usage_key' => 'radar.message_accord', 'subject_type' => $envoye->getMorphClass(), 'subject_id' => $envoye->id,
            'proposal' => ['salutation' => 'x', 'resume' => 'y'], 'decision' => AiSuggestionDecision::Pending,
        ]);

        $premier = $this->preparer($annonceur, ['listing_ids' => [$a->id]])->assertCreated()->json('data.id');
        $this->assertSame(1, AiSuggestion::query()->where('subject_id', $premier)->count());

        $second = $this->preparer($annonceur, ['listing_ids' => [$a->id]])->assertCreated()->json('data.id');

        $this->assertNull(RadarOutreach::query()->find($premier));
        $this->assertSame(0, AiSuggestion::query()->where('subject_id', $premier)->where('subject_type', $envoye->getMorphClass())->count());
        $this->assertSame(0, DB::table('radar_outreach_listing')->where('radar_outreach_id', $premier)->count());
        $this->assertNotNull(RadarOutreach::query()->find($second));
        $this->assertNotNull(RadarOutreach::query()->find($envoye->id));
        $this->assertNotNull($suggestionEnvoyee->fresh());
        $this->assertSame(2, RadarOutreach::query()->count());
    }

    public function test_une_panne_du_modele_laisse_les_parties_vides_et_l_operateur_les_ecrit(): void
    {
        RadarConsentMessage::fake(fn () => throw RateLimitedException::forProvider('anthropic'));
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);

        $reponse = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])
            ->assertCreated()
            ->assertJsonPath('data.generated', false)
            ->assertJsonPath('data.ai_error', 'ai.providers_unavailable')
            ->assertJsonPath('data.salutation', '')
            ->assertJsonPath('data.summary', '')
            ->assertJsonPath('data.wa_me_url', null);
        $id = $reponse->json('data.id');
        $this->assertSame(0, AiSuggestion::query()->count());

        // Envoyer sans les deux parties : refusé.
        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.parts_missing');
        $this->assertNull(RadarOutreach::query()->find($id)->sent_at);

        // L'opérateur les écrit : le lien existe, l'envoi passe, aucune suggestion à décider.
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => 'Bonjour Awa,', 'resume' => 'votre appartement'])
            ->assertOk()
            ->assertJsonPath('data.wa_me_url', fn ($url) => is_string($url) && str_starts_with($url, 'https://wa.me/221771234567?text='));
        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")->assertOk()->assertJsonPath('data.status', 'sent');
        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
    }

    public function test_retoucher_recompose_le_message_et_le_texte_enregistre_reste_celui_du_lien(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');
        // L'origine du front change entre la préparation et la retouche : le lien des conditions suit celle d'aujourd'hui.
        config(['app.frontend_url' => 'https://autre.exemple.test']);

        $reponse = $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => "Bonsoir Madame\nFall,", 'resume' => 'votre F3 à Mermoz'])->assertOk();

        $enregistre = RadarOutreach::query()->findOrFail($id);
        $this->assertSame('Bonsoir Madame Fall,', $enregistre->salutation);
        $this->assertSame('votre F3 à Mermoz', $enregistre->summary);
        $this->assertSame(
            $this->app->make(ConsentMessageComposer::class)->compose('fr', 'Bonsoir Madame Fall,', 'votre F3 à Mermoz', 'accord.v1'),
            $enregistre->message,
        );
        $this->assertSame($enregistre->message, $this->texteDuLien($reponse->json('data.wa_me_url')));
        $this->assertSame($enregistre->message, implode('', array_column($reponse->json('data.segments'), 'text')));
        $this->assertStringContainsString('https://autre.exemple.test/fr/legal/terms', $enregistre->message);

        // Une seule partie : l'autre ne bouge pas.
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['resume' => 'votre studio'])->assertOk();
        $this->assertSame('Bonsoir Madame Fall,', $enregistre->fresh()->salutation);
        $this->assertSame('votre studio', $enregistre->fresh()->summary);
    }

    public function test_retoucher_recompose_avec_la_version_de_clauses_enregistree(): void
    {
        // Une version ANTÉRIEURE, posée le temps du test : un message préparé avec elle ne se réécrit pas avec la version courante.
        $fichier = resource_path('radar/clauses/accord.v0.fr.md');
        file_put_contents($fichier, "{salutation} CLAUSES-V0 {resume} {lien_conditions}\n");
        try {
            $annonceur = $this->prise($this->annonceur());
            $annonce = $this->lue($annonceur);
            $ancien = RadarOutreach::factory()->withListings($annonce)->create([
                'radar_advertiser_id' => $annonceur->id, 'clauses_version' => 'accord.v0', 'salutation' => '', 'summary' => '', 'message' => 'x',
            ]);

            $this->patchJson("/api/admin/radar/outreaches/{$ancien->id}", ['salutation' => 'Bonjour,', 'resume' => 'votre bien'])
                ->assertOk()
                ->assertJsonPath('data.clauses_version', 'accord.v0');

            $enregistre = $ancien->fresh();
            $this->assertSame('Bonjour, CLAUSES-V0 votre bien https://front.exemple.test/fr/legal/terms', $enregistre->message);
            $this->assertSame('accord.v0', $enregistre->clauses_version);
            $this->assertSame($enregistre->message, $this->texteDuLien($this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->json('data.outreaches.0.wa_me_url')));
        } finally {
            unlink($fichier);
        }
    }

    public function test_une_partie_qui_se_reduit_a_rien_est_refusee_a_la_retouche(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');
        $avant = RadarOutreach::query()->findOrFail($id)->getAttributes();

        // Que des caractères invisibles : passe la validation (le trim du framework ne retire pas l'inversion de sens),
        // mais tombe à rien une fois ramené à une ligne. Un U+200B seul, lui, est déjà refusé par `required`.
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => "\u{200B}\u{202E}"])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.parts_missing')->assertJsonPath('params.fields', ['salutation']);
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => 'Bonjour,', 'resume' => "\u{202E}"])
            ->assertStatus(422)->assertJsonPath('params.fields', ['resume']);

        $this->assertSame($avant, RadarOutreach::query()->findOrFail($id)->getAttributes());
        $this->assertSame(0, Activity::query()->where('event', 'radar_outreach_retouched')->count());
    }

    public function test_retoucher_exige_un_message_prepare_une_prise_et_un_champ(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');

        $this->patchJson("/api/admin/radar/outreaches/{$id}", [])->assertStatus(422)->assertJsonPath('code', 'radar.outreach.nothing_to_update');
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => '   '])->assertStatus(422);
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['resume' => str_repeat('a', 1501)])->assertStatus(422);

        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")->assertOk();
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => 'Bonjour'])
            ->assertStatus(409)->assertJsonPath('code', 'radar.outreach.not_prepared');
    }

    public function test_envoyer_passe_les_annonces_a_contactee_et_decide_la_suggestion_une_fois(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $a = $this->lue($annonceur);
        $b = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$a->id, $b->id]])->assertCreated()->json('data.id');

        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")
            ->assertOk()
            ->assertJsonPath('data.status', 'sent')
            ->assertJsonPath('data.wa_me_url', null);

        $message = RadarOutreach::query()->findOrFail($id);
        $this->assertNotNull($message->sent_at);
        $this->assertSame($this->operateur->id, $message->sent_by_id);
        $this->assertSame([RadarListingStage::Contacted, RadarListingStage::Contacted], [$a->fresh()->stage, $b->fresh()->stage]);
        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame(AiSuggestionDecision::Accepted, $suggestion->decision);
        $this->assertSame($this->operateur->id, $suggestion->decided_by_id);

        // Deux envois : le second est refusé, rien ne bouge.
        $avant = $this->etat();
        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")->assertStatus(409)->assertJsonPath('code', 'radar.outreach.not_prepared');
        $this->assertSame($avant, $this->etat());
    }

    public function test_envoyer_un_message_retouche_decide_la_suggestion_editee_avec_son_differentiel(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['resume' => 'votre studio à Ouakam'])->assertOk();

        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")->assertOk();

        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame(AiSuggestionDecision::Edited, $suggestion->decision);
        $this->assertEquals(['resume' => ['from' => 'votre appartement à Ouakam', 'to' => 'votre studio à Ouakam']], $suggestion->correction_diff);
        $this->assertEquals(['salutation' => 'Bonjour Awa,', 'resume' => 'votre studio à Ouakam'], $suggestion->final_value);
    }

    public function test_envoyer_refuse_une_annonce_qui_n_est_plus_a_l_etape_et_ne_change_rien(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $a = $this->lue($annonceur);
        $b = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$a->id, $b->id]])->assertCreated()->json('data.id');
        RadarListing::query()->whereKey($b->id)->update(['stage' => RadarListingStage::Discarded->value]);
        $avant = $this->etat();

        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.listing.stage_conflict')
            ->assertJsonPath('params.stage', 'discarded')
            ->assertJsonPath('params.listing_id', $b->id);

        $this->assertSame($avant, $this->etat());
        $this->assertNull(RadarOutreach::query()->findOrFail($id)->sent_at);
    }

    public function test_envoyer_a_un_annonceur_qui_a_dit_stop_est_refuse(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');
        RadarAdvertiser::query()->whereKey($annonceur->id)->update(['phone' => null, 'do_not_contact_at' => now()]);

        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');
        $this->assertNull(RadarOutreach::query()->findOrFail($id)->sent_at);
    }

    public function test_une_relance_reprend_les_annonces_encore_contactees_au_rang_suivant(): void
    {
        $this->modeleRepond('Bonjour Awa, un rappel', 'votre appartement à Ouakam');
        $annonceur = $this->prise($this->annonceur());
        $contactee = $this->lue($annonceur, 'contacted');
        $acceptee = $this->lue($annonceur, 'consented');
        $origine = RadarOutreach::factory()->withListings($contactee, $acceptee)->sent()->create(['radar_advertiser_id' => $annonceur->id]);

        $reponse = $this->preparer($annonceur, ['follow_up_of_id' => $origine->id])->assertCreated();

        $this->assertSame(1, $reponse->json('data.follow_up_rank'));
        $this->assertSame($origine->id, $reponse->json('data.follow_up_of_id'));
        $this->assertSame([$contactee->id], $reponse->json('data.listing_ids'));
        $this->assertSame(1, RadarOutreach::query()->findOrFail($reponse->json('data.id'))->follow_up_rank);

        // Une relance prête se remplace elle-même : la même cible, un nouveau brouillon, un seul message préparé.
        $second = $this->preparer($annonceur, ['follow_up_of_id' => $origine->id])->assertCreated();
        $this->assertNull(RadarOutreach::query()->find($reponse->json('data.id')));
        $this->assertSame($origine->id, $second->json('data.follow_up_of_id'));

        // L'envoi de la relance fait passer ses annonces par `contacted` (déjà le cas) et la fiche rend le rang.
        $this->postJson('/api/admin/radar/outreaches/'.$second->json('data.id').'/sent')->assertOk();
        $this->assertSame(RadarListingStage::Contacted, $contactee->fresh()->stage);
    }

    public function test_une_relance_se_refuse_hors_des_regles_de_la_chaine(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $autre = $this->annonceur(['phone' => '+221781112233']);
        $annonce = $this->lue($annonceur, 'contacted');

        $nonEnvoye = RadarOutreach::factory()->withListings($annonce)->create(['radar_advertiser_id' => $annonceur->id]);
        $this->preparer($annonceur, ['follow_up_of_id' => $nonEnvoye->id])->assertStatus(422)->assertJsonPath('code', 'radar.outreach.follow_up_invalid');
        $nonEnvoye->delete();

        $clos = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id, 'outcome' => 'refused', 'outcome_at' => now()]);
        $this->preparer($annonceur, ['follow_up_of_id' => $clos->id])->assertStatus(422)->assertJsonPath('code', 'radar.outreach.follow_up_invalid');
        $clos->delete();

        $etranger = RadarOutreach::factory()->withListings($this->lue($autre, 'contacted'))->sent()->create(['radar_advertiser_id' => $autre->id]);
        $this->preparer($annonceur, ['follow_up_of_id' => $etranger->id])->assertStatus(422)->assertJsonPath('code', 'radar.outreach.follow_up_invalid');

        $origine = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        RadarOutreach::factory()->withListings($annonce)->sent()->followUpOf($origine)->create();
        // Déjà relancé : seule la dernière de la chaîne se relance.
        $this->preparer($annonceur, ['follow_up_of_id' => $origine->id])->assertStatus(422)->assertJsonPath('code', 'radar.outreach.follow_up_invalid');

    }

    public function test_les_listes_d_annonces_et_une_relance_ne_se_donnent_pas_ensemble(): void
    {
        RadarConsentMessage::fake();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur, 'contacted');
        // Une cible VALIDE : sans la règle `prohibits`, la relance serait acceptée — le 422 ne vient que d'elle.
        $origine = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $avant = $this->etat();

        $this->preparer($annonceur, ['follow_up_of_id' => $origine->id, 'listing_ids' => [$annonce->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['listing_ids']);

        $this->assertSame($avant, $this->etat());
        RadarConsentMessage::assertNeverPrompted();
    }

    public function test_un_premier_message_est_refuse_sur_une_annonce_d_une_chaine_ouverte(): void
    {
        RadarConsentMessage::fake();
        $annonceur = $this->prise($this->annonceur());
        $contactee = $this->lue($annonceur, 'contacted');
        $autre = $this->lue($annonceur);
        RadarOutreach::factory()->withListings($contactee)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $avant = $this->etat();

        // Envoyé, sans issue : la seule façon d'écrire de nouveau est une relance.
        $this->preparer($annonceur, ['listing_ids' => [$autre->id, $contactee->id]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.outreach.listing_pending')
            ->assertJsonPath('params.listing_id', $contactee->id);

        $this->assertSame($avant, $this->etat());
        RadarConsentMessage::assertNeverPrompted();
    }

    public function test_un_brouillon_de_relance_ne_rouvre_pas_la_voie_d_un_premier_message(): void
    {
        $this->modeleRepond('Bonjour Awa, un rappel', 'votre appartement à Ouakam');
        $annonceur = $this->prise($this->annonceur());
        $contactee = $this->lue($annonceur, 'contacted');
        $origine = RadarOutreach::factory()->withListings($contactee)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        // La relance est préparée, jamais envoyée : la chaîne de l'origine reste ouverte.
        $this->preparer($annonceur, ['follow_up_of_id' => $origine->id])->assertCreated();
        // Le brouillon a déjà appelé le modèle : on compte les appels À PARTIR d'ici.
        $appels = 0;
        RadarConsentMessage::fake(function () use (&$appels) {
            $appels++;

            return ['salutation' => 'Bonjour Awa,', 'resume' => 'votre appartement à Ouakam'];
        });
        $avant = $this->etat();

        $this->preparer($annonceur, ['listing_ids' => [$contactee->id]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.outreach.listing_pending')
            ->assertJsonPath('params.listing_id', $contactee->id);

        $this->assertSame($avant, $this->etat());
        $this->assertSame(0, $appels);
    }

    public function test_envoyer_refuse_une_annonce_passee_a_un_autre_annonceur_depuis_la_preparation(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $autre = $this->annonceur(['phone' => '+221781112233', 'display_name' => 'Moussa Ba']);
        // Le numéro de l'autre annonceur est connu de l'annonce (écarté à l'extraction) : la fiche peut la lui donner.
        $annonce = RadarListing::factory()->extracted(['phones' => ['+221771234567'], 'phones_dropped' => ['+221781112233']])
            ->create(['radar_advertiser_id' => $annonceur->id, 'stage' => RadarListingStage::Reviewed]);
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');

        $this->putJson("/api/admin/radar/listings/{$annonce->id}/advertiser", ['phone' => '+221781112233'])->assertOk();
        $this->assertSame($autre->id, $annonce->fresh()->radar_advertiser_id);
        $avant = $this->etat();

        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.outreach.listing_foreign')
            ->assertJsonPath('params.listing_ids', [$annonce->id]);

        $this->assertSame($avant, $this->etat());
        $this->assertNull(RadarOutreach::query()->findOrFail($id)->sent_at);
    }

    public function test_envoyer_une_relance_dont_le_message_relance_a_recu_une_issue_est_refuse(): void
    {
        $this->modeleRepond('Bonjour Awa, un rappel', 'votre appartement à Ouakam');
        $annonceur = $this->prise($this->annonceur());
        $contactee = $this->lue($annonceur, 'contacted');
        $origine = RadarOutreach::factory()->withListings($contactee)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $id = $this->preparer($annonceur, ['follow_up_of_id' => $origine->id])->assertCreated()->json('data.id');
        // Entre la préparation et l'envoi : l'annonceur a posé une question, la chaîne est fermée.
        $origine->forceFill(['outcome' => 'question', 'outcome_at' => now()])->save();
        $avant = $this->etat();

        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.outreach.follow_up_invalid');

        $this->assertSame($avant, $this->etat());
        $this->assertNull(RadarOutreach::query()->findOrFail($id)->sent_at);
    }

    public function test_une_issue_question_ou_sans_reponse_ferme_la_chaine_et_une_relance_reste_permise(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());

        foreach (['question', 'no_answer'] as $issue) {
            $annonce = $this->lue($annonceur, 'contacted');
            RadarOutreach::factory()->withListings($annonce)->sent()->create([
                'radar_advertiser_id' => $annonceur->id, 'outcome' => $issue, 'outcome_at' => now(),
            ]);

            $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->assertJsonPath('data.follow_up_rank', 0);
        }

        // Une relance, elle, est toujours permise sur une chaîne ouverte (dans le plafond).
        $ouverte = $this->lue($annonceur, 'contacted');
        $origine = RadarOutreach::factory()->withListings($ouverte)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $this->preparer($annonceur, ['follow_up_of_id' => $origine->id])->assertCreated()->assertJsonPath('data.follow_up_rank', 1);

        // Une fois la relance ENVOYÉE, c'est elle la chaîne ouverte : un premier message reste refusé.
        $relance = RadarOutreach::query()->where('follow_up_of_id', $origine->id)->sole();
        $this->postJson("/api/admin/radar/outreaches/{$relance->id}/sent")->assertOk();
        $this->preparer($annonceur, ['listing_ids' => [$ouverte->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.listing_pending');
    }

    public function test_la_chaine_ouverte_est_rejugee_sous_verrou_apres_l_appel_au_modele(): void
    {
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur, 'contacted');
        $avant = $this->etat();

        // Pendant que le modèle répond, un message est envoyé pour cette annonce.
        RadarConsentMessage::fake(function () use ($annonceur, $annonce) {
            RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);

            return ['salutation' => 'Bonjour,', 'resume' => 'votre bien'];
        });
        $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.listing_pending');

        $this->assertSame(1, RadarOutreach::query()->count());
        $this->assertSame(0, AiSuggestion::query()->count());
        $this->assertNotSame($avant, $this->etat());
    }

    public function test_une_relance_au_dela_du_maximum_est_refusee(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur, 'contacted');
        $derniere = RadarOutreach::factory()->withListings($annonce)->sent()->create([
            'radar_advertiser_id' => $annonceur->id, 'follow_up_rank' => config('radar.follow_ups.max'),
        ]);

        $this->preparer($annonceur, ['follow_up_of_id' => $derniere->id])
            ->assertStatus(422)->assertJsonPath('code', 'radar.outreach.follow_up_limit');

        // Un cran avant le maximum, c'est encore permis.
        $derniere->forceFill(['follow_up_rank' => config('radar.follow_ups.max') - 1])->save();
        $this->preparer($annonceur, ['follow_up_of_id' => $derniere->id])->assertCreated()->assertJsonPath('data.follow_up_rank', config('radar.follow_ups.max'));
    }

    public function test_un_premier_message_apres_une_question_peut_reprendre_une_annonce_contactee(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur, 'contacted');
        RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id, 'outcome' => 'question', 'outcome_at' => now()]);

        $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->assertJsonPath('data.follow_up_rank', 0);
    }

    public function test_la_langue_du_message_suit_la_demande_et_le_wolof_est_refuse(): void
    {
        $this->modeleRepond('Hello Awa,', 'your flat in Ouakam');
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);

        $this->preparer($annonceur, ['listing_ids' => [$annonce->id], 'locale' => 'wo'])->assertStatus(422)->assertJsonValidationErrors(['locale']);
        $reponse = $this->preparer($annonceur, ['listing_ids' => [$annonce->id], 'locale' => 'en'])->assertCreated();

        $message = RadarOutreach::query()->sole();
        $this->assertSame('en', $message->locale);
        $this->assertSame('en', $reponse->json('data.locale'));
        $this->assertStringContainsString('https://front.exemple.test/en/legal/terms', $message->message);
        $this->assertSame(
            $this->app->make(ConsentMessageComposer::class)->compose('en', 'Hello Awa,', 'your flat in Ouakam'),
            $message->message,
        );
    }

    public function test_les_corps_invalides_sont_refuses(): void
    {
        RadarConsentMessage::fake();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);

        $this->preparer($annonceur, [])->assertStatus(422)->assertJsonValidationErrors(['listing_ids']);
        $this->preparer($annonceur, ['listing_ids' => []])->assertStatus(422);
        $this->preparer($annonceur, ['listing_ids' => [$annonce->id, $annonce->id]])->assertStatus(422);
        $this->preparer($annonceur, ['listing_ids' => range(1, 21)])->assertStatus(422);
        RadarConsentMessage::assertNeverPrompted();
    }

    public function test_le_journal_nomme_les_gestes_sans_texte_ni_numero(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => 'Bonjour Madame Fall,'])->assertOk();
        $this->postJson("/api/admin/radar/outreaches/{$id}/sent")->assertOk();

        $prepare = Activity::query()->where('event', 'radar_outreach_prepared')->sole();
        $this->assertEquals([
            'outreach_id' => $id, 'listing_ids' => [$annonce->id], 'locale' => 'fr', 'follow_up_rank' => 0, 'generated' => true, 'ai_error' => null,
        ], $prepare->properties->all());
        $retouche = Activity::query()->where('event', 'radar_outreach_retouched')->sole();
        $this->assertEquals(['outreach_id' => $id, 'fields' => ['salutation']], $retouche->properties->all());
        $envoye = Activity::query()->where('event', 'radar_outreach_sent')->sole();
        $this->assertEquals(['outreach_id' => $id, 'listing_ids' => [$annonce->id], 'suggestion_decision' => 'edited'], $envoye->properties->all());

        $tout = Activity::query()->whereIn('event', ['radar_outreach_prepared', 'radar_outreach_retouched', 'radar_outreach_sent'])->get()->toJson();
        foreach (['771234567', 'Madame Fall', 'Ouakam', 'Awa'] as $interdit) {
            $this->assertStringNotContainsString($interdit, $tout, $interdit);
        }
        foreach ([$prepare, $retouche, $envoye] as $ligne) {
            $this->assertSame($this->operateur->id, $ligne->causer_id);
            $this->assertSame($id, $ligne->subject_id);
        }
    }

    public function test_les_gestes_exigent_la_prise_en_charge_de_l_annonceur(): void
    {
        $this->modeleRepond();
        $annonceur = $this->annonceur();
        $annonce = $this->lue($annonceur);
        $message = RadarOutreach::factory()->withListings($annonce)->create(['radar_advertiser_id' => $annonceur->id]);
        $avant = $this->etat();

        $this->patchJson("/api/admin/radar/outreaches/{$message->id}", ['salutation' => 'Bonjour'])
            ->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');
        $this->postJson("/api/admin/radar/outreaches/{$message->id}/sent")
            ->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');

        $this->assertSame($avant, $this->etat());
    }

    public function test_chaque_geste_renouvelle_la_prise(): void
    {
        $this->modeleRepond();
        $annonceur = $this->prise($this->annonceur());
        $annonce = $this->lue($annonceur);

        Carbon::setTestNow('2026-10-28 10:06:00');
        $id = $this->preparer($annonceur, ['listing_ids' => [$annonce->id]])->assertCreated()->json('data.id');
        $this->assertTrue($annonceur->fresh()->claim_expires_at->equalTo(Carbon::parse('2026-10-28 10:16:00')));

        Carbon::setTestNow('2026-10-28 10:12:00');
        $this->patchJson("/api/admin/radar/outreaches/{$id}", ['salutation' => 'Bonjour'])->assertOk();
        $this->assertTrue($annonceur->fresh()->claim_expires_at->equalTo(Carbon::parse('2026-10-28 10:22:00')));
    }
}
