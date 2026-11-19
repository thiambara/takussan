<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MessageRelay;
use App\Models\NotificationPreference;
use App\Models\OwnerWeeklyDigest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\OwnerWeeklyDigestNotification;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Pont\CanalDuPont;
use App\Services\Pont\CapacitesDuCanal;
use App\Services\Pont\EtatDAccord;
use App\Services\Pont\ResultatDEnvoi;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Mockery;
use Tests\ApiTestCase;

/**
 * TCK-2985 (ADR-0132 § 6) — le résumé du lundi du bailleur : un par (bailleur, agence), cloisonné ; seulement à qui
 * l'a activé (jamais par défaut, e-mail compris) ; idempotent par semaine ; la semaine écoulée en heure de Dakar ;
 * par e-mail sans WhatsApp, jamais par SMS ni dans la cloche ; planifié lundi 09:00 `Africa/Dakar`.
 */
class ResumeDuLundiTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $bailleur;

    private Agency $agenceA;

    private Agency $agenceB;

    private Property $bienA;

    private Property $bienB;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        // Lundi 23 novembre 2026, 09:00 à Dakar (UTC+0) : la semaine écoulée va du 16 au 23 novembre exclu.
        Carbon::setTestNow(Carbon::parse('2026-11-23 09:00:00', 'Africa/Dakar'));

        $this->bailleur = User::factory()->create(['email' => 'bailleur@example.test']);
        $this->agenceA = Agency::factory()->create(['name' => 'Agence Almadies']);
        $this->agenceB = Agency::factory()->create(['name' => 'Agence Baobab']);
        foreach ([$this->agenceA, $this->agenceB] as $agence) {
            OwnerProfile::query()->firstOrCreate(['user_id' => $this->bailleur->id, 'agency_id' => $agence->id]);
        }
        $this->bienA = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agenceA->id]);
        $this->bienB = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agenceB->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function activer(User $user, string $canal = PreferenceResolver::CHANNEL_EMAIL, bool $allume = true): void
    {
        // Un compte neuf a déjà ses lignes de préférence (aux défauts) : la case se règle comme l'écran la règle.
        NotificationPreference::query()->updateOrCreate(
            ['user_id' => $user->id, 'event_type' => PreferenceResolver::OWNER_WEEKLY_DIGEST, 'channel' => $canal],
            ['enabled' => $allume],
        );
    }

    private function encaisse(Property $bien, int $montant, string $quand): void
    {
        $bail = Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $bien->agency_id, 'landlord_id' => $this->bailleur->id, 'status' => LeaseStatus::Active,
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $bail->id, 'amount' => $montant, 'status' => PaymentStatus::Paid, 'paid_at' => Carbon::parse($quand, 'Africa/Dakar'),
        ]);
    }

    /** @return list<array<string, mixed>> les paramètres des résumés envoyés au bailleur */
    private function resumes(): array
    {
        $params = [];
        Notification::assertSentTo($this->bailleur, OwnerWeeklyDigestNotification::class, function (OwnerWeeklyDigestNotification $n) use (&$params) {
            $params[] = $n->params;

            return true;
        });

        return $params;
    }

    /** AC1 — un bailleur de deux agences reçoit deux résumés ; chacun ne compte que les biens de son agence. */
    public function test_ac1_deux_agences_deux_resumes_cloisonnes(): void
    {
        $this->activer($this->bailleur);
        $this->encaisse($this->bienA, 100000, '2026-11-18 10:00:00');
        $this->encaisse($this->bienB, 250000, '2026-11-19 10:00:00');
        $this->encaisse($this->bienB, 50000, '2026-11-20 10:00:00');

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        $parAgence = collect($this->resumes())->keyBy('agency');
        $this->assertCount(2, $parAgence);
        $this->assertSame(1, $parAgence['Agence Almadies']['paid_count']);
        $this->assertSame('100000.00', $parAgence['Agence Almadies']['paid_total']['amount']);
        $this->assertSame(2, $parAgence['Agence Baobab']['paid_count']);
        $this->assertSame('300000.00', $parAgence['Agence Baobab']['paid_total']['amount']);
    }

    /** Le bien d'un AUTRE bailleur dans la même agence ne compte pas. */
    public function test_les_biens_d_un_autre_bailleur_ne_comptent_pas(): void
    {
        $this->activer($this->bailleur);
        $autre = User::factory()->create();
        OwnerProfile::query()->firstOrCreate(['user_id' => $autre->id, 'agency_id' => $this->agenceA->id]);
        $bienAutre = Property::factory()->create(['user_id' => $autre->id, 'agency_id' => $this->agenceA->id]);
        $this->encaisse($bienAutre, 999000, '2026-11-18 10:00:00');

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        foreach ($this->resumes() as $params) {
            $this->assertSame(0, $params['paid_count']);
        }
        Notification::assertNotSentTo($autre, OwnerWeeklyDigestNotification::class);
    }

    /** Sans bien géré dans l'agence (ni bien, ou profil propriétaire inactif) : rien. */
    public function test_sans_bien_gere_rien(): void
    {
        $this->activer($this->bailleur);
        $this->bienA->delete();
        OwnerProfile::query()->where('user_id', $this->bailleur->id)->where('agency_id', $this->agenceB->id)->update(['status' => 'suspended']);

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        Notification::assertNothingSent();
    }

    /** AC2 — sans activation, rien, pas même par e-mail ; la case `inapp` (toujours vraie) n'active pas. */
    public function test_ac2_non_active_rien_meme_par_email(): void
    {
        $this->activer($this->bailleur, PreferenceResolver::CHANNEL_INAPP);
        $this->activer($this->bailleur, PreferenceResolver::CHANNEL_EMAIL, false);

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        Notification::assertNothingSent();
        $resolver = app(PreferenceResolver::class);
        $this->assertFalse($resolver->active($this->bailleur, PreferenceResolver::OWNER_WEEKLY_DIGEST));
        $this->assertFalse($resolver->defaultFor(PreferenceResolver::OWNER_WEEKLY_DIGEST, PreferenceResolver::CHANNEL_EMAIL));
        $this->assertSame([PreferenceResolver::CHANNEL_EMAIL, PreferenceResolver::CHANNEL_WHATSAPP], $resolver->channelsFor(PreferenceResolver::OWNER_WEEKLY_DIGEST));
    }

    /** AC2 — la case WhatsApp allumée active le résumé, même sans numéro vérifié : il part alors par e-mail. */
    public function test_la_case_whatsapp_active_et_le_resume_part_par_email(): void
    {
        $this->activer($this->bailleur, PreferenceResolver::CHANNEL_WHATSAPP);

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        $this->assertCount(2, $this->resumes());
        $this->assertSame(['mail'], OwnerWeeklyDigest::query()->pluck('channel')->unique()->values()->all());
    }

    /** AC3 — le résumé part par e-mail seul : ni SMS, ni cloche. */
    public function test_ac3_email_jamais_sms_ni_cloche(): void
    {
        $this->activer($this->bailleur);

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        Notification::assertSentTo($this->bailleur, OwnerWeeklyDigestNotification::class, fn ($n, array $canaux) => $canaux === ['mail']);
        $this->assertDatabaseCount('app_notifications', 0);
        $mail = (new OwnerWeeklyDigestNotification(['agency' => 'Agence Almadies', 'paid_count' => 1, 'paid_total' => ['amount' => '100000.00', 'currency' => 'XOF'],
            'late_count' => 0, 'late_total' => ['amount' => '0.00', 'currency' => 'XOF'], 'maintenance_opened' => 0, 'maintenance_closed' => 0, 'visits' => 2]))
            ->toMail($this->bailleur);
        $this->assertStringContainsString('Agence Almadies', $mail->subject);
    }

    /**
     * Un pilote du pont, nommé `whatsapp` dans `config('messagerie.canaux')` : un double du CONTRAT, jamais du code
     * propre à WhatsApp. `$resultat` : ce que rend `envoyerGabarit()`.
     */
    private function piloteDouble(ResultatDEnvoi|array $resultat, int $envois): void
    {
        $canal = Mockery::mock(CanalDuPont::class);
        $canal->shouldReceive('nom')->andReturn('whatsapp');
        $canal->shouldReceive('capacites')->andReturn(new CapacitesDuCanal(recoit: true, gabarits: true, medias: false, accuses: true, boutons: false, fenetreHeures: 24));
        $canal->shouldReceive('accord')->andReturn(EtatDAccord::Inconnu);
        $canal->shouldReceive('envoyerGabarit')->times($envois)
            ->withArgs(fn (string $tel, string $evenement) => $tel === '+221770000001' && $evenement === 'owner.weekly_digest')
            ->andReturn(...(is_array($resultat) ? $resultat : [$resultat]));
        $canal->shouldNotReceive('envoyerTexte');
        config()->set('messagerie.canaux.whatsapp', ['actif' => true, 'pilote' => 'tck2985.faux-whatsapp']);
        $this->app->instance('tck2985.faux-whatsapp', $canal);
        $this->bailleur->forceFill(['phone' => '+221770000001', 'phone_verified_at' => now()])->save();
    }

    /** AC3 — WhatsApp quand c'est possible : le gabarit par le pilote, un relais `digest` par agence, pas d'e-mail. */
    public function test_ac3_whatsapp_quand_possible_avec_relais_digest(): void
    {
        $this->activer($this->bailleur, PreferenceResolver::CHANNEL_WHATSAPP);
        $this->activer($this->bailleur, PreferenceResolver::CHANNEL_EMAIL);
        $this->piloteDouble([
            new ResultatDEnvoi(ResultatDEnvoi::ENVOYE, 'wamid.D1', 'template', 'resume_hebdo_bailleur', 'PNID'),
            new ResultatDEnvoi(ResultatDEnvoi::ENVOYE, 'wamid.D2', 'template', 'resume_hebdo_bailleur', 'PNID'),
        ], 2);

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        Notification::assertNothingSent();
        $relais = MessageRelay::query()->where('purpose', MessageRelay::PURPOSE_DIGEST)->orderBy('agency_id')->get();
        $this->assertSame([$this->agenceA->id, $this->agenceB->id], $relais->pluck('agency_id')->map(fn ($a) => (int) $a)->sort()->values()->all());
        $this->assertSame([$this->bailleur->id], $relais->pluck('user_id')->map(fn ($u) => (int) $u)->unique()->values()->all());
        $this->assertNull($relais->first()->conversation_id);
    }

    /** AC3 — sans gabarit approuvé (indisponible) : l'e-mail, jamais le SMS. */
    public function test_ac3_sans_gabarit_l_email_jamais_le_sms(): void
    {
        $this->activer($this->bailleur, PreferenceResolver::CHANNEL_WHATSAPP);
        $this->piloteDouble(ResultatDEnvoi::indisponible('gabarit_non_approuve'), 2);

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        $this->assertCount(2, $this->resumes());
        Notification::assertSentTo($this->bailleur, OwnerWeeklyDigestNotification::class, fn ($n, array $canaux) => $canaux === ['mail']);
        $this->assertSame(0, MessageRelay::query()->count());
    }

    /** AC4 — relancée la même semaine, la commande n'envoie rien de plus. */
    public function test_ac4_idempotente_par_semaine(): void
    {
        $this->activer($this->bailleur);

        $this->artisan('owners:weekly-digest')->assertSuccessful();
        $this->artisan('owners:weekly-digest')->assertSuccessful();

        $this->assertCount(2, $this->resumes());
        $this->assertSame(2, OwnerWeeklyDigest::query()->where('week', '2026-W47')->count());
    }

    /** La semaine écoulée, en heure de Dakar : lundi 00:00 compris, lundi suivant 00:00 exclu. */
    public function test_bornes_de_la_semaine(): void
    {
        $this->activer($this->bailleur);
        $this->encaisse($this->bienA, 1000, '2026-11-15 23:59:59'); // dimanche d'avant : hors
        $this->encaisse($this->bienA, 2000, '2026-11-16 00:00:00'); // lundi 00:00 : dedans
        $this->encaisse($this->bienA, 4000, '2026-11-22 23:59:59'); // dimanche 23:59 : dedans
        $this->encaisse($this->bienA, 8000, '2026-11-23 00:00:00'); // ce lundi : hors

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        $a = collect($this->resumes())->firstWhere('agency', 'Agence Almadies');
        $this->assertSame(2, $a['paid_count']);
        $this->assertSame('6000.00', $a['paid_total']['amount']);
    }

    /** Une semaine sans rien : le résumé part quand même (« rien à signaler »). */
    public function test_semaine_sans_rien_part_quand_meme(): void
    {
        $this->activer($this->bailleur);

        $this->artisan('owners:weekly-digest')->assertSuccessful();

        $this->assertCount(2, $this->resumes());
    }

    /** La planification : lundi 09:00, `Africa/Dakar`, sans chevauchement. */
    public function test_planifiee_lundi_9h_heure_de_dakar(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'owners:weekly-digest'));

        $this->assertNotNull($event);
        $this->assertSame('0 9 * * 1', $event->expression);
        $this->assertSame('Africa/Dakar', (string) $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
    }
}
