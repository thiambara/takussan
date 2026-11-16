<?php

namespace Tests\Feature\Search;

use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\AlertSubscriber;
use App\Models\AppNotification;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\SearchService;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-615 **AC2** (ADR-0050, amendement du 2026-11-16, B) — le premier envoi ne vend pas
 * l'historique comme nouveau : `last_notified_at` est posé à la création (compte) ou à la
 * confirmation (sans compte). Avant, il restait nul et la première alerte annonçait « N nouveaux
 * biens » pour toute la publication.
 */
class AlertFirstRunTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function bienPublieLe(CarbonInterface $date): Property
    {
        $bien = Property::factory()->published()->create([
            'price' => 150_000, 'currency' => Currency::XOF, 'published_at' => $date,
        ]);
        Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar', 'neighborhood' => 'Almadies', 'country' => 'SN']);

        return $bien;
    }

    private function passage(): void
    {
        (new SendSavedSearchAlerts)->handle(app(SearchService::class));
    }

    /** @return list<Email> */
    private function alertesA(string $adresse): array
    {
        return collect(app('mailer')->getSymfonyTransport()->messages())
            ->map(fn (SentMessage $m) => $m->getOriginalMessage())
            ->filter(fn (Email $e) => collect($e->getTo())->contains(fn ($a) => $a->getAddress() === $adresse)
                && str_contains((string) $e->getSubject(), 'Abordable'))
            ->values()
            ->all();
    }

    /**
     * 30 biens publiés hier ; recherche créée aujourd'hui par la route ; passage de demain : aucun
     * e-mail. Un bien publié après la création : un e-mail, « 1 nouveau bien ».
     */
    public function test_compte_le_premier_passage_n_annonce_que_ce_qui_suit_la_creation(): void
    {
        $this->freezeTime();
        foreach (range(1, 30) as $i) {
            $this->bienPublieLe(now()->subDay());
        }
        $this->indexProperties();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/saved-searches', ['name' => 'Abordable', 'criteria' => ['price_max' => 200_000]])->assertCreated();
        $this->assertNotNull(SavedSearch::sole()->last_notified_at, 'la borne est posée à la création');

        $this->travel(1)->days();
        $this->passage();
        $this->assertSame([], $this->alertesA((string) $user->email), 'l\'historique n\'est pas annoncé');
        $this->assertSame(0, AppNotification::where('user_id', $user->id)->count());

        $this->bienPublieLe(now()->subHour());
        $this->indexProperties();
        $this->travel(1)->days();
        $this->passage();

        $this->assertCount(1, $this->alertesA((string) $user->email));
        $cloche = AppNotification::where('user_id', $user->id)->sole();
        $this->assertSame(1, $cloche->data['total']);
        $this->assertStringContainsString('Un nouveau bien', (string) $this->alertesA((string) $user->email)[0]->getHtmlBody());
    }

    /** `SearchService::saveSearch()` pose la même borne. */
    public function test_compte_save_search_pose_la_borne(): void
    {
        $this->freezeTime();
        $recherche = app(SearchService::class)->saveSearch(User::factory()->create(), ['price_max' => 200_000]);

        $this->assertTrue($recherche->refresh()->last_notified_at->timestamp === now()->timestamp);
    }

    /**
     * Sans compte : la borne est la CONFIRMATION — un bien publié avant elle n'est pas annoncé ; un
     * bien publié après l'est, seul.
     */
    public function test_visiteur_le_premier_passage_n_annonce_que_ce_qui_suit_la_confirmation(): void
    {
        $this->freezeTime();
        foreach (range(1, 3) as $i) {
            $this->bienPublieLe(now()->subDay());
        }
        $this->indexProperties();

        $this->postJson('/api/public/search-alerts', [
            'criteria' => ['price_max' => 200_000], 'name' => 'Abordable', 'frequency' => 'daily',
            'channel' => 'email', 'email' => 'awa@exemple.sn', 'locale' => 'fr', 'consent' => true,
        ])->assertStatus(202);
        $this->travel(2)->hours();
        $mail = collect(app('mailer')->getSymfonyTransport()->messages())->last()->getOriginalMessage();
        preg_match('/search-alerts\/confirm\?token=([A-Za-z0-9_-]+)/', (string) $mail->getHtmlBody(), $m);
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $m[1]])->assertOk();
        $this->assertTrue(SavedSearch::sole()->last_notified_at->timestamp === now()->timestamp, 'la borne est la confirmation');

        $this->travel(1)->days();
        $this->passage();
        $this->assertSame([], $this->alertesA('awa@exemple.sn'));

        $this->bienPublieLe(now()->subHour());
        $this->indexProperties();
        $this->travel(1)->days();
        $this->passage();
        $this->assertCount(1, $this->alertesA('awa@exemple.sn'));
        $this->assertTrue(AlertSubscriber::sole()->isConfirmed());
    }

    /** Les recherches existantes jamais alertées reçoivent leur `created_at` comme borne. */
    public function test_la_migration_borne_les_recherches_jamais_alertees(): void
    {
        $user = User::factory()->create();
        $jamais = SavedSearch::factory()->create(['user_id' => $user->id, 'created_at' => now()->subMonth()]);
        $deja = SavedSearch::factory()->create(['user_id' => $user->id, 'last_notified_at' => now()->subDay()]);
        $avant = $deja->getRawOriginal('last_notified_at');

        $migration = require database_path('migrations/2026_11_16_400100_borne_les_alertes_jamais_envoyees.php');
        $migration->up();

        $this->assertSame(
            DB::table('saved_searches')->where('id', $jamais->id)->value('created_at'),
            DB::table('saved_searches')->where('id', $jamais->id)->value('last_notified_at'),
        );
        $this->assertSame($avant, DB::table('saved_searches')->where('id', $deja->id)->value('last_notified_at'));
    }
}
