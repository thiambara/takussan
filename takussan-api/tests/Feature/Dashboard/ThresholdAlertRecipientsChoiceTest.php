<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\Capability;
use App\Models\NotificationPreference;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Notifications\ThresholdAlertTriggered;
use App\Services\Notifications\Whatsapp\WhatsappDriverInterface;
use App\Services\Notifications\Whatsapp\WhatsappMessage;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2866 — AC3 : une alerte de seuil choisit QUI elle prévient (`recipient_ids`, un sous-ensemble de
 * `ThresholdAlertRecipients::forMetric()`, vide = tous) et PAR QUEL CANAL (`channel` : `email`,
 * `whatsapp`, `both` ; la cloche part toujours).
 *
 * Le déclenchement passe par les VRAIS canaux (cloche, courriel au pilote `array`, `WhatsappChannel`
 * avec un pilote factice) : ce qui part se relève sur `NotificationSent`, canal par canal.
 */
class ThresholdAlertRecipientsChoiceTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const PHONE = '+221771234567';

    private Agency $agency;

    private User $awa;

    private User $moussa;

    /** @var list<array{to: string, message: WhatsappMessage}> */
    private array $whatsapps = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->awa = $this->agencyAdmin($this->agency);
        $this->awa->update(['first_name' => 'Awa', 'last_name' => 'Diop', 'phone' => self::PHONE, 'phone_verified_at' => now()]);
        $this->moussa = $this->agencyAdmin($this->agency);

        $test = $this;
        $this->app->instance(WhatsappDriverInterface::class, new class($test) implements WhatsappDriverInterface
        {
            public function __construct(private readonly ThresholdAlertRecipientsChoiceTest $test) {}

            public function send(array|string $to, WhatsappMessage $message, array $context = []): array
            {
                $this->test->recevoir((string) $to, $message);

                return [$to => WhatsappResult::sent((string) $to, 'faux', 'wamid.1')];
            }

            public function id(): string
            {
                return 'faux';
            }
        });
    }

    public function recevoir(string $to, WhatsappMessage $message): void
    {
        $this->whatsapps[] = ['to' => $to, 'message' => $message];
    }

    /** @param  array<string, mixed>  $extra */
    private function creer(array $extra, ?User $as = null): TestResponse
    {
        return $this->actingAsApi($as ?? $this->awa)->postJson('/api/threshold-alerts', $extra + [
            'metric' => 'maintenance_open',
            'operator' => '>',
            'threshold' => -1,
            'severity' => 'warning',
            'cooldown_hours' => 24,
        ]);
    }

    /** @return list<string> « <id>:<canal> » pour chaque envoi réussi */
    private function declencher(): array
    {
        $envois = [];
        Event::listen(NotificationSent::class, function (NotificationSent $event) use (&$envois): void {
            if ($event->notification instanceof ThresholdAlertTriggered) {
                $envois[] = $event->notifiable->id.':'.$event->channel;
            }
        });
        $this->artisan('dashboard:check-alerts')->assertExitCode(0);
        sort($envois);

        return $envois;
    }

    public function test_ac3_seule_awa_est_prevenue_par_la_cloche_et_whatsapp_sans_courriel(): void
    {
        // Le consentement d'Awa : WhatsApp coché pour les alertes, numéro vérifié, fenêtre ouverte.
        NotificationPreference::query()->updateOrCreate(['user_id' => $this->awa->id, 'event_type' => 'threshold_alert', 'channel' => 'whatsapp'], ['enabled' => true]);
        WhatsappContact::create(['phone' => self::PHONE, 'opt_in_status' => WhatsappContact::OPT_IN_OPTED_IN, 'opt_in_source' => 'test', 'last_inbound_at' => now()->subHour()]);

        $data = $this->creer(['recipient_ids' => [$this->awa->id], 'channel' => 'whatsapp'])->assertCreated()->json('data');
        $this->assertSame('whatsapp', $data['channel']);
        $this->assertSame([$this->awa->id], $data['recipient_ids']);
        $this->assertSame(['inapp', 'whatsapp'], $data['channels']);
        $this->assertSame(1, $data['recipients']['count']);
        $this->assertSame('Awa Diop', $data['recipients']['users'][0]['name']);

        $this->assertSame([$this->awa->id.':database', $this->awa->id.':whatsapp'], $this->declencher());
        $this->assertCount(1, $this->whatsapps);
        $this->assertSame(self::PHONE, $this->whatsapps[0]['to']);
    }

    public function test_sans_choix_tous_les_admins_par_la_cloche_et_le_courriel_comme_avant(): void
    {
        $data = $this->creer([])->assertCreated()->json('data');
        $this->assertSame('email', $data['channel']);
        $this->assertSame([], $data['recipient_ids']);
        $this->assertSame(['inapp', 'email'], $data['channels']);

        $this->assertSame(collect([$this->awa, $this->moussa])
            ->flatMap(fn (User $u) => ["{$u->id}:database", "{$u->id}:mail"])->sort()->values()->all(), $this->declencher());
        $this->assertSame([], $this->whatsapps);
    }

    public function test_whatsapp_sans_consentement_ne_part_pas_et_ne_se_replie_pas(): void
    {
        // Pas de préférence WhatsApp : le défaut est « non ». La cloche part, rien d'autre.
        $this->creer(['recipient_ids' => [$this->awa->id], 'channel' => 'both'])->assertCreated();

        $this->assertSame([$this->awa->id.':database', $this->awa->id.':mail'], $this->declencher());
        $this->assertSame([], $this->whatsapps);
    }

    public function test_ac3_un_destinataire_qui_ne_lit_pas_le_chiffre_consolide_est_refuse(): void
    {
        $sansRapports = $this->adminWithout($this->agency, Capability::ReportsViewAgency);
        $agent = $this->agencyAgent($this->agency);
        $ailleurs = $this->agencyAdmin(Agency::factory()->create());

        foreach ([$sansRapports, $agent, $ailleurs] as $refuse) {
            $this->creer(['metric' => 'overdue_amount', 'recipient_ids' => [$this->awa->id, $refuse->id]])
                ->assertStatus(422)
                ->assertJsonPath('code', 'threshold_alert.recipient_not_allowed');
        }
        // Sur une mesure non consolidée, l'admin sans `reports.view_agency` peut être prévenu.
        $this->creer(['metric' => 'maintenance_open', 'recipient_ids' => [$sansRapports->id]])->assertCreated();
        $this->assertSame(0, ThresholdAlert::query()->where('metric', 'overdue_amount')->count());
    }

    public function test_changer_la_mesure_re_juge_le_choix_garde(): void
    {
        $sansRapports = $this->adminWithout($this->agency, Capability::ReportsViewAgency);
        $id = $this->creer(['recipient_ids' => [$sansRapports->id]])->assertCreated()->json('data.id');

        $this->actingAsApi($this->awa)->patchJson("/api/threshold-alerts/{$id}", ['metric' => 'overdue_amount'])
            ->assertStatus(422)->assertJsonPath('code', 'threshold_alert.recipient_not_allowed');
        $this->actingAsApi($this->awa)->patchJson("/api/threshold-alerts/{$id}", ['metric' => 'overdue_amount', 'recipient_ids' => []])
            ->assertOk()->assertJsonPath('data.recipient_ids', []);
    }

    public function test_un_choisi_qui_perd_le_droit_n_est_plus_prevenu_et_personne_ne_le_remplace(): void
    {
        $id = $this->creer(['metric' => 'overdue_count', 'recipient_ids' => [$this->moussa->id]])->assertCreated()->json('data.id');
        // Moussa quitte l'agence : son profil d'admin n'est plus actif.
        $this->moussa->agencyAdminProfiles()->update(['status' => AgencyAdminProfileStatus::Archived->value]);

        $this->assertSame([], $this->declencher());
        $this->assertNotNull(ThresholdAlert::query()->find($id)->last_triggered_at);
    }

    public function test_les_candidats_et_le_choix_ne_se_lisent_que_par_qui_peut_modifier(): void
    {
        $id = $this->creer(['recipient_ids' => [$this->awa->id]])->assertCreated()->json('data.id');
        $agent = $this->agencyAgent($this->agency);

        $lu = $this->actingAsApi($agent)->getJson("/api/threshold-alerts/{$id}")->assertOk()->json('data');
        $this->assertNull($lu['recipient_ids']);
        $this->assertSame([], $lu['recipient_candidates']);
        $this->assertNull($this->actingAsApi($agent)->getJson('/api/threshold-alerts')->json('data.0.recipient_ids'));

        $candidats = $this->actingAsApi($this->awa)->getJson('/api/threshold-alerts/recipient-candidates?metric=overdue_amount')->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$this->awa->id, $this->moussa->id], array_column($candidats, 'id'));
        $this->actingAsApi($agent)->getJson('/api/threshold-alerts/recipient-candidates?metric=overdue_amount')->assertForbidden();
        $this->actingAsApi($this->awa)->getJson('/api/threshold-alerts/recipient-candidates?metric=nope')->assertStatus(422);
    }
}
