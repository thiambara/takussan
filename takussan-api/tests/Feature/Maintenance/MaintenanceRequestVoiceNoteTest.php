<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceJournal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\FichiersReels;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2900 (ADR-0113) — la note vocale du signalement : un fichier de la collection privée
 * `voice_notes` de la demande, déposé par `POST /api/maintenance-requests` sous les bornes de la
 * messagerie (`VoiceNoteRules`), servi par URL signée aux seuls lecteurs des photos du signalement.
 */
class MaintenanceRequestVoiceNoteTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    /** AC1 — un `audio/webm` de 300 Ko, 18 s, sans description : 201, privé, URL signée qui sert le fichier. */
    public function test_ac1_le_locataire_signale_par_une_note_vocale_sans_description(): void
    {
        ['property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        Sanctum::actingAs($tenant);

        $created = $this->post('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Plomberie',
            'category' => 'plumbing',
            'voice_note' => UploadedFile::fake()->create('note.webm', 300, 'audio/webm'),
            'voice_note_duration' => 18,
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('data.description', null)
            ->assertJsonPath('data.has_voice_note', true);
        // La réponse du geste n'est pas le détail : le fichier n'y est pas servi.
        $created->assertJsonMissingPath('data.media');

        $mr = MaintenanceRequest::query()->findOrFail($created->json('data.id'));
        $media = $mr->getFirstMedia('voice_notes');
        $this->assertNotNull($media);
        $this->assertSame(config('media-library.disk_name'), $media->disk);
        $this->assertSame(18, $media->getCustomProperty('duration'));
        Storage::disk($media->disk)->assertExists($media->getPathRelativeToRoot());

        $voiceNote = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()
            ->assertJsonPath('data.media.voice_note.duration', 18)
            ->assertJsonPath('data.media.voice_note.id', $media->id)
            ->json('data.media.voice_note');
        $this->assertStringContainsString('signature=', $voiceNote['url']);
        // Disque de test : URL présignée (302) s'il sait l'émettre, flux (200) sinon.
        $this->assertContains($this->get($voiceNote['url'])->status(), [200, 302]);
    }

    /** Un vrai conteneur Ogg (lu par `finfo`) : son type est rendu tel que le fichier le porte. */
    public function test_un_vrai_conteneur_ogg_est_accepte_et_rendu_avec_son_type(): void
    {
        ['property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        Sanctum::actingAs($tenant);

        $id = $this->post('/api/maintenance-requests', [
            'property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing',
            'voice_note' => FichiersReels::ogg('note.ogg', 300 * 1024), 'voice_note_duration' => 18,
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');

        $this->getJson("/api/maintenance-requests/{$id}")->assertOk()
            ->assertJsonPath('data.media.voice_note.mime_type', 'audio/ogg');
    }

    /** @return array<string, array{string, string}> */
    public static function refusees(): array
    {
        return [
            'fichier texte' => ['texte', 'voice_note'],
            'durée de 61 s' => ['duree61', 'voice_note_duration'],
            'fichier de 2,5 Mo' => ['gros', 'voice_note'],
            'note sans durée' => ['sansDuree', 'voice_note_duration'],
        ];
    }

    /** AC2 — 422 sur le champ concerné, et aucune demande créée. */
    #[DataProvider('refusees')]
    public function test_ac2_une_note_hors_bornes_est_refusee(string $cas, string $champ): void
    {
        ['property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        $avant = MaintenanceRequest::query()->count();
        Sanctum::actingAs($tenant);

        $corps = ['property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing'];
        $corps += match ($cas) {
            'texte' => ['voice_note' => FichiersReels::texte('note.txt'), 'voice_note_duration' => 18],
            'duree61' => ['voice_note' => FichiersReels::ogg(), 'voice_note_duration' => 61],
            'gros' => ['voice_note' => FichiersReels::ogg('note.ogg', (int) (2.5 * 1024 * 1024)), 'voice_note_duration' => 18],
            'sansDuree' => ['voice_note' => FichiersReels::ogg()],
        };

        $this->post('/api/maintenance-requests', $corps, ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);

        $this->assertSame($avant, MaintenanceRequest::query()->count());
        $this->assertSame(0, DB::table('media')->where('collection_name', 'voice_notes')->count());
    }

    /**
     * La règle propre à ce ticket : le donneur d'ordre, qui doit une description (TCK-2652), en est
     * dispensé par une note vocale. Sans note, il la doit toujours.
     */
    public function test_le_donneur_d_ordre_est_dispense_de_description_par_une_note(): void
    {
        ['property' => $property, 'agency' => $agency] = $this->maintenanceScenario();
        Sanctum::actingAs($this->agentOf($agency));

        $corps = ['property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing'];
        $this->post('/api/maintenance-requests', $corps, ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('description');

        $this->post('/api/maintenance-requests', $corps + ['voice_note' => FichiersReels::ogg(), 'voice_note_duration' => 9], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.has_voice_note', true);
    }

    /**
     * AC3 — pour chaque lecteur, `media.voice_note` est là si et seulement si `media.photos` l'est ;
     * une autre agence et un prestataire non assigné ne lisent ni l'un ni l'autre.
     *
     * @return array<string, array{string, bool}>
     */
    public static function lecteurs(): array
    {
        return [
            'demandeur' => ['demandeur', true],
            'bailleur du bien' => ['bailleur', true],
            'personnel de l\'agence' => ['personnel', true],
            'prestataire assigné, avant acceptation' => ['assigneAvant', true],
            'prestataire assigné, après acceptation' => ['assigneApres', true],
            'prestataire non assigné' => ['nonAssigne', false],
            'autre agence' => ['autreAgence', false],
        ];
    }

    #[DataProvider('lecteurs')]
    public function test_ac3_la_note_a_les_lecteurs_des_photos(string $lecteur, bool $lit): void
    {
        $scenario = $this->maintenanceScenario(MaintenanceStatus::Open, [
            'accepted_at' => $lecteur === 'assigneApres' ? now() : null,
        ]);
        /** @var MaintenanceRequest $mr */
        $mr = $scenario['mr'];
        $mr->addMedia(UploadedFile::fake()->image('panne.jpg'))->toMediaCollection('photos');
        $mr->attachVoiceNote(FichiersReels::ogg(), 18);

        $user = match ($lecteur) {
            'demandeur' => $scenario['tenant'],
            'bailleur' => $scenario['landlord'],
            'personnel' => $this->agentOf($scenario['agency']),
            'assigneAvant', 'assigneApres' => $scenario['provider'],
            'nonAssigne' => $this->providerFor($scenario['agency']),
            'autreAgence' => $this->agentOf(Agency::factory()->create()),
        };
        Sanctum::actingAs($user);

        $response = $this->getJson("/api/maintenance-requests/{$mr->id}");
        $media = $response->json('data.media');

        if ($lit) {
            $response->assertOk();
            $this->assertArrayHasKey('photos', $media);
            $this->assertCount(1, $media['photos']);
            $this->assertSame(18, $media['voice_note']['duration']);
            $this->assertStringContainsString('signature=', $media['voice_note']['url']);
        } else {
            $this->assertContains($response->status(), [403, 404]);
            $this->assertNull($media);
            $this->assertStringNotContainsString('voice_note', (string) $response->getContent());
        }

        // Une liste ne porte jamais le fichier, seulement le drapeau.
        $rows = $this->getJson('/api/maintenance-requests')->assertOk()->json('data');
        $row = collect($rows)->firstWhere('id', $mr->id);
        $this->assertSame($lit, $row !== null, 'la ligne suit la lecture du détail');
        foreach ($rows as $r) {
            $this->assertArrayNotHasKey('voice_note', $r);
            $this->assertArrayNotHasKey('media', $r);
        }
        if ($row !== null) {
            $this->assertTrue($row['has_voice_note']);
        }
    }

    /** `has_voice_note` en liste : une sous-requête, pas une requête par ligne. */
    public function test_le_drapeau_de_liste_ne_coute_pas_une_requete_par_ligne(): void
    {
        ['property' => $property, 'agency' => $agency, 'mr' => $sans] = $this->maintenanceScenario();
        $agent = $this->agentOf($agency);
        Sanctum::actingAs($agent);

        $avec = MaintenanceRequest::factory()->create(['property_id' => $property->id]);
        $avec->attachVoiceNote(FichiersReels::ogg(), 5);

        $compter = function (): array {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $rows = $this->getJson('/api/maintenance-requests?per_page=50')->assertOk()->json('data');
            DB::disableQueryLog();

            // Les requêtes qui lisent `media` : la vue du personnel coûte déjà une lecture du bien par
            // ligne (hors de ce ticket) ; le drapeau, lui, ne doit en ajouter aucune.
            $media = array_filter(DB::getQueryLog(), fn (array $q): bool => str_contains($q['query'], '"media"'));

            return [count($media), collect($rows)->pluck('has_voice_note', 'id')->all()];
        };

        [$requetesDeux, $drapeaux] = $compter();
        $this->assertTrue($drapeaux[$avec->id]);
        $this->assertFalse($drapeaux[$sans->id]);

        foreach (MaintenanceRequest::factory()->count(6)->create(['property_id' => $property->id]) as $autre) {
            $autre->attachVoiceNote(FichiersReels::ogg(), 5);
        }
        [$requetesHuit, $drapeaux] = $compter();

        $this->assertCount(8, $drapeaux);
        $this->assertSame(1, $requetesDeux, 'une seule lecture de `media` : la sous-requête de la liste');

        // Le chemin du front : des champs choisis (`fields[…]`). La sous-requête doit survivre au `select`.
        DB::flushQueryLog();
        DB::enableQueryLog();
        $rows = $this->getJson('/api/maintenance-requests?per_page=50&fields[maintenance_requests]=id,title')->assertOk()->json('data');
        DB::disableQueryLog();
        $media = array_filter(DB::getQueryLog(), fn (array $q): bool => str_contains($q['query'], '"media"'));
        $this->assertCount(1, $media, 'avec fields[…] aussi, une seule lecture de `media`');
        $this->assertTrue(collect($rows)->firstWhere('id', $avec->id)['has_voice_note']);
        $this->assertFalse(collect($rows)->firstWhere('id', $sans->id)['has_voice_note']);
        $this->assertSame($requetesDeux, $requetesHuit, "{$requetesDeux} lectures de `media` pour 2 lignes, {$requetesHuit} pour 8");
    }

    /** La demande, son entrée de journal et sa note naissent ensemble : un dépôt qui échoue n'en laisse rien. */
    public function test_un_depot_de_note_qui_echoue_ne_laisse_ni_demande_ni_journal(): void
    {
        ['property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        $avant = MaintenanceRequest::query()->count();
        Media::creating(function (): never {
            throw new RuntimeException('dépôt refusé');
        });
        Sanctum::actingAs($tenant);

        $this->post('/api/maintenance-requests', [
            'property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing',
            'voice_note' => FichiersReels::ogg(), 'voice_note_duration' => 18,
        ], ['Accept' => 'application/json'])->assertServerError();

        $this->assertSame($avant, MaintenanceRequest::query()->count());
        $this->assertSame(0, DB::table('activity_log')->where('log_name', MaintenanceJournal::LOG)->where('event', MaintenanceJournal::CREATED)->count());
    }

    /** AC5 — l'entrée « Signalée par … » compte les photos et dit la note vocale. */
    public function test_ac5_le_journal_compte_les_photos_et_la_note_du_signalement(): void
    {
        ['property' => $property, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario();
        Sanctum::actingAs($tenant);

        $id = $this->post('/api/maintenance-requests', [
            'property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing',
            'voice_note' => FichiersReels::ogg(), 'voice_note_duration' => 18,
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->post("/api/maintenance-requests/{$id}/photos", [
            'photos' => [FichiersReels::jpeg('a.jpg'), FichiersReels::jpeg('b.jpg')],
        ], ['Accept' => 'application/json'])->assertSuccessful();

        Sanctum::actingAs($this->agentOf($agency));
        $journal = $this->getJson("/api/maintenance-requests/{$id}/journal")->assertOk()->json('data');

        $this->assertSame('created', $journal[0]['code']);
        $this->assertSame(2, $journal[0]['photos_count']);
        $this->assertTrue($journal[0]['has_voice_note']);
    }

    /** Une demande sans note : le journal le dit, et ne compte que ses photos. */
    public function test_le_journal_d_une_demande_sans_note(): void
    {
        ['property' => $property, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario();
        Sanctum::actingAs($tenant);
        $id = $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id, 'title' => 'Plomberie', 'category' => 'plumbing',
        ])->assertCreated()->assertJsonPath('data.has_voice_note', false)->json('data.id');

        Sanctum::actingAs($this->agentOf($agency));
        $journal = $this->getJson("/api/maintenance-requests/{$id}/journal")->assertOk()->json('data');

        $this->assertSame(0, $journal[0]['photos_count']);
        $this->assertFalse($journal[0]['has_voice_note']);
        $this->getJson("/api/maintenance-requests/{$id}")->assertOk()->assertJsonPath('data.media.voice_note', null);
    }
}
