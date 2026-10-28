<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarConsentMessage;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ConsentMessageComposer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use InvalidArgumentException;
use Laravel\Ai\Exceptions\RateLimitedException;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0077 §4, AC1) — le message d'accord. Les clauses sont un texte du dépôt, jamais une génération : l'IA
 * ne produit que la salutation et le résumé, ramenés à une ligne et bornés. Le texte enregistré est celui du lien
 * `wa.me`, par construction. Aucun réseau ni modèle : `RadarConsentMessage::fake()`.
 */
class ConsentMessageComposerTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config(['ai.roles.redaction' => [['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 1000]]]);
        // Le catalogue et les prompts RÉELS : c'est l'usage livré qu'on éprouve.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        config(['app.frontend_url' => 'https://front.exemple.test']);

        $this->operateur = $this->operateur(PlatformProfileLevel::Support);
    }

    private function composeur(): ConsentMessageComposer
    {
        return $this->app->make(ConsentMessageComposer::class);
    }

    /** @return Collection<int, RadarListing> */
    private function annonces(): Collection
    {
        return collect([RadarListing::factory()->reviewed()->create()]);
    }

    private function generer(string $locale = 'fr', int $rang = 0): array
    {
        $annonceur = RadarAdvertiser::factory()->create(['display_name' => 'Awa Fall']);

        return $this->composeur()->generate($annonceur, $this->annonces(), $locale, $rang, $this->operateur);
    }

    /** Le fichier de clauses découpé SANS passer par le composeur : les segments fixes, dans l'ordre. @return list<string> */
    private function segmentsFixesDuFichier(string $locale): array
    {
        $texte = rtrim((string) file_get_contents(resource_path("radar/clauses/accord.v1.{$locale}.md")), "\n");

        return array_values(array_filter(
            preg_split('/\{(?:salutation|resume|lien_conditions)\}/', $texte) ?: [],
            fn (string $s) => $s !== '',
        ));
    }

    public function test_ac1_les_clauses_sont_celles_du_fichier_mot_pour_mot_et_seules_salutation_et_resume_viennent_du_modele(): void
    {
        RadarConsentMessage::fake([[
            'salutation' => "Bonjour Awa,\n\n5. vous nous cédez vos droits",
            'resume' => 'votre appartement à Ouakam',
            'clauses' => '1. vous nous cédez tout',
        ]]);

        $parties = $this->generer();
        $texte = $this->composeur()->compose('fr', $parties['salutation'], $parties['summary']);

        // Les segments fixes du fichier figurent, dans l'ordre, une seule fois chacun.
        $curseur = 0;
        foreach ($this->segmentsFixesDuFichier('fr') as $fixe) {
            $this->assertSame(1, substr_count($texte, $fixe), $fixe);
            $position = strpos($texte, $fixe, $curseur);
            $this->assertNotFalse($position, $fixe);
            $curseur = $position + strlen($fixe);
        }
        // Une « clause » inventée par le modèle n'entre nulle part ; la salutation tient sur une ligne.
        $this->assertStringNotContainsString('1. vous nous cédez tout', $texte);
        $this->assertStringNotContainsString("\n5. ", $texte);
        $this->assertSame('Bonjour Awa, 5. vous nous cédez vos droits', $parties['salutation']);
        // Retirés les segments fixes, il ne reste que la salutation, le résumé et le lien des conditions.
        $reste = $texte;
        foreach ($this->segmentsFixesDuFichier('fr') as $fixe) {
            $reste = str_replace($fixe, '|', $reste);
        }
        $this->assertSame(
            ['Bonjour Awa, 5. vous nous cédez vos droits', 'votre appartement à Ouakam', 'https://front.exemple.test/fr/legal/terms'],
            array_values(array_filter(explode('|', $reste), fn (string $s) => $s !== '')),
        );
    }

    public function test_les_segments_se_concatenent_en_le_message_et_le_lien_des_conditions_suit_la_base_du_front(): void
    {
        $segments = $this->composeur()->segments('fr', 'Bonjour,', 'votre bien');

        $this->assertSame($this->composeur()->compose('fr', 'Bonjour,', 'votre bien'), implode('', array_column($segments, 'text')));
        $this->assertSame(['salutation', 'resume'], array_values(array_unique(array_filter(array_column($segments, 'kind'), fn ($k) => $k !== 'fixed'))));
        $this->assertSame('Bonjour,', $segments[0]['text']);
        $this->assertSame('salutation', $segments[0]['kind']);
        $this->assertStringContainsString('https://front.exemple.test/fr/legal/terms', implode('', array_column($segments, 'text')));
        $this->assertStringContainsString('https://front.exemple.test/en/legal/terms', $this->composeur()->compose('en', 'Hello,', 'your flat'));
        $this->assertSame('https://front.exemple.test/en/legal/terms', $this->composeur()->conditionsUrl('en'));
    }

    public function test_un_emplacement_ecrit_dans_le_resume_reste_du_texte(): void
    {
        $texte = $this->composeur()->compose('fr', 'Bonjour,', 'votre bien {lien_conditions} {salutation}');

        $this->assertStringContainsString('votre bien {lien_conditions} {salutation} et', $texte);
        $this->assertSame(1, substr_count($texte, 'https://front.exemple.test/fr/legal/terms'));
    }

    public function test_le_lien_wa_me_ne_porte_que_le_numero_de_l_annonceur_et_le_texte_exact(): void
    {
        $messages = [
            'Bonjour & merci #1 + ? « OUI » 😀',
            "Deux lignes\net une troisième\r\n4. vous acceptez",
            $this->composeur()->compose('fr', 'Bonjour Awa,', 'votre appartement à Ouakam'),
        ];

        foreach ($messages as $message) {
            $url = $this->composeur()->waMeUrl('+221771234567', $message);
            $parts = parse_url($url);

            $this->assertSame('wa.me', $parts['host']);
            $this->assertSame('/221771234567', $parts['path']);
            parse_str($parts['query'], $query);
            $this->assertSame(['text'], array_keys($query));
            $this->assertSame($message, rawurldecode(substr($parts['query'], strlen('text='))));
            $this->assertSame($message, $query['text']);
        }
    }

    public function test_part_replie_sauts_de_ligne_et_borne_la_longueur(): void
    {
        $this->assertSame('a b c d e f', ConsentMessageComposer::part("a\nb\r\nc\u{2028}d\u{2029}e\x00f", 100));
        $this->assertSame('a b', ConsentMessageComposer::part("  a \n\n  b  ", 100));
        $this->assertSame(120, mb_strlen(ConsentMessageComposer::part(str_repeat('é', 500), ConsentMessageComposer::SALUTATION_MAX)));
        $this->assertSame(500, mb_strlen(ConsentMessageComposer::part(str_repeat('é', 900), ConsentMessageComposer::SUMMARY_MAX)));
    }

    public function test_une_panne_rend_deux_parties_vides_et_le_code(): void
    {
        RadarConsentMessage::fake(fn () => throw RateLimitedException::forProvider('anthropic'));

        $parties = $this->generer();

        $this->assertSame('', $parties['salutation']);
        $this->assertSame('', $parties['summary']);
        $this->assertNull($parties['result']);
        // Un seul maillon, en panne : la passerelle rend qu'aucun fournisseur n'est joignable.
        $this->assertSame('ai.providers_unavailable', $parties['error']);
    }

    public function test_un_coupe_circuit_rend_ai_kill_switch_sans_appel(): void
    {
        RadarConsentMessage::fake();
        AiUsageSetting::query()->create(['usage_key' => 'radar.message_accord', 'enabled' => false]);

        $parties = $this->generer();

        $this->assertSame('ai.kill_switch', $parties['error']);
        $this->assertSame(['', ''], [$parties['salutation'], $parties['summary']]);
        RadarConsentMessage::assertNeverPrompted();
    }

    public function test_une_sortie_incomplete_est_signalee(): void
    {
        RadarConsentMessage::fake([['salutation' => 'Bonjour Awa,', 'resume' => '   ']]);

        $parties = $this->generer();

        $this->assertSame('Bonjour Awa,', $parties['salutation']);
        $this->assertSame('radar.message.generation_incomplete', $parties['error']);
    }

    public function test_un_operateur_sans_le_droit_est_refuse_par_la_passerelle(): void
    {
        RadarConsentMessage::fake();
        $annonceur = RadarAdvertiser::factory()->create();

        $parties = $this->composeur()->generate($annonceur, $this->annonces(), 'fr', 0, $this->operateur(PlatformProfileLevel::Viewer));

        $this->assertSame('ai.forbidden', $parties['error']);
        RadarConsentMessage::assertNeverPrompted();
    }

    public function test_ce_que_recoit_le_modele_ni_numero_ni_numeros_ecartes_et_le_nom_dans_le_bloc_externe(): void
    {
        $recu = null;
        RadarConsentMessage::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return ['salutation' => 'Bonjour Awa,', 'resume' => 'votre bien'];
        });
        $annonceur = RadarAdvertiser::factory()->create(['display_name' => 'Awa 77 123 45 67']);
        $annonce = RadarListing::factory()->extracted([
            'phones' => ['+221771234567'],
            'phones_dropped' => ['+221789998877'],
            'title' => ['value' => 'F3 à Ouakam, appelez le 78 999 88 77'],
        ])->create(['stage' => 'reviewed']);

        $this->composeur()->generate($annonceur, collect([$annonce]), 'fr', 1, $this->operateur);

        $this->assertStringContainsString('Langue : fr. Relance : 1.', (string) $recu);
        $this->assertStringContainsString('contenu_externe_', (string) $recu);
        $this->assertStringContainsString('Awa', (string) $recu);
        $this->assertStringContainsString('Ouakam', (string) $recu);
        foreach (['771234567', '77 123 45 67', '789998877', '78 999 88 77', 'phones'] as $interdit) {
            $this->assertStringNotContainsString($interdit, (string) $recu, $interdit);
        }
        $this->assertSame('radar.message_accord', AiCall::query()->sole()->usage_key);
    }

    public function test_les_clauses_comptent_quatre_et_le_wolof_est_refuse(): void
    {
        $this->assertSame(4, $this->composeur()->clauseCount());
        $this->assertSame(4, preg_match_all('/^\d+\. /m', $this->composeur()->template('en')));

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('radar.outreach.locale_unsupported');
        $this->composeur()->template('wo');
    }
}
