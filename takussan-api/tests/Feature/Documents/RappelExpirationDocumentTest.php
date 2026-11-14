<?php

namespace Tests\Feature\Documents;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\NotificationPreference;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-2783 — `documents:remind-expiring` prévient à J-60 puis à J-7 (jour de Dakar) le destinataire
 * d'une pièce datée : le compte qui la porte (« Mes pièces »), sinon son téléverseur s'il la lit
 * encore. Une fois par jalon et par date visée ; une nouvelle date réarme.
 *
 * Aujourd'hui, à Dakar : le 2026-10-20.
 */
class RappelExpirationDocumentTest extends TestCase
{
    use RefreshDatabase;

    private ?string $fuseauDOrigine = null;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-20 10:00:00', 'Africa/Dakar'));
    }

    protected function tearDown(): void
    {
        // Le test « serveur hors de Dakar » déplace le fuseau du processus : il ne doit pas fuir.
        if ($this->fuseauDOrigine !== null) {
            date_default_timezone_set($this->fuseauDOrigine);
            config(['app.timezone' => $this->fuseauDOrigine]);
            $this->fuseauDOrigine = null;
        }
        parent::tearDown();
    }

    /** Une pièce de « Mes pièces » : portée par le compte, téléversée par lui. */
    private function maPiece(User $user, ?string $expiry, array $extra = []): Document
    {
        return Document::factory()->create([
            'documentable_type' => User::class,
            'documentable_id' => $user->id,
            'uploaded_by' => $user->id,
            'name' => 'Carte d’identité',
            'type' => DocumentType::IdCard->value,
            'expiry_date' => $expiry,
        ] + $extra);
    }

    private function jour(int $jours): string
    {
        return Carbon::parse('2026-10-20')->addDays($jours)->toDateString();
    }

    private function passer(): void
    {
        $this->artisan('documents:remind-expiring')->assertSuccessful();
    }

    /** @return Collection<int, AppNotification> */
    private function rappels(?User $user = null)
    {
        return AppNotification::query()
            ->where('code', NotificationCode::DocumentExpiringSoon->value)
            ->when($user !== null, fn ($q) => $q->where('user_id', $user->id))
            ->orderBy('id')
            ->get();
    }

    private function agent(Agency $agency, AgentProfileStatus $statut = AgentProfileStatus::Active): User
    {
        $user = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $user->id, 'agency_id' => $agency->id, 'status' => $statut->value]);

        return $user;
    }

    /** AC1 — J-60 : une notification au compte, `days_left = 60` ; un second passage n'en produit pas. */
    public function test_j60_previent_le_porteur_une_seule_fois(): void
    {
        $user = User::factory()->create();
        $piece = $this->maPiece($user, $this->jour(60));
        $avant = $piece->updated_at;

        $this->passer();
        $this->passer();

        $rappels = $this->rappels();
        $this->assertCount(1, $rappels);
        $rappel = $rappels->sole();
        $this->assertSame($user->id, $rappel->user_id);
        $this->assertEquals(['document_name' => 'Carte d’identité', 'expires_at' => '2026-12-19', 'days_left' => 60], $rappel->params);
        $this->assertEquals(['kind' => 'document', 'id' => $piece->id, 'path' => "/app/documents/{$piece->id}"], $rappel->target);
        $this->assertEquals(['expiry_date' => '2026-12-19', 'sent' => [60]], $piece->fresh()->metadata['expiry_reminders']);
        // La mémoire ne touche pas la pièce pour son lecteur.
        $this->assertTrue($piece->fresh()->updated_at->equalTo($avant));
    }

    /** La veille du jalon, rien ; une pièce au-delà de 60 jours non plus. */
    public function test_avant_le_jalon_rien_ne_part(): void
    {
        $user = User::factory()->create();
        $this->maPiece($user, $this->jour(61));

        $this->passer();

        $this->assertCount(0, $this->rappels());
    }

    /** AC2 — à J-7, une seconde notification, `days_left = 7`. */
    public function test_j7_envoie_le_second_rappel(): void
    {
        $user = User::factory()->create();
        $piece = $this->maPiece($user, $this->jour(60));
        $this->passer();

        $this->travelTo(Carbon::parse('2026-12-12 10:00:00', 'Africa/Dakar'));
        $this->passer();
        $this->passer();

        $this->assertSame([60, 7], $this->rappels($user)->map(fn (AppNotification $n) => $n->params['days_left'])->all());
        $this->assertEquals(['expiry_date' => '2026-12-19', 'sent' => [60, 7]], $piece->fresh()->metadata['expiry_reminders']);
    }

    /** AC3 — une pièce saisie à J-5 : le seul rappel de J-7, et les deux jalons marqués. */
    public function test_rattrapage_sans_doublon(): void
    {
        $user = User::factory()->create();
        $piece = $this->maPiece($user, $this->jour(5), ['metadata' => ['source' => 'upload']]);

        $this->passer();
        $this->travel(1)->days();
        $this->passer();

        $rappels = $this->rappels($user);
        $this->assertCount(1, $rappels);
        $this->assertSame(5, $rappels->sole()->params['days_left']);
        $metadata = $piece->fresh()->metadata;
        $this->assertEquals(['expiry_date' => $this->jour(5), 'sent' => [60, 7]], $metadata['expiry_reminders']);
        // La mémoire s'ajoute aux métadonnées existantes, elle ne les remplace pas.
        $this->assertSame('upload', $metadata['source']);
    }

    /** Une pièce qui expire aujourd'hui n'est pas encore expirée : son rattrapage de J-7 part. */
    public function test_le_jour_meme_le_rattrapage_part(): void
    {
        $user = User::factory()->create();
        $this->maPiece($user, $this->jour(0));

        $this->passer();

        $this->assertSame([0], $this->rappels($user)->map(fn (AppNotification $n) => $n->params['days_left'])->all());
    }

    /** AC4 (et AC7, seconde ablation) — une date repoussée d'un an réarme le rappel de J-60. */
    public function test_une_nouvelle_date_rearme_les_jalons(): void
    {
        $user = User::factory()->create();
        $piece = $this->maPiece($user, $this->jour(60));
        $this->passer();

        $piece->fresh()->update(['expiry_date' => '2027-12-19']);
        $this->passer();
        $this->assertCount(1, $this->rappels($user), 'Un an avant la nouvelle date, rien ne part encore.');

        $this->travelTo(Carbon::parse('2027-10-20 10:00:00', 'Africa/Dakar'));
        $this->passer();

        $rappels = $this->rappels($user);
        $this->assertCount(2, $rappels);
        $this->assertEquals(['document_name' => 'Carte d’identité', 'expires_at' => '2027-12-19', 'days_left' => 60], $rappels->last()->params);
        $this->assertEquals(['expiry_date' => '2027-12-19', 'sent' => [60]], $piece->fresh()->metadata['expiry_reminders']);
    }

    /** AC5 — le membre du personnel parti n'est pas prévenu ; témoin : l'agent actif l'est. */
    public function test_le_personnel_parti_n_est_pas_prevenu(): void
    {
        $agency = Agency::factory()->create();
        $fiche = Customer::factory()->create(['agency_id' => $agency->id]);
        $parti = $this->agent($agency, AgentProfileStatus::Inactive);
        $actif = $this->agent($agency);
        $pieceDuParti = Document::factory()->create([
            'documentable_type' => Customer::class, 'documentable_id' => $fiche->id,
            'uploaded_by' => $parti->id, 'expiry_date' => $this->jour(60),
        ]);
        Document::factory()->create([
            'documentable_type' => Customer::class, 'documentable_id' => $fiche->id,
            'uploaded_by' => $actif->id, 'expiry_date' => $this->jour(60),
        ]);

        $this->passer();

        $this->assertSame([$actif->id], $this->rappels()->pluck('user_id')->all());
        // Sans destinataire, le jalon reste libre.
        $this->assertArrayNotHasKey('expiry_reminders', $pieceDuParti->fresh()->metadata ?? []);
    }

    /**
     * AC5 — un document interne ne va jamais au sujet de sa fiche, même membre du personnel et
     * téléverseur ; témoin : l'interne d'un autre agent actif va à cet agent.
     */
    public function test_le_document_interne_ne_va_jamais_a_son_sujet(): void
    {
        $agency = Agency::factory()->create();
        $sujet = $this->agent($agency);
        $collegue = $this->agent($agency);
        $fiche = Customer::factory()->create(['agency_id' => $agency->id, 'user_id' => $sujet->id]);
        foreach ([$sujet, $collegue] as $auteur) {
            Document::factory()->create([
                'documentable_type' => Customer::class, 'documentable_id' => $fiche->id,
                'uploaded_by' => $auteur->id, 'expiry_date' => $this->jour(60), 'is_internal' => true,
            ]);
        }

        $this->passer();

        $this->assertSame([$collegue->id], $this->rappels()->pluck('user_id')->all());
    }

    /**
     * Le personnel se juge sur l'agence DU DOCUMENT, sans profil actif de session : le membre ACTIF de
     * deux agences est prévenu de l'interne qu'il a déposé dans l'une d'elles.
     */
    public function test_le_membre_de_deux_agences_est_prevenu_sur_l_agence_du_document(): void
    {
        $agenceA = Agency::factory()->create();
        $agenceB = Agency::factory()->create();
        $membre = $this->agent($agenceA);
        AgentProfile::query()->create(['user_id' => $membre->id, 'agency_id' => $agenceB->id, 'status' => AgentProfileStatus::Active->value]);
        $fiche = Customer::factory()->create(['agency_id' => $agenceA->id]);
        $piece = Document::factory()->create([
            'documentable_type' => Customer::class, 'documentable_id' => $fiche->id,
            'uploaded_by' => $membre->id, 'expiry_date' => $this->jour(60), 'is_internal' => true,
        ]);

        $this->passer();

        $this->assertSame([$membre->id], $this->rappels()->pluck('user_id')->all());
        // Le profil de l'agence du document n'a servi qu'au jugement : la requête n'en garde rien.
        $this->assertNull(request()->activeProfile());
        $this->assertEquals(['expiry_date' => $this->jour(60), 'sent' => [60]], $piece->fresh()->metadata['expiry_reminders']);
    }

    /**
     * Le membre ACTIF d'une autre agence seulement — parti de celle du document — n'est pas prévenu de
     * l'interne qu'il y avait déposé.
     */
    public function test_le_membre_d_une_autre_agence_n_est_pas_prevenu(): void
    {
        $agenceA = Agency::factory()->create();
        $agenceB = Agency::factory()->create();
        $membre = $this->agent($agenceA, AgentProfileStatus::Inactive);
        AgentProfile::query()->create(['user_id' => $membre->id, 'agency_id' => $agenceB->id, 'status' => AgentProfileStatus::Active->value]);
        $fiche = Customer::factory()->create(['agency_id' => $agenceA->id]);
        foreach ([true, false] as $interne) {
            Document::factory()->create([
                'documentable_type' => Customer::class, 'documentable_id' => $fiche->id,
                'uploaded_by' => $membre->id, 'expiry_date' => $this->jour(60), 'is_internal' => $interne,
            ]);
        }

        $this->passer();

        $this->assertCount(0, $this->rappels());
    }

    /** Ni pièce expirée, ni pièce supprimée, ni pièce sans date. */
    public function test_expiree_supprimee_ou_sans_date_rien_ne_part(): void
    {
        $user = User::factory()->create();
        $this->maPiece($user, $this->jour(-1));
        $this->maPiece($user, null);
        $this->maPiece($user, $this->jour(60))->delete();

        $this->passer();

        $this->assertCount(0, $this->rappels());
    }

    /**
     * AC7 (première ablation) — le jour est celui de DAKAR même quand le serveur tourne ailleurs : à
     * 20:00 à Dakar le 20, il est déjà le 21 à Tokyo. Une pièce qui expire le lendemain à Dakar a
     * encore un jour ; celle du jour même n'est pas expirée ; J-60 tombe le 19 décembre.
     */
    public function test_le_jour_est_celui_de_dakar_meme_si_le_serveur_n_y_est_pas(): void
    {
        $this->fuseauDOrigine = date_default_timezone_get();
        date_default_timezone_set('Asia/Tokyo');
        config(['app.timezone' => 'Asia/Tokyo']);
        $this->travelTo(Carbon::parse('2026-10-20 20:00:00', 'Africa/Dakar')->setTimezone('Asia/Tokyo'));

        $demain = $this->maPiece(User::factory()->create(), '2026-10-21');
        $aujourdhui = $this->maPiece(User::factory()->create(), '2026-10-20');
        $j60 = $this->maPiece(User::factory()->create(), '2026-12-19');

        $this->passer();

        $jours = $this->rappels()->mapWithKeys(fn (AppNotification $n) => [$n->target['id'] => $n->params['days_left']])->all();
        $this->assertSame([$demain->id => 1, $aujourdhui->id => 0, $j60->id => 60], $jours);
    }

    /** Le canal suit les préférences : `document_expiring` coupé en courriel, la cloche reste. */
    public function test_le_canal_suit_les_preferences(): void
    {
        $this->assertContains('document_expiring', PreferenceResolver::EVENTS);
        $this->assertSame('document_expiring', NotificationCode::DocumentExpiringSoon->preferenceEvent());
        $this->assertFalse(NotificationCode::DocumentExpiringSoon->mobile());

        $avecCourriel = User::factory()->create();
        $sansCourriel = User::factory()->create();
        NotificationPreference::query()->updateOrCreate(['user_id' => $sansCourriel->id, 'event_type' => 'document_expiring', 'channel' => 'email'], ['enabled' => false]);
        $this->maPiece($avecCourriel, $this->jour(60));
        $this->maPiece($sansCourriel, $this->jour(60));

        $this->passer();

        $this->assertCount(2, $this->rappels());
        Notification::assertSentTo($avecCourriel, CodedNotification::class, fn (CodedNotification $n, array $canaux) => in_array('mail', $canaux, true));
        // Courriel coupé (et pas de transport de diffusion en test) : aucun canal sortant, la cloche seule.
        $this->assertCount(1, $this->rappels($sansCourriel));
        Notification::assertNotSentTo($sansCourriel, CodedNotification::class);
    }

    /** La commande est planifiée chaque jour à 07:00, heure de Dakar, sans chevauchement. */
    public function test_la_commande_est_planifiee(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn (Event $e) => str_contains((string) $e->command, 'documents:remind-expiring'));

        $this->assertCount(1, $events);
        $event = $events->sole();
        $this->assertSame('0 7 * * *', $event->expression);
        $this->assertSame('Africa/Dakar', $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
    }
}
