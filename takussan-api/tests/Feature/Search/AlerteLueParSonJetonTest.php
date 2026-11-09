<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\AlertSubscriber;
use App\Models\Property;
use App\Models\SavedSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Symfony\Component\Mailer\SentMessage;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2513 (ADR-0050 §4) — la page d'un lien d'alerte sans compte lit son alerte par le jeton, sans rien consommer,
 * et peut l'espacer (`weekly`) au lieu de la couper. Aucune réponse ne dit si un contact est connu.
 */
class AlerteLueParSonJetonTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const EMAIL = 'awa@exemple.sn';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /** Une demande d'alerte par le vrai parcours ; rend le jeton de confirmation reçu par e-mail. */
    private function demander(): string
    {
        $this->postJson('/api/public/search-alerts', [
            'criteria' => ['city' => 'Dakar', 'price_max' => 300000],
            'name' => 'Dakar abordable',
            'frequency' => 'daily',
            'channel' => 'email',
            'email' => self::EMAIL,
            'locale' => 'fr',
            'consent' => true,
        ])->assertStatus(202);

        $mail = collect(app('mailer')->getSymfonyTransport()->messages())
            ->map(fn (SentMessage $m) => (string) $m->getOriginalMessage()->getHtmlBody())
            ->last();
        preg_match('/search-alerts\/confirm\?token=([A-Za-z0-9_-]+)/', (string) $mail, $m);
        $this->assertNotEmpty($m[1] ?? null, 'le lien de confirmation porte le jeton');

        return $m[1];
    }

    private function jetonDeDesinscription(): string
    {
        return AlertSubscriber::sole()->unsubscribeToken();
    }

    private function lire(string $jeton): TestResponse
    {
        return $this->getJson('/api/public/search-alerts/by-token?token='.rawurlencode($jeton));
    }

    private function biensCorrespondants(): void
    {
        foreach ([250_000, 280_000, 900_000] as $prix) {
            $bien = Property::factory()->published()->create(['price' => $prix, 'published_at' => now()->subDay()]);
            Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar', 'neighborhood' => 'Plateau', 'country' => 'SN']);
        }
        $this->indexProperties();
    }

    /** Aucun champ de contact, ni l'adresse elle-même, dans le JSON BRUT. */
    private function assertSansContact(TestResponse $reponse): void
    {
        $brut = (string) $reponse->getContent();
        $this->assertStringNotContainsString(self::EMAIL, $brut);
        $this->assertStringNotContainsString('awa', $brut);
        foreach (['email', 'phone', 'contact', 'channel'] as $champ) {
            $this->assertStringNotContainsString('"'.$champ.'"', $brut, "champ {$champ}");
        }
    }

    /** **AC1** — le jeton de désinscription rend les critères ; la lecture ne consomme rien. */
    public function test_le_jeton_de_desinscription_rend_l_alerte_sans_la_consommer(): void
    {
        $this->biensCorrespondants();
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $this->demander()])->assertOk();
        $jeton = $this->jetonDeDesinscription();

        $reponse = $this->lire($jeton)->assertOk()
            ->assertExactJson(['data' => [
                'kind' => 'unsubscribe',
                'name' => 'Dakar abordable',
                'criteria' => ['city' => 'Dakar', 'price_max' => 300000],
                'frequency' => 'daily',
                'matches' => 2,
            ]]);
        $this->assertSansContact($reponse);
        $this->lire($jeton)->assertOk();

        $this->postJson('/api/public/search-alerts/unsubscribe', ['token' => $jeton])->assertOk();
        $this->assertSame(0, AlertSubscriber::count(), 'la désinscription agit toujours après deux lectures');
        $this->assertSame(0, SavedSearch::count());
    }

    /** Le jeton de confirmation encore valide : `kind: confirm`, et la lecture ne confirme personne. */
    public function test_le_jeton_de_confirmation_se_lit_sans_confirmer(): void
    {
        $jeton = $this->demander();

        $this->lire($jeton)->assertOk()
            ->assertJsonPath('data.kind', 'confirm')
            ->assertJsonPath('data.name', 'Dakar abordable');
        $this->assertNull(AlertSubscriber::sole()->confirmed_at, 'une lecture ne confirme rien');

        $this->postJson('/api/public/search-alerts/confirm', ['token' => $jeton])->assertOk();
    }

    /** Les critères émis sont ceux du vocabulaire fermé, rien d'autre (ligne antérieure au vocabulaire). */
    public function test_les_criteres_emis_sont_ceux_du_vocabulaire_ferme(): void
    {
        $this->demander();
        SavedSearch::query()->update(['criteria' => json_encode(['city' => 'Dakar', 'secret_interne' => 'x'])]);

        $this->lire($this->jetonDeDesinscription())->assertOk()
            ->assertJsonPath('data.criteria', ['city' => 'Dakar']);
    }

    /**
     * **AC2** — un jeton inconnu et un jeton de confirmation déjà consommé : 404, corps identiques, et le même travail
     * (même nombre de requêtes) — ni le code ni le délai ne les distinguent.
     */
    public function test_jeton_inconnu_et_jeton_consomme_rendent_le_meme_404(): void
    {
        $jeton = $this->demander();
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $jeton])->assertOk();

        $requetes = [];
        DB::listen(function ($q) use (&$requetes): void {
            $requetes[] = $q->sql;
        });
        $consomme = $this->lire($jeton);
        $requetesConsomme = $requetes;
        $requetes = [];
        $inconnu = $this->lire(AlertSubscriber::newToken());
        $requetesInconnu = $requetes;

        $consomme->assertNotFound();
        $inconnu->assertNotFound();
        $this->assertSame($inconnu->getContent(), $consomme->getContent());
        $this->assertNotEmpty($requetesInconnu);
        $this->assertSame($requetesInconnu, $requetesConsomme, 'les mêmes requêtes, dans le même ordre');
    }

    /** Un jeton de confirmation de plus de 48 h ne se lit plus, même avant la purge. */
    public function test_un_jeton_de_confirmation_expire_rend_404(): void
    {
        $this->freezeTime();
        $jeton = $this->demander();
        $this->travel(49)->hours();

        $this->lire($jeton)->assertNotFound();
    }

    /** **AC3** — `weekly` : l'abonné reste inscrit, sa recherche passe à `weekly`, aucun contact ne sort. */
    public function test_passer_a_weekly_ne_desinscrit_pas(): void
    {
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $this->demander()])->assertOk();
        $jeton = $this->jetonDeDesinscription();

        $reponse = $this->postJson('/api/public/search-alerts/frequency', ['token' => $jeton, 'frequency' => 'weekly'])
            ->assertOk()->assertExactJson(['data' => ['status' => 'weekly']]);
        $this->assertSansContact($reponse);

        $this->assertNotNull(AlertSubscriber::sole()->confirmed_at, 'toujours inscrit');
        $this->assertSame('weekly', SavedSearch::sole()->notification_frequency);
        $this->assertSansContact($this->lire($jeton)->assertOk()->assertJsonPath('data.frequency', 'weekly'));
    }

    /** **AC3** — un jeton inconnu : la même réponse qu'un succès, et rien ne bouge. */
    public function test_frequence_par_jeton_inconnu_rend_la_meme_reponse(): void
    {
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $this->demander()])->assertOk();

        $this->postJson('/api/public/search-alerts/frequency', ['token' => AlertSubscriber::newToken(), 'frequency' => 'weekly'])
            ->assertOk()->assertExactJson(['data' => ['status' => 'weekly']]);
        $this->assertSame('daily', SavedSearch::sole()->notification_frequency);
    }

    /**
     * Revue du 2026-11-09 — `frequency` ne prend que le jeton de DÉSINSCRIPTION : un jeton de confirmation encore valide
     * rend le même corps qu'un jeton inconnu, et ne change ni la fréquence ni la confirmation.
     */
    public function test_frequence_refuse_un_jeton_de_confirmation(): void
    {
        $confirmation = $this->demander();

        $inconnu = $this->postJson('/api/public/search-alerts/frequency', ['token' => AlertSubscriber::newToken(), 'frequency' => 'weekly'])->assertOk();
        $this->postJson('/api/public/search-alerts/frequency', ['token' => $confirmation, 'frequency' => 'weekly'])
            ->assertOk()->assertExactJson(json_decode((string) $inconnu->getContent(), true));

        $this->assertSame('daily', SavedSearch::sole()->notification_frequency);
        $this->assertNull(AlertSubscriber::sole()->confirmed_at);
    }

    /** Seul `weekly` est proposé : couper passe par la désinscription, intensifier par un compte. */
    public function test_seule_la_frequence_hebdomadaire_est_acceptee(): void
    {
        $this->postJson('/api/public/search-alerts/frequency', ['token' => 'x', 'frequency' => 'daily'])
            ->assertStatus(422)->assertJsonValidationErrors('frequency');
    }
}
