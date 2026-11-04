<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarConsentMessage;
use App\Exceptions\ApiError;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\RadarTarget;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\Targets\RadarTargetCriteria;
use App\Services\Radar\Whatsapp\RadarWhatsappTemplate;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2471 (ADR-0077 §4, ADR-0087) — le message d'accord dit à l'annonceur que son bien est recherché sur Takussan, quand
 * une cible `demand` ACTIVE couvre l'une de ses annonces. `accord.v4` = `accord.v3` + une phrase fixe du dépôt, sans
 * nombre ; elle ne part que par le canal manuel (`wa.me`) tant que le gabarit Meta v4 n'est pas configuré
 * (`radar_whatsapp.templates.accord.v4`, `RADAR_WHATSAPP_ACCORD_V4_TEMPLATE`).
 *
 * Le canal n'est connu qu'APRÈS la préparation (l'opérateur choisit `wa.me` ou l'API sur l'aperçu) : la version se décide
 * donc à la préparation, sur ce qui sera offert. L'API offerte (`whatsapp_api_available`) sans gabarit v4 → `accord.v3`,
 * pour que tout message préparé puisse partir par chacun des canaux offerts.
 */
class ConsentMessageDemandSentenceTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const PHRASE_FR = 'Des personnes recherchent en ce moment sur Takussan un bien comme le vôtre.';

    private const PHRASE_EN = 'People are looking for a property like yours on Takussan right now.';

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-04 10:00:00');
        $this->installerSocleDEssai();
        config(['ai.roles.redaction' => [['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 1000]]]);
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        config(['app.frontend_url' => 'https://front.exemple.test']);
        RadarConsentMessage::fake(fn () => ['salutation' => 'Bonjour Awa,', 'resume' => 'votre appartement aux Almadies']);
        $this->agirEnOperateur(PlatformProfileLevel::Support);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Le canal manuel seul : le pilote `cloud` sans numéro n'offre pas l'API (`RadarWhatsappNumber::available()`). */
    private function canalManuelSeul(): void
    {
        config(['radar_whatsapp.driver' => 'cloud', 'radar_whatsapp.phone_number_id' => '', 'radar_whatsapp.access_token' => '']);
    }

    /** L'API offerte : le pilote `log` en `testing` (l'environnement de cette suite) l'offre, sans réseau. */
    private function apiOfferte(): void
    {
        config(['radar_whatsapp.driver' => 'log']);
    }

    private function annonceur(): RadarAdvertiser
    {
        $annonceur = RadarAdvertiser::factory()->create(['phone' => '+221771234567', 'display_name' => 'Awa Fall']);
        $this->postJson("/api/admin/radar/advertisers/{$annonceur->id}/claim")->assertOk();

        return $annonceur;
    }

    private function annonce(RadarAdvertiser $annonceur): RadarListing
    {
        return RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $annonceur->id]);
    }

    private function cible(string $nom, RadarTargetOrigin $origine = RadarTargetOrigin::Demand, RadarTargetStatus $statut = RadarTargetStatus::Active, RadarListing ...$annonces): RadarTarget
    {
        $criteres = RadarTargetCriteria::normalize(['types' => ['apartment'], 'price_max' => 100_000 + RadarTarget::query()->count()]);
        $cible = RadarTarget::query()->create([
            'name' => $nom, 'origin' => $origine, 'status' => $statut, 'pinned' => false,
            'criteria' => $criteres, 'criteria_signature' => RadarTargetCriteria::signature($criteres),
            'demand_count' => $origine === RadarTargetOrigin::Demand ? 3 : null,
        ]);
        $cible->listings()->attach(collect($annonces)->pluck('id')->all(), ['matched_at' => now()]);

        return $cible;
    }

    /** @param  list<int>  $ids */
    private function preparer(RadarAdvertiser $annonceur, array $ids, string $locale = 'fr'): TestResponse
    {
        return $this->postJson("/api/admin/radar/advertisers/{$annonceur->id}/outreaches", ['listing_ids' => $ids, 'locale' => $locale])->assertCreated();
    }

    private function texteDuLien(string $url): string
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $params);

        return $params['text'];
    }

    public function test_ac1_une_annonce_d_une_cible_de_la_demande_active_porte_la_phrase_mot_pour_mot_en_accord_v4(): void
    {
        $this->canalManuelSeul();
        $annonceur = $this->annonceur();
        $visee = $this->annonce($annonceur);
        $autre = $this->annonce($annonceur);
        $this->cible('Appartement aux Almadies', RadarTargetOrigin::Demand, RadarTargetStatus::Active, $visee);

        $reponse = $this->preparer($annonceur, [$visee->id, $autre->id]);

        $message = RadarOutreach::query()->sole();
        $this->assertSame('accord.v4', $message->clauses_version);
        $this->assertStringContainsString("\n\n".self::PHRASE_FR."\n\n", $message->message);
        $this->assertSame(1, substr_count($message->message, self::PHRASE_FR));
        $composeur = $this->app->make(ConsentMessageComposer::class);
        $this->assertSame(
            $composeur->compose('fr', 'Bonjour Awa,', 'votre appartement aux Almadies', 'accord.v4', $composeur->claimUrlFor($message)),
            $message->message,
        );
        // Le lien `wa.me`, l'aperçu et le texte enregistré restent une seule chaîne.
        $this->assertSame($message->message, $this->texteDuLien($reponse->json('data.wa_me_url')));
        $this->assertSame($message->message, implode('', array_column($reponse->json('data.segments'), 'text')));
        $this->assertSame('accord.v4', $reponse->json('data.clauses_version'));
        // La raison, pour l'aperçu de la console : le nom de la cible de la demande.
        $this->assertSame(['Appartement aux Almadies'], $reponse->json('data.demand_targets'));
    }

    public function test_ac1_en_anglais_la_phrase_est_celle_du_fichier_anglais(): void
    {
        $this->canalManuelSeul();
        $annonceur = $this->annonceur();
        $visee = $this->annonce($annonceur);
        $this->cible('Apartment Almadies', RadarTargetOrigin::Demand, RadarTargetStatus::Active, $visee);

        $this->preparer($annonceur, [$visee->id], 'en');

        $message = RadarOutreach::query()->sole();
        $this->assertSame('accord.v4', $message->clauses_version);
        $this->assertStringContainsString("\n\n".self::PHRASE_EN."\n\n", $message->message);
    }

    public function test_ac1_l_api_offerte_avec_un_gabarit_v4_configure_porte_aussi_la_phrase(): void
    {
        $this->apiOfferte();
        config(['radar_whatsapp.templates' => ['accord.v3' => 'takussan_radar_accord_v3', 'accord.v4' => 'takussan_radar_accord_v4']]);
        $annonceur = $this->annonceur();
        $visee = $this->annonce($annonceur);
        $this->cible('Appartement aux Almadies', RadarTargetOrigin::Demand, RadarTargetStatus::Active, $visee);

        $this->preparer($annonceur, [$visee->id]);

        $this->assertSame('accord.v4', RadarOutreach::query()->sole()->clauses_version);
    }

    /** AC2 — sans cible `demand` active : une cible de l'opérateur, une cible de la demande en pause ou retirée, une cible d'une AUTRE annonce. */
    public function test_ac2_sans_cible_de_la_demande_active_le_message_reste_accord_v3_inchange(): void
    {
        $this->canalManuelSeul();
        $composeur = $this->app->make(ConsentMessageComposer::class);
        $annonceur = $this->annonceur();
        $annonce = $this->annonce($annonceur);
        $ailleurs = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => RadarAdvertiser::factory()->create()->id]);
        $this->cible('Cible de l\'opérateur', RadarTargetOrigin::Operator, RadarTargetStatus::Active, $annonce);
        $this->cible('Demande en pause', RadarTargetOrigin::Demand, RadarTargetStatus::Paused, $annonce);
        $this->cible('Demande retirée', RadarTargetOrigin::Demand, RadarTargetStatus::Retired, $annonce);
        $this->cible('Demande d\'une autre annonce', RadarTargetOrigin::Demand, RadarTargetStatus::Active, $ailleurs);

        $reponse = $this->preparer($annonceur, [$annonce->id]);

        $message = RadarOutreach::query()->sole();
        $this->assertSame('accord.v3', $message->clauses_version);
        $this->assertStringNotContainsString(self::PHRASE_FR, $message->message);
        $this->assertSame($composeur->compose('fr', 'Bonjour Awa,', 'votre appartement aux Almadies', 'accord.v3', $composeur->claimUrlFor($message)), $message->message);
        $this->assertSame([], $reponse->json('data.demand_targets'));
    }

    /** AC2 — l'API offerte sans gabarit v4 : `accord.v3`, pour que le message puisse partir par l'API comme à la main. */
    public function test_ac2_l_api_offerte_sans_gabarit_v4_garde_accord_v3_meme_avec_une_cible_de_la_demande(): void
    {
        $this->apiOfferte();
        $this->assertSame('', (string) (config('radar_whatsapp.templates')['accord.v4'] ?? ''), 'aucun gabarit v4 par défaut');
        $annonceur = $this->annonceur();
        $visee = $this->annonce($annonceur);
        $this->cible('Appartement aux Almadies', RadarTargetOrigin::Demand, RadarTargetStatus::Active, $visee);

        $reponse = $this->preparer($annonceur, [$visee->id]);

        $message = RadarOutreach::query()->sole();
        $this->assertSame('accord.v3', $message->clauses_version);
        $this->assertStringNotContainsString(self::PHRASE_FR, $message->message);
        $this->assertSame([], $reponse->json('data.demand_targets'));
    }

    /** Le canal API refuse `accord.v4` tant que son gabarit n'est pas configuré — un message préparé quand l'API n'était pas offerte. */
    public function test_l_api_refuse_un_message_accord_v4_sans_gabarit_et_l_envoie_une_fois_configure(): void
    {
        $this->canalManuelSeul();
        $annonceur = $this->annonceur();
        $visee = $this->annonce($annonceur);
        $this->cible('Appartement aux Almadies', RadarTargetOrigin::Demand, RadarTargetStatus::Active, $visee);
        $this->preparer($annonceur, [$visee->id]);
        $message = RadarOutreach::query()->sole();
        $this->assertSame('accord.v4', $message->clauses_version);

        $this->apiOfferte();
        Http::fake();
        $this->postJson("/api/admin/radar/outreaches/{$message->id}/send")
            ->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.template_missing');
        $this->assertNull($message->fresh()->sent_at);

        config(['radar_whatsapp.templates' => ['accord.v3' => 'takussan_radar_accord_v3', 'accord.v4' => 'takussan_radar_accord_v4']]);
        $gabarit = $this->app->make(RadarWhatsappTemplate::class)->for($message->fresh());
        $this->assertSame('takussan_radar_accord_v4', $gabarit->name);
        $this->assertSame($message->message, RadarWhatsappTemplate::render($this->app->make(RadarWhatsappTemplate::class)->body('fr', 'accord.v4'), $gabarit->params));
        $this->postJson("/api/admin/radar/outreaches/{$message->id}/send")->assertOk();
        $this->assertNotNull($message->fresh()->sent_at);
        Http::assertNothingSent();
    }

    /** Chaque message garde sa version : une cible de la demande apparue après la préparation ne réécrit pas un `accord.v3`. */
    public function test_une_retouche_recompose_dans_la_version_enregistree(): void
    {
        $this->canalManuelSeul();
        $annonceur = $this->annonceur();
        $visee = $this->annonce($annonceur);
        $this->preparer($annonceur, [$visee->id]);
        $message = RadarOutreach::query()->sole();
        $this->assertSame('accord.v3', $message->clauses_version);

        $this->cible('Appartement aux Almadies', RadarTargetOrigin::Demand, RadarTargetStatus::Active, $visee);
        $this->patchJson("/api/admin/radar/outreaches/{$message->id}", ['salutation' => 'Bonjour Madame Fall,'])->assertOk();

        $frais = $message->fresh();
        $this->assertSame('accord.v3', $frais->clauses_version);
        $this->assertStringNotContainsString(self::PHRASE_FR, $frais->message);
        $this->assertStringStartsWith('Takussan — Bonjour Madame Fall,', $frais->message);
    }

    /**
     * I-4 de TCK-2395, pour la v4 : la phrase ajoute ~70 caractères au texte fixe, si bien qu'avec la salutation, le résumé et
     * les liens les plus longs le corps hydraté dépasserait la limite de Meta (1024, refus 132005). La garde de
     * {@see RadarWhatsappTemplate::for()} le refuse AVANT tout envoi (`summary_too_long`) ; un résumé plus court passe. Écart
     * consigné dans TCK-2471 : la borne du résumé du canal API pour la v4 se décide avec le gabarit Meta v4.
     */
    public function test_le_corps_hydrate_d_accord_v4_trop_long_pour_meta_est_refuse_avant_tout_envoi(): void
    {
        config([
            'app.frontend_url' => 'https://preview.takussan.com',
            'radar_whatsapp.templates' => ['accord.v3' => 'takussan_radar_accord_v3', 'accord.v4' => 'takussan_radar_accord_v4'],
        ]);
        $composeur = $this->app->make(ConsentMessageComposer::class);
        $gabarit = $this->app->make(RadarWhatsappTemplate::class);
        $annonceur = RadarAdvertiser::factory()->create(['id' => PHP_INT_MAX, 'phone' => '+221749998877']);
        $salutation = str_repeat('S', ConsentMessageComposer::SALUTATION_MAX);

        foreach (ConsentMessageComposer::LOCALES as $locale) {
            foreach ([RadarWhatsappTemplate::SUMMARY_MAX => false, 40 => true] as $longueur => $passe) {
                $resume = str_repeat('r', $longueur);
                $message = RadarOutreach::factory()->create([
                    'radar_advertiser_id' => $annonceur->id, 'clauses_version' => 'accord.v4', 'locale' => $locale,
                    'salutation' => $salutation, 'summary' => $resume, 'message' => '',
                ]);
                $message->forceFill(['message' => $composeur->compose($locale, $salutation, $resume, 'accord.v4', $composeur->claimUrlFor($message->load('advertiser')))])->save();

                if (! $passe) {
                    $this->assertGreaterThan(RadarWhatsappTemplate::BODY_MAX, mb_strlen($message->message), "{$locale} : le cas limite dépasse bien");
                    try {
                        $gabarit->for($message);
                        $this->fail("{$locale} : un corps de plus de 1024 caractères ne doit jamais partir");
                    } catch (ApiError $e) {
                        $this->assertSame('radar.whatsapp.summary_too_long', $e->errorCode);
                    }

                    continue;
                }
                $this->assertSame($message->message, RadarWhatsappTemplate::render($gabarit->body($locale, 'accord.v4'), $gabarit->for($message)->params));
                $this->assertLessThanOrEqual(RadarWhatsappTemplate::BODY_MAX, mb_strlen($message->message), $locale);
            }
        }
    }

    /** `accord.v4` = `accord.v3` + la phrase, rien d'autre : clauses identiques mot pour mot (les textes juridiques ne changent pas). */
    public function test_accord_v4_est_accord_v3_plus_la_phrase_seule(): void
    {
        $composeur = $this->app->make(ConsentMessageComposer::class);
        foreach (['fr' => self::PHRASE_FR, 'en' => self::PHRASE_EN] as $locale => $phrase) {
            $v3 = $composeur->template($locale, 'accord.v3');
            $v4 = $composeur->template($locale, 'accord.v4');

            $this->assertSame($v3, str_replace($phrase."\n\n", '', $v4), $locale);
            $this->assertSame(1, substr_count($v4, $phrase), $locale);
            $this->assertDoesNotMatchRegularExpression('/\d/', $phrase, 'la phrase ne porte aucun nombre');
        }
        $this->assertSame($composeur->clauseCount('accord.v3'), $composeur->clauseCount('accord.v4'));
        $this->assertSame('accord.v4', ConsentMessageComposer::DEMAND_VERSION);
        // Le gabarit Meta de la v4 ne commence ni ne finit par une variable, comme celui de la v3.
        $corps = $this->app->make(RadarWhatsappTemplate::class)->body('fr', 'accord.v4');
        $this->assertStringStartsWith('Takussan — {{1}}', $corps);
        $this->assertDoesNotMatchRegularExpression('/\{\{\d+\}\}\s*$/', $corps);
    }
}
