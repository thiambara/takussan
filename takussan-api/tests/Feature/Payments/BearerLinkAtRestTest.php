<?php

namespace Tests\Feature\Payments;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Enums\PaymentStatus;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-602 (VERIF-602 M2, ADR-0051 §1) — « un vidage de la base sans `APP_KEY` ne donne aucun
 * lien » : le jeton du lien de paiement n'est en clair dans AUCUNE colonne texte de la base, après
 * une relance et une quittance, que le locataire ait un compte ou non. Le balayage est brut : toutes
 * les colonnes `text`, `varchar`, `char`, `json` et `jsonb` du schéma — `app_notifications`,
 * `activity_log`, le journal des webhooks et la file (`jobs`) comprises.
 */
class BearerLinkAtRestTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config()->set('app.frontend_url', 'https://front.test');
        config()->set('laravel-pdf.driver', 'dompdf');
        // La file réelle de la base : une notification mise en file y laisse sa charge.
        config()->set('queue.default', 'database');
    }

    /** Un locataire AVEC compte : relance, paiement par le lien émis par l'agent, quittance. */
    public function test_an_account_holder_flow_leaves_no_token_in_clear(): void
    {
        $ctx = $this->leaseDue(null, ['due_date' => now()->subDay()->toDateString()]);
        $this->spyDriver();

        $this->actingAs($ctx['agent'], 'sanctum');
        $token = $this->tokenOf($this->postJson("/api/lease-payments/{$ctx['payment']->id}/payment-link")->assertOk()->json('data.url'));
        $this->app['auth']->forgetGuards();

        (new SendLeasePaymentReminders)->handle(app(NotificationService::class));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 157500)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->fresh()->status);
        $this->assertGreaterThan(0, DB::table('app_notifications')->count(), 'la cloche a bien reçu la relance et la quittance');

        $this->assertSame([], $this->columnsHolding($token));
    }

    /**
     * Un locataire SANS compte : le lien part par SMS (relance, quittance), et la notification mise
     * en file qui le porte est chiffrée — sa charge dans `jobs` ne le contient pas.
     */
    public function test_a_contact_without_account_flow_leaves_no_token_in_clear(): void
    {
        Carbon::setTestNow(now());
        $ctx = $this->leaseDue(null, ['due_date' => now()->subDay()->toDateString()]);
        $ctx['lease']->tenant->forceFill(['user_id' => null, 'phone' => '+221771234567'])->save();
        $this->spyDriver();

        (new SendLeasePaymentReminders)->handle(app(NotificationService::class));
        $this->assertGreaterThan(0, DB::table('jobs')->count(), 'la relance est en file');
        $token = $this->tokenOf(app(LeasePaymentLinkService::class)->urlFor($ctx['payment']));

        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 157500)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->fresh()->status);
        $this->assertGreaterThanOrEqual(2, DB::table('jobs')->count(), 'relance et quittance en file');

        $this->assertSame([], $this->columnsHolding($token));
    }

    /**
     * La règle vit dans le service, pas seulement chez les émetteurs : un paramètre porteur passé
     * pour un COMPTE est retiré avant la cloche et avant l'envoi.
     */
    public function test_the_service_strips_bearer_params_sent_to_an_account(): void
    {
        $ctx = $this->leaseDue();
        $url = 'https://front.test/pay/'.str_repeat('Q', 43);

        $row = app(NotificationService::class)->send($ctx['tenant'], NotificationCode::LeasePaymentSettledOnline, [
            'amount' => NotificationRenderer::money(150000, 'XOF'),
            'property' => 'Villa',
            'receipt_url' => $url,
        ]);

        $this->assertArrayNotHasKey('receipt_url', $row->params);
        $this->assertStringNotContainsString(str_repeat('Q', 43), (string) $row->body);
        $this->assertSame([], $this->columnsHolding(str_repeat('Q', 43)));
    }

    private function tokenOf(string $url): string
    {
        $token = substr($url, strlen('https://front.test/pay/'));
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $token);

        return $token;
    }

    /** @return list<string> les colonnes où le jeton apparaît EN CLAIR */
    private function columnsHolding(string $token): array
    {
        $hits = [];
        $columns = DB::select("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'character', 'json', 'jsonb')");
        $this->assertNotEmpty($columns);
        foreach ($columns as $c) {
            $n = DB::table($c->table_name)->whereRaw('"'.$c->column_name.'"::text LIKE ?', ['%'.$token.'%'])->count();
            if ($n > 0) {
                $hits[] = "{$c->table_name}.{$c->column_name}={$n}";
            }
        }

        return $hits;
    }
}
