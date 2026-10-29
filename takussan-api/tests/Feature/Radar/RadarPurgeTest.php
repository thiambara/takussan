<?php

namespace Tests\Feature\Radar;

use App\Console\Commands\RadarPurge;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Radar\RadarAdvertiserDirectory;
use App\Services\Radar\RadarPurger;
use App\Support\RadarPhone;
use Carbon\Carbon;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2391 (ADR-0077 §9, AC2 à AC4) — la purge : une annonce jamais publiée s'efface à 90 jours ou dès un STOP, l'empreinte d'un refus
 * reste, la preuve d'un accord survit tant qu'un bien qu'elle justifie est en ligne. Idempotente, et elle journalise ses comptes.
 */
class RadarPurgeTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private User $operateur;

    private string $disque;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-29 10:00:00');
        // Les suites de la révocation éprouvent le job ; ici, la purge se lance à la main, à l'instant voulu.
        Queue::fake();
        $this->disque = (string) config('media-library.disk_name');
        Storage::fake($this->disque);
        $this->operateur = $this->operateur(PlatformProfileLevel::SuperAdmin);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // --- Outils ------------------------------------------------------------------------------------

    private static function jpeg(int $teinte = 120): string
    {
        $image = imagecreatetruecolor(16, 12);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, $teinte, 83, 50));
        ob_start();
        imagejpeg($image);

        return (string) ob_get_clean();
    }

    /** @param  array<string, mixed>  $surcharge */
    private function annonceur(array $surcharge = []): RadarAdvertiser
    {
        return RadarAdvertiser::factory()->create($surcharge + ['phone' => self::NUMERO, 'display_name' => 'Awa Diop', 'nature' => RadarAdvertiserNature::ProbableOwner, 'nature_signals' => ['signal']]);
    }

    /**
     * Un message déjà purgé retient la ligne de l'annonceur : sans refus, sans message ni accord, la purge la supprime avec sa dernière
     * annonce (épreuve à part). Les épreuves qui lisent l'annonceur après coup en ont besoin.
     */
    private function retenir(RadarAdvertiser $annonceur): void
    {
        RadarOutreach::factory()->create(['radar_advertiser_id' => $annonceur->id, 'salutation' => '', 'summary' => '', 'message' => '']);
    }

    /**
     * Une annonce lue, avec sa capture et sa réserve de photos sur le disque privé.
     *
     * @param  array<string, mixed>  $surcharge
     */
    private function annonce(RadarAdvertiser $annonceur, array $surcharge = []): RadarListing
    {
        $annonce = RadarListing::factory()->extracted()->create($surcharge + [
            'radar_advertiser_id' => $annonceur->id,
            'stage' => RadarListingStage::Reviewed,
            'source_kind' => RadarSourceKind::Url,
            'source_url' => 'https://sn.coinafrique.com/annonce/'.fake()->unique()->numerify('#####'),
            'photo_urls' => ['https://a.cdn.test/p/1.jpg'],
        ]);
        $capture = $annonce->addMediaFromString(self::jpeg(10))->usingFileName('capture.jpg')->toMediaCollection('radar_captures');
        $photo = $annonce->addMediaFromString(self::jpeg(200))->usingFileName('photo.jpg')->toMediaCollection('radar_photos');
        $annonce->forceFill(['photo_preparation' => [['url' => 'https://a.cdn.test/p/1.jpg', 'media_id' => $photo->id]], 'source_photo_hashes' => [['url' => 'https://a.cdn.test/p/1.jpg', 'hash' => 'abc']]])->save();
        $this->assertSame(2, Media::query()->where('model_id', $annonce->id)->where('model_type', $annonce->getMorphClass())->count());
        $this->assertNotEmpty(Storage::disk($this->disque)->allFiles());

        return $annonce->fresh();
    }

    private function purger(?int $annonceurId = null): array
    {
        return app(RadarPurger::class)->run($annonceurId);
    }

    private function jours(int $n): void
    {
        Carbon::setTestNow(Carbon::now()->addDays($n));
    }

    /** @return list<string> */
    private function fichiers(): array
    {
        return Storage::disk($this->disque)->allFiles();
    }

    private function suggestion(string $usage, $sujet, AiSuggestionDecision $decision = AiSuggestionDecision::Edited): AiSuggestion
    {
        return AiSuggestion::query()->create([
            'usage_key' => $usage, 'subject_type' => $sujet->getMorphClass(), 'subject_id' => $sujet->getKey(),
            'proposal' => ['title' => 'Villa de Awa au 77 123 45 67', 'price' => 450000], 'confidence' => 0.9,
            'input_snapshot' => 'Texte envoyé au modèle', 'decision' => $decision, 'decided_by_id' => $this->operateur->id,
            'decided_at' => now(), 'final_value' => ['title' => 'Villa de Awa'], 'correction_diff' => ['title' => ['from' => 'a', 'to' => 'b']],
        ]);
    }

    // --- AC2 : 89 jours intact, 91 jours purgé -----------------------------------------------------

    public function test_ac2_une_annonce_de_89_jours_est_intacte_celle_de_91_jours_n_a_plus_ni_texte_ni_capture_ni_telephone(): void
    {
        $annonceur = $this->annonceur();
        $this->retenir($annonceur);
        $annonce = $this->annonce($annonceur, ['raw_text' => 'Villa à louer, appelez Awa au 77 123 45 67']);
        $avant = $annonce->only(['raw_text', 'extracted', 'source_url', 'photo_urls', 'photo_preparation']);

        $this->jours(89);
        $this->assertSame(0, $this->purger()['listings']);

        $apres = $annonce->fresh();
        $this->assertSame(RadarListingStage::Reviewed, $apres->stage);
        $this->assertSame($avant, $apres->only(['raw_text', 'extracted', 'source_url', 'photo_urls', 'photo_preparation']));
        $this->assertNotEmpty($this->fichiers());
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);

        $this->jours(2);
        $comptes = $this->purger();

        $this->assertSame(1, $comptes['listings']);
        $this->assertSame(2, $comptes['media']);
        $purgee = $annonce->fresh();
        $this->assertSame(RadarListingStage::Purged, $purgee->stage);
        $this->assertNull($purgee->raw_text);
        $this->assertNull($purgee->extracted);
        $this->assertNull($purgee->source_url);
        $this->assertSame([], $purgee->photo_urls);
        $this->assertNull($purgee->photo_preparation);
        $this->assertSame(0, $purgee->media()->count());
        $this->assertSame([], $this->fichiers());
        // Le téléphone et le nom de l'annonceur partent avec sa dernière annonce.
        $annonceur->refresh();
        $this->assertNull($annonceur->phone);
        $this->assertNull($annonceur->display_name);
        $this->assertSame([], $annonceur->nature_signals);
        $this->assertSame(RadarAdvertiserNature::Unknown, $annonceur->nature);
    }

    public function test_une_annonce_purgee_garde_son_etape_son_site_ses_dates_et_son_empreinte(): void
    {
        $annonceur = $this->annonceur();
        $this->retenir($annonceur);
        $annonce = $this->annonce($annonceur);
        $avant = $annonce->only(['content_fingerprint', 'source_site', 'source_kind', 'created_at', 'purge_at', 'source_photo_hashes', 'matches', 'captured_by', 'radar_advertiser_id']);

        $this->jours(91);
        $this->purger();

        $this->assertEquals($avant, $annonce->fresh()->only(array_keys($avant)));
    }

    public function test_la_purge_vise_aussi_les_annonces_closes_jamais_publiees(): void
    {
        $annonceur = $this->annonceur();
        $stages = [RadarListingStage::Captured, RadarListingStage::ExtractionFailed, RadarListingStage::Duplicate, RadarListingStage::Discarded,
            RadarListingStage::Refused, RadarListingStage::DoNotContact, RadarListingStage::Consented, RadarListingStage::Contacted];
        $annonces = array_map(fn (RadarListingStage $s) => $this->annonce($annonceur, ['stage' => $s]), $stages);

        $this->jours(91);
        $this->assertSame(count($stages), $this->purger()['listings']);

        foreach ($annonces as $annonce) {
            $this->assertSame(RadarListingStage::Purged, $annonce->fresh()->stage);
        }
    }

    public function test_une_annonce_publiee_ou_liee_a_un_bien_n_est_jamais_purgee(): void
    {
        $annonceur = $this->annonceur();
        $bien = Property::factory()->create();
        $publiee = $this->annonce($annonceur, ['stage' => RadarListingStage::Published, 'property_id' => $bien->id]);
        // Le bien a été supprimé depuis (`property_id` remis à null par la clé étrangère) : l'annonce a été publiée.
        $orpheline = $this->annonce($annonceur, ['stage' => RadarListingStage::Published]);
        // Liée à un bien sans être à l'étape `published` : le lien au bien suffit à la tenir hors de la purge.
        $liee = $this->annonce($annonceur, ['stage' => RadarListingStage::Reviewed, 'property_id' => $bien->id]);

        $this->jours(400);
        $this->assertSame(0, $this->purger()['listings']);

        foreach ([$publiee, $orpheline, $liee] as $annonce) {
            $apres = $annonce->fresh();
            $this->assertSame($annonce->stage, $apres->stage);
            $this->assertNotNull($apres->raw_text);
            $this->assertNotNull($apres->extracted);
            $this->assertSame(2, $apres->media()->count());
        }
        // L'annonceur a des annonces restantes : son numéro reste.
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);
    }

    public function test_la_date_de_purge_court_depuis_la_premiere_saisie_une_relance_ne_la_repousse_pas(): void
    {
        $annonceur = $this->annonceur();
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::ExtractionFailed]);
        $date = $annonce->purge_at;

        $this->jours(60);
        // Recoller l'annonce la remet en file (`captured`) : la date n'est pas repoussée.
        $annonce->forceFill(['stage' => RadarListingStage::Captured])->save();
        $this->assertTrue($date->equalTo($annonce->fresh()->purge_at));

        $this->jours(31);
        $this->assertSame(1, $this->purger()['listings']);
    }

    public function test_les_champs_extraits_numeros_ecartes_et_passages_cites_compris_s_effacent_avec_la_fiche(): void
    {
        $annonceur = $this->annonceur();
        $annonce = RadarListing::factory()->extracted([
            'phones' => ['+221771234567'],
            'phones_dropped' => ['+221709998877'],
            'advertiser_name' => ['value' => 'Awa Diop', 'evidence' => 'Awa Diop 77 123 45 67'],
        ])->create(['radar_advertiser_id' => $annonceur->id, 'stage' => RadarListingStage::Reviewed, 'raw_text' => 'Awa Diop 77 123 45 67']);

        $this->jours(91);
        $this->purger();

        $json = json_encode($annonce->fresh()->getAttributes(), JSON_UNESCAPED_UNICODE);
        foreach (['771234567', '709998877', 'Awa Diop', '77 123 45 67'] as $trace) {
            $this->assertStringNotContainsString($trace, (string) $json);
        }
    }

    // --- Les suggestions de l'IA -------------------------------------------------------------------

    public function test_les_suggestions_du_sujet_perdent_leurs_champs_mais_gardent_leur_ligne_et_le_taux_d_acceptation(): void
    {
        $annonceur = $this->annonceur();
        $annonce = $this->annonce($annonceur);
        $edited = $this->suggestion('radar.extraction', $annonce);
        $this->suggestion('radar.extraction', $annonce, AiSuggestionDecision::Accepted);
        $autre = $this->annonce($this->annonceur(['phone' => '+221772223344']));
        $intacte = $this->suggestion('radar.extraction', $autre);
        $taux = app(SuggestionRecorder::class)->acceptanceRates(now()->subDay());

        $this->jours(91);
        // L'autre annonce est aussi échue : on ne purge que la première, à la main, par son annonceur.
        $this->purger($annonceur->id);

        $this->assertSame(2, AiSuggestion::query()->where('subject_id', $annonce->id)->count());
        $apres = $edited->fresh();
        $this->assertSame([], $apres->proposal);
        $this->assertNull($apres->input_snapshot);
        $this->assertNull($apres->final_value);
        $this->assertNull($apres->correction_diff);
        $this->assertSame(AiSuggestionDecision::Edited, $apres->decision);
        $this->assertNotNull($apres->decided_at);
        $this->assertSame('radar.extraction', $apres->usage_key);
        // L'annonce d'un autre annonceur, échue mais non purgée par ce passage, garde sa suggestion.
        $this->assertSame('Texte envoyé au modèle', $intacte->fresh()->input_snapshot);
        $this->assertEquals($taux, app(SuggestionRecorder::class)->acceptanceRates(Carbon::now()->subDays(92)));
    }

    // --- AC3 et « dès un STOP » --------------------------------------------------------------------

    public function test_stop_purge_tout_de_suite_les_annonces_non_echues_de_l_annonceur(): void
    {
        $annonceur = $this->annonceur(['do_not_contact_at' => now()]);
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::DoNotContact]);
        $autre = $this->annonce($this->annonceur(['phone' => '+221772223344']));
        $siens = $annonce->media()->pluck('id')->map(fn ($id) => "{$id}/")->all();
        $siensDeLAutre = $autre->media()->pluck('id')->map(fn ($id) => "{$id}/")->all();

        $comptes = $this->purger();

        $this->assertSame(1, $comptes['listings']);
        $this->assertSame(RadarListingStage::Purged, $annonce->fresh()->stage);
        $this->assertNull($annonce->fresh()->raw_text);
        $dossiers = array_unique(array_map(fn (string $f) => explode('/', $f)[0].'/', $this->fichiers()));
        $this->assertSame([], array_intersect($siens, $dossiers));
        $this->assertEqualsCanonicalizing($siensDeLAutre, array_values($dossiers));
        // Une annonce non échue d'un annonceur qui n'a rien dit reste intacte.
        $this->assertSame(RadarListingStage::Reviewed, $autre->fresh()->stage);
    }

    public function test_ac3_apres_la_purge_d_un_annonceur_qui_a_dit_stop_une_nouvelle_annonce_de_son_numero_est_do_not_contact(): void
    {
        $annonceur = $this->annonceur(['do_not_contact_at' => now()]);
        $this->annonce($annonceur, ['stage' => RadarListingStage::DoNotContact]);

        $this->purger();

        $apres = $annonceur->fresh();
        $this->assertNull($apres->phone);
        $this->assertNull($apres->display_name);
        $this->assertSame(RadarPhone::hmac(self::NUMERO), $apres->phone_hmac);
        $this->assertNotNull($apres->do_not_contact_at);
        $this->assertSame($annonceur->id, app(RadarAdvertiserDirectory::class)->refusedAmong([self::NUMERO])?->id);

        $this->actingAsWithStepUp($this->operateur);
        $this->postJson('/api/admin/radar/listings', ['text' => 'Appartement F4 à louer aux Almadies, 450.000f/mois. Contact 77 123 45 67'])
            ->assertCreated()->assertJsonPath('data.0.stage', 'do_not_contact');
        // Le numéro ne revient JAMAIS en clair chez celui qui a refusé.
        $this->assertNull($annonceur->fresh()->phone);
    }

    public function test_un_annonceur_purge_sans_refus_retrouve_son_numero_quand_il_revient(): void
    {
        $annonceur = $this->annonceur();
        RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $annonce = $this->annonce($annonceur);

        $this->jours(91);
        $this->purger();
        $this->assertNull($annonceur->fresh()->phone);

        $retrouve = app(RadarAdvertiserDirectory::class)->findOrCreate(self::NUMERO);

        $this->assertSame($annonceur->id, $retrouve->id);
        $this->assertSame(self::NUMERO, $retrouve->fresh()->phone);
        $this->assertSame(RadarListingStage::Purged, $annonce->fresh()->stage);
    }

    public function test_un_annonceur_sans_refus_ni_message_ni_accord_disparait_avec_sa_derniere_annonce(): void
    {
        $annonceur = $this->annonceur();
        $annonce = $this->annonce($annonceur);

        $this->jours(91);
        $comptes = $this->purger();

        $this->assertSame(1, $comptes['advertisers_deleted']);
        $this->assertNull(RadarAdvertiser::query()->find($annonceur->id));
        $this->assertNull($annonce->fresh()->radar_advertiser_id);
        $this->assertSame(RadarListingStage::Purged, $annonce->fresh()->stage);
    }

    // --- Les messages et les réponses --------------------------------------------------------------

    public function test_le_message_d_un_annonceur_jamais_publie_perd_ses_textes_et_la_reponse_non_confirmee_ses_captures(): void
    {
        $annonceur = $this->annonceur();
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::Contacted]);
        $message = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $reponse = RadarConsent::factory()->verified(['transcript' => 'Awa : OUI 77 123 45 67', 'counterpart_phone' => self::NUMERO])
            ->create(['radar_outreach_id' => $message->id, 'transcript' => 'Awa : OUI 77 123 45 67']);
        $reponse->addMediaFromString(self::jpeg(50))->usingFileName('reponse.jpg')->toMediaCollection('radar_consent_captures');
        $sMessage = $this->suggestion('radar.message_accord', $message);
        $sReponse = $this->suggestion('radar.verification_accord', $reponse);

        $this->jours(91);
        $comptes = $this->purger();

        $this->assertSame(1, $comptes['outreaches']);
        $this->assertSame(1, $comptes['replies']);
        $apres = $message->fresh();
        $this->assertSame(['', '', ''], [$apres->salutation, $apres->summary, $apres->message]);
        $this->assertNotNull($apres->sent_at);
        $this->assertSame($annonceur->id, $apres->radar_advertiser_id);
        $r = $reponse->fresh();
        $this->assertNull($r->transcript);
        $this->assertNull($r->ai_verdict);
        $this->assertNotNull($r->purged_at);
        $this->assertSame(0, $r->media()->count());
        $this->assertSame([], $this->fichiers());
        $this->assertSame([], $sMessage->fresh()->proposal);
        $this->assertNull($sReponse->fresh()->input_snapshot);
        // L'annonceur, avec un message, garde sa ligne ; son numéro est effacé.
        $this->assertNull($annonceur->fresh()->phone);
    }

    public function test_le_message_reste_tant_qu_une_annonce_qu_il_couvre_n_est_pas_purgee(): void
    {
        $annonceur = $this->annonceur();
        $echue = $this->annonce($annonceur, ['stage' => RadarListingStage::Contacted]);
        $this->jours(60);
        $recente = $this->annonce($annonceur, ['stage' => RadarListingStage::Contacted]);
        $message = RadarOutreach::factory()->withListings($echue, $recente)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $texte = $message->message;

        $this->jours(31);
        $comptes = $this->purger();

        $this->assertSame(1, $comptes['listings']);
        $this->assertSame(0, $comptes['outreaches']);
        $this->assertSame($texte, $message->fresh()->message);
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);
    }

    // --- AC4 : la preuve ---------------------------------------------------------------------------

    /**
     * Un annonceur dont une annonce est publiée sur un bien public, couverte par un accord confirmé (avec capture).
     *
     * @return array{0: RadarAdvertiser, 1: RadarListing, 2: Property, 3: RadarConsent, 4: RadarOutreach}
     */
    private function publie(): array
    {
        $annonceur = $this->annonceur();
        $bien = Property::factory()->create(['status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now()]);
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::Published, 'property_id' => $bien->id]);
        $message = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $accord = RadarConsent::factory()->confirmed($this->operateur)->verified(['transcript' => 'OUI'])
            ->create(['radar_outreach_id' => $message->id, 'transcript' => 'Awa : OUI']);
        $accord->addMediaFromString(self::jpeg(70))->usingFileName('accord.jpg')->toMediaCollection('radar_consent_captures');

        return [$annonceur, $annonce, $bien, $accord, $message];
    }

    private function retirer(Property $bien): void
    {
        $bien->forceFill(['status' => PropertyStatus::Archived, 'visibility' => PropertyVisibility::Private, 'published_at' => null, 'archived_at' => now()])->save();
    }

    public function test_ac4_une_preuve_qui_justifie_un_bien_encore_publie_survit_a_la_purge(): void
    {
        [, , , $accord, $message] = $this->publie();
        $texte = $message->message;

        $this->jours(365 * 5);
        $comptes = $this->purger();

        $this->assertSame(0, $comptes['proofs']);
        $apres = $accord->fresh();
        $this->assertNull($apres->purged_at);
        $this->assertNull($apres->offline_since);
        $this->assertSame('Awa : OUI', $apres->transcript);
        $this->assertNotNull($apres->ai_verdict);
        $this->assertSame(1, $apres->media()->count());
        $this->assertSame($texte, $message->fresh()->message);
    }

    public function test_apres_le_retrait_du_dernier_bien_la_preuve_est_gardee_trois_ans_puis_effacee(): void
    {
        [$annonceur, , $bien, $accord, $message] = $this->publie();
        $texte = $message->message;
        $this->retirer($bien);

        // Le premier passage constate le retrait ; la date court de là.
        $comptes = $this->purger();
        $this->assertSame(1, $comptes['retention_started']);
        $this->assertTrue(now()->equalTo($accord->fresh()->offline_since));

        $this->jours(365 * 3 - 1);
        $this->assertSame(0, $this->purger()['proofs']);
        $this->assertNull($accord->fresh()->purged_at);
        $this->assertSame($texte, $message->fresh()->message);

        $this->jours(2);
        $comptes = $this->purger();

        $this->assertSame(1, $comptes['proofs']);
        $apres = $accord->fresh();
        $this->assertNotNull($apres->purged_at);
        $this->assertNull($apres->transcript);
        $this->assertNull($apres->ai_verdict);
        $this->assertSame(0, $apres->media()->count());
        $this->assertNotNull($apres->confirmed_at);
        $this->assertNotEmpty($apres->capture_hashes);
        // Le message qu'elle prouvait part avec elle, au même passage ; l'annonce publiée garde sa matière collectée.
        $this->assertSame('', $message->fresh()->message);
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);
    }

    public function test_purger_une_reponse_en_cours_de_verification_la_sort_de_pending_et_laisse_les_autres_statuts(): void
    {
        $annonceur = $this->annonceur(['do_not_contact_at' => now()]);
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::DoNotContact]);
        $message = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $enCours = RadarConsent::factory()->create(['radar_outreach_id' => $message->id, 'verification_status' => 'pending']);
        $faite = RadarConsent::factory()->verified(['transcript' => 'OUI'])->create(['radar_outreach_id' => $message->id]);

        $this->purger();

        $enCours->refresh();
        $this->assertNotNull($enCours->purged_at);
        $this->assertSame(['failed', 'radar.verification.purged'], [$enCours->verification_status->value, $enCours->verification_reason]);
        // Une vérification terminée garde son statut : `done` dit seulement qu'elle a eu lieu.
        $faite->refresh();
        $this->assertNotNull($faite->purged_at);
        $this->assertSame('done', $faite->verification_status->value);
    }

    public function test_un_bien_qui_revient_en_ligne_efface_la_date_de_retrait_de_la_preuve(): void
    {
        [, , $bien, $accord] = $this->publie();
        $this->retirer($bien);
        $this->purger();
        $this->assertNotNull($accord->fresh()->offline_since);

        $this->jours(30);
        $bien->forceFill(['status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now(), 'archived_at' => null])->save();
        $comptes = $this->purger();

        $this->assertSame(1, $comptes['retention_reset']);
        $this->assertNull($accord->fresh()->offline_since);
    }

    public function test_les_trois_ans_courent_du_dernier_retrait_pas_d_une_revocation_anterieure_a_une_republication(): void
    {
        [, , $bien, $accord] = $this->publie();
        // T0 : révocation, le bien sort ; le premier passage date le retrait.
        $this->retirer($bien);
        $accord->forceFill(['revoked_at' => now()])->save();
        $this->purger();
        $this->assertTrue(now()->equalTo($accord->fresh()->offline_since));

        // T0 + 1 an : l'hôte republie, le passage suivant efface la date.
        $this->jours(365);
        $bien->forceFill(['status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now(), 'archived_at' => null])->save();
        $this->assertSame(1, $this->purger()['retention_reset']);

        // T0 + 2,5 ans : le bien ressort. La date est celle de CE retrait, non la révocation de T0.
        $this->jours(550);
        $this->retirer($bien);
        $this->purger();
        $retrait = now()->copy();
        $this->assertTrue($retrait->equalTo($accord->fresh()->offline_since));

        // 200 jours plus tard (3,05 ans après T0) : la preuve est encore là, elle ne partira que trois ans après le dernier retrait.
        $this->jours(200);
        $this->assertSame(0, $this->purger()['proofs']);
        $this->assertNull($accord->fresh()->purged_at);

        $this->jours(365 * 3 - 200 + 1);
        $this->assertSame(1, $this->purger()['proofs']);
    }

    public function test_un_accord_confirme_dont_l_annonce_attend_sa_publication_n_est_pas_encore_hors_ligne(): void
    {
        $annonceur = $this->annonceur();
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::Consented]);
        $message = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $accord = RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $message->id, 'transcript' => 'OUI']);

        $this->assertSame(0, $this->purger()['retention_started']);
        $this->assertNull($accord->fresh()->offline_since);

        // 91 jours : l'annonce jamais publiée s'efface, la preuve commence alors son décompte de trois ans.
        $this->jours(91);
        $comptes = $this->purger();
        $this->assertSame(1, $comptes['listings']);
        $this->assertSame(1, $comptes['retention_started']);
        $this->assertSame('OUI', $accord->fresh()->transcript);
        $this->assertSame($message->message, $message->fresh()->message);
    }

    public function test_une_preuve_ne_se_purge_pas_sans_date_de_retrait_meme_tres_ancienne(): void
    {
        [, , , $accord] = $this->publie();
        $accord->forceFill(['created_at' => now()->subYears(10)])->save();

        $this->purger();

        $this->assertNull($accord->fresh()->purged_at);
    }

    public function test_les_routes_de_lecture_rendent_une_fiche_purgee_sans_planter(): void
    {
        $annonceur = $this->annonceur(['do_not_contact_at' => now()]);
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::DoNotContact]);
        $message = RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);
        $reponse = RadarConsent::factory()->create(['radar_outreach_id' => $message->id]);
        $this->purger();
        $this->actingAsWithStepUp($this->operateur);

        $this->getJson("/api/admin/radar/listings/{$annonce->id}")->assertOk()
            ->assertJsonPath('data.stage', 'purged')->assertJsonPath('data.raw_text', null);
        $this->getJson('/api/admin/radar/listings')->assertOk()->assertJsonPath('data.0.stage', 'purged');
        $fiche = $this->getJson("/api/admin/radar/advertisers/{$annonceur->id}")->assertOk();
        $fiche->assertJsonPath('data.phone', null)->assertJsonPath('data.display_name', null);
        $this->assertNotNull($reponse->fresh()->purged_at);
    }

    // --- Les fichiers sans ligne -------------------------------------------------------------------

    /** Un fichier posé sous un dossier numérique, daté de `$minutes` minutes avant l'instant simulé. */
    private function fichierOrphelin(string $chemin, int $minutes): void
    {
        $disque = Storage::disk($this->disque);
        $disque->put($chemin, self::jpeg(33));
        touch($disque->path($chemin), now()->subMinutes($minutes)->getTimestamp());
    }

    public function test_un_fichier_sans_ligne_media_est_balaye_apres_une_heure_pas_avant(): void
    {
        // Le fichier d'un commit défait ou d'un worker coupé : son identifiant de média est brûlé, aucune ligne ne le référence.
        $this->fichierOrphelin('987654/photo-abc.jpg', 61);
        $this->fichierOrphelin('987654/conversions/photo-abc-thumb.jpg', 61);
        $this->fichierOrphelin('987655/photo-def.jpg', 30);

        $comptes = $this->purger();

        $this->assertSame(1, $comptes['orphan_dirs']);
        $this->assertFalse(Storage::disk($this->disque)->exists('987654/photo-abc.jpg'));
        $this->assertFalse(Storage::disk($this->disque)->exists('987654/conversions/photo-abc-thumb.jpg'));
        // Moins d'une heure : une transaction vivante peut encore y écrire sa ligne.
        $this->assertTrue(Storage::disk($this->disque)->exists('987655/photo-def.jpg'));

        $this->jours(1);
        $this->assertSame(1, $this->purger()['orphan_dirs']);
        $this->assertFalse(Storage::disk($this->disque)->exists('987655/photo-def.jpg'));
    }

    public function test_le_balayage_garde_ce_qu_une_ligne_media_reference_et_ce_qui_n_est_pas_un_dossier_de_media(): void
    {
        $annonce = $this->annonce($this->annonceur());
        $this->retenir($annonce->advertiser);
        $this->fichierOrphelin('exports/archive.zip', 600);
        $this->fichierOrphelin('erasure-ledger/2026-10-29/12-20261029T100000Z.json', 600);
        // Les fichiers de l'annonce ont une ligne `media` : ils restent, quel que soit leur âge ; les autres préfixes du disque ne sont pas des dossiers de média.
        foreach (Storage::disk($this->disque)->allFiles() as $fichier) {
            touch(Storage::disk($this->disque)->path($fichier), now()->subYears(2)->getTimestamp());
        }
        $avant = Storage::disk($this->disque)->allFiles();

        $this->assertSame(0, $this->purger()['orphan_dirs']);

        $this->assertEqualsCanonicalizing($avant, Storage::disk($this->disque)->allFiles());
    }

    public function test_un_dossier_numerique_vide_est_date_comme_un_fichier(): void
    {
        // Le `mkdir` d'une écriture dont le fichier n'est pas encore posé : aussi jeune que lui, il ne se balaie pas.
        $disque = Storage::disk($this->disque);
        $disque->makeDirectory('987660');
        $disque->makeDirectory('987661');
        touch($disque->path('987660'), now()->subMinutes(5)->getTimestamp());
        touch($disque->path('987661'), now()->subMinutes(61)->getTimestamp());

        $this->assertSame(1, $this->purger()['orphan_dirs']);

        $this->assertTrue($disque->exists('987660'));
        $this->assertFalse($disque->exists('987661'));
    }

    public function test_le_passage_d_un_seul_annonceur_ne_balaie_pas_le_disque(): void
    {
        $annonceur = $this->annonceur();
        $this->fichierOrphelin('987654/photo-abc.jpg', 600);

        $this->assertSame(0, $this->purger($annonceur->id)['orphan_dirs']);
        $this->assertTrue(Storage::disk($this->disque)->exists('987654/photo-abc.jpg'));
    }

    // --- Idempotence, journal, planification -------------------------------------------------------

    public function test_la_purge_est_idempotente_et_journalise_ses_comptes_sans_numero(): void
    {
        $annonceur = $this->annonceur(['do_not_contact_at' => now()]);
        $this->annonce($annonceur, ['stage' => RadarListingStage::DoNotContact, 'raw_text' => 'Awa 77 123 45 67']);

        $premier = $this->purger();
        $this->assertSame(1, $premier['listings']);
        $ligne = Activity::query()->where('event', 'radar_purged')->sole();
        $this->assertEquals($premier, $ligne->properties->all());
        $this->assertStringNotContainsString('771234567', $ligne->toJson());

        $second = $this->purger();

        $this->assertSame(0, array_sum($second));
        $this->assertSame(1, Activity::query()->where('event', 'radar_purged')->count());
    }

    public function test_la_commande_affiche_ses_comptes(): void
    {
        $this->annonce($this->annonceur(['do_not_contact_at' => now()]), ['stage' => RadarListingStage::DoNotContact]);

        $this->artisan('radar:purge')->expectsOutputToContain('listings=1')->assertSuccessful();
    }

    public function test_la_purge_est_planifiee_chaque_jour_sans_chevauchement(): void
    {
        $evenements = collect(app(Schedule::class)->events())->filter(fn ($e) => str_contains((string) $e->command, 'radar:purge'));

        $this->assertCount(1, $evenements);
        $this->assertSame('15 4 * * *', $evenements->first()->expression);
        $this->assertTrue($evenements->first()->withoutOverlapping);
        $this->assertSame(RadarPurge::class, get_class($this->app->make(RadarPurge::class)));
    }

    // --- Le job « dès un STOP » --------------------------------------------------------------------

    public function test_le_job_de_stop_purge_l_annonceur_sans_toucher_aux_autres(): void
    {
        $annonceur = $this->annonceur(['do_not_contact_at' => now()]);
        $annonce = $this->annonce($annonceur, ['stage' => RadarListingStage::DoNotContact]);
        $autre = $this->annonce($this->annonceur(['phone' => '+221772223344', 'do_not_contact_at' => now()]), ['stage' => RadarListingStage::DoNotContact]);

        (new PurgeRadarAdvertiser($annonceur->id))->handle(app(RadarPurger::class));

        $this->assertSame(RadarListingStage::Purged, $annonce->fresh()->stage);
        $this->assertSame(RadarListingStage::DoNotContact, $autre->fresh()->stage);
    }
}
