<?php

namespace Tests\Feature\Calendar;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\CalendarFeed;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Support\SessionsDImpersonation;

/**
 * TCK-2887 (ADR-0121) — le lien d'abonnement d'agenda se relit par son titulaire : une copie
 * chiffrée à côté de l'empreinte, jamais rendue sous impersonation, effacée par toute révocation.
 */
class CalendarFeedReadableUrlTest extends ApiTestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
    }

    private function issue(): string
    {
        $this->app['auth']->forgetGuards();

        return (string) $this->actingAsApi($this->agent)->apiPost('/api/me/calendar-feed')
            ->assertCreated()
            ->json('data.url');
    }

    /** Pour le titulaire, la clé `url` est PRÉSENTE et nulle — absente, c'est la forme de l'impersonation. */
    private function assertUrlNull(bool $active): void
    {
        $data = $this->actingAsApi($this->agent)->apiGet('/api/me/calendar-feed')
            ->assertOk()
            ->assertJsonPath('data.active', $active)
            ->json('data');

        $this->assertArrayHasKey('url', $data);
        $this->assertNull($data['url']);
    }

    private function token(string $url): string
    {
        return basename((string) parse_url($url, PHP_URL_PATH), '.ics');
    }

    /** AC1 — la réouverture rend le lien de la création, et la réponse ne se met pas en cache. */
    public function test_the_holder_reads_back_the_same_url(): void
    {
        $url = $this->issue();

        $this->actingAsApi($this->agent)->apiGet('/api/me/calendar-feed')
            ->assertOk()
            ->assertJsonPath('data.active', true)
            ->assertJsonPath('data.url', $url)
            ->assertHeader('Cache-Control', 'no-store, private');

        // Le lien relu ouvre bien le flux.
        $this->get((string) parse_url($url, PHP_URL_PATH))->assertOk();
    }

    /** AC2 — sous impersonation, la clé `url` est absente ; le reste de l'état se lit. */
    public function test_the_url_is_absent_under_impersonation(): void
    {
        $this->issue();
        $session = $this->ouvrirUneSession(cible: $this->agent);

        $data = $this->avecLeJeton($session['jeton'])->getJson('/api/me/calendar-feed')
            ->assertOk()
            ->assertJsonPath('data.active', true)
            ->json('data');

        $this->assertArrayNotHasKey('url', $data);
    }

    /** AC3 — la colonne ne porte jamais le jeton en clair, mais bien sa copie chiffrée. */
    public function test_the_copy_is_encrypted_in_the_database(): void
    {
        $token = $this->token($this->issue());

        $raw = (string) DB::table('calendar_feeds')->value('token_encrypted');
        $this->assertNotSame('', $raw);
        $this->assertStringNotContainsString($token, $raw);
        $this->assertStringNotContainsString($token, base64_decode($raw, true) ?: '');
        $this->assertSame($token, Crypt::decryptString($raw));

        // Jamais sérialisée avec le modèle, jamais journalisée.
        $this->assertArrayNotHasKey('token_encrypted', CalendarFeed::query()->sole()->toArray());
        $this->assertStringNotContainsString($raw, json_encode(DB::table('activity_log')->get()));
    }

    /** AC4 — révoquer rend `url` nul et vide la colonne. */
    public function test_revocation_clears_the_copy(): void
    {
        $this->issue();

        $this->actingAsApi($this->agent)->apiDelete('/api/me/calendar-feed')->assertNoContent();

        $this->assertUrlNull(active: false);
        $this->assertSame(0, DB::table('calendar_feeds')->whereNotNull('token_encrypted')->count());
    }

    /** La rotation efface la copie du lien remplacé ; seul le nouveau se relit. */
    public function test_rotation_clears_the_copy_of_the_replaced_link(): void
    {
        $this->issue();
        $second = $this->issue();

        $this->assertSame(1, DB::table('calendar_feeds')->whereNotNull('token_encrypted')->count());
        $this->assertNull(DB::table('calendar_feeds')->whereNotNull('revoked_at')->sole()->token_encrypted);
        $this->actingAsApi($this->agent)->apiGet('/api/me/calendar-feed')->assertJsonPath('data.url', $second);
    }

    /** Le blocage du compte révoque ses liens par une autre voie : il efface aussi la copie. */
    public function test_blocking_the_account_clears_the_copy(): void
    {
        $this->issue();

        $root = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($root, 'super_admin');
        $this->actingAsWithStepUp($root);
        $this->apiPost("/api/admin/users/{$this->agent->id}/block", ['reason' => 'Fraude signalée par trois locataires.'])->assertOk();

        $this->assertNotNull(DB::table('calendar_feeds')->value('revoked_at'));
        $this->assertNull(DB::table('calendar_feeds')->value('token_encrypted'));
    }

    /** L'effacement du compte garde sa ligne (suppression douce) : il révoque le lien et efface la copie. */
    public function test_erasing_the_account_clears_the_copy(): void
    {
        $this->issue();

        $request = AccountDeletionRequest::factory()->for($this->agent)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request, notifier: false);

        $this->assertNotNull(DB::table('calendar_feeds')->value('revoked_at'));
        $this->assertNull(DB::table('calendar_feeds')->value('token_encrypted'));
    }

    /** Un lien créé avant ADR-0121 n'a pas de copie : `url` est nul, la clé présente. */
    public function test_a_feed_without_a_copy_reads_as_null(): void
    {
        CalendarFeed::query()->create([
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
            'token_hash' => CalendarFeed::hashToken(str_repeat('a', 40)),
        ]);

        $this->assertUrlNull(active: true);
    }

    /** Une copie indéchiffrable (clé perdue, valeur altérée) se lit comme une absence, jamais un 500. */
    public function test_an_undecryptable_copy_reads_as_null(): void
    {
        $this->issue();
        DB::table('calendar_feeds')->update(['token_encrypted' => 'pas-un-chiffre']);

        $this->assertUrlNull(active: true);
    }
}
