<?php

namespace Tests\Feature\Messaging;

use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Property;
use App\Models\User;
use App\Rules\PixelsAuPlus;
use App\Services\Messaging\GroupConversationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\FichiersReels;
use Tests\Support\ImageEnTete;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2631 — ADR-0038, amendement du 2026-11-10 : un participant actif joint une photo (jpeg, png,
 * webp, 8 Mo) ou un PDF (10 Mo), un fichier par message, dans la collection privée `attachments`,
 * lue par l'URL signée de la note vocale. L'EXIF d'une photo ne survit pas au stockage ; l'aperçu de
 * la liste est neutre (« Photo », « Document »), jamais le nom du fichier.
 *
 * Les fichiers sont RÉELS (`FichiersReels`, `ImageEnTete`) : `mimetypes:` lit leur contenu par
 * `finfo`, jamais leur nom.
 */
class MessageAttachmentTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    /** AC1 + AC5 — le locataire du bien, participant du fil de son intervention. */
    public function test_le_locataire_envoie_une_photo_de_3_mo_prise_avec_sa_position_gps(): void
    {
        ['tenant' => $tenant, 'thread' => $thread] = $this->filDIntervention();
        $photo = $this->photoDeTelephone(3 * 1024 * 1024);
        $this->assertGreaterThanOrEqual(3 * 1024 * 1024, $photo->getSize());
        $temoin = @exif_read_data((string) $photo->getRealPath());
        $this->assertSame('N', $temoin['GPSLatitudeRef'] ?? null, 'le témoin doit porter une position GPS lisible');

        Sanctum::actingAs($tenant);
        $response = $this->post("/api/conversations/{$thread->id}/messages", [
            'type' => 'image',
            'file' => $photo,
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.type', 'image')
            ->assertJsonPath('data.attachments.0.mime_type', 'image/jpeg');

        $this->assertStringContainsString('signature=', (string) $response->json('data.attachments.0.url'));

        $media = Message::query()->sole()->getFirstMedia('attachments');
        $this->assertNotNull($media);
        $this->assertSame(config('media-library.disk_name'), $media->disk);
        $octets = (string) Storage::disk($media->disk)->get($media->getPathRelativeToRoot());
        $exif = @exif_read_data('data://image/jpeg;base64,'.base64_encode($octets));
        $this->assertFalse(is_array($exif) && isset($exif['GPSLatitudeRef']), 'la position GPS a survécu au stockage');
        $this->assertStringNotContainsString("Exif\x00\x00", $octets);
        // Orientation 6 : l'image couchée (200 × 100) est redressée AVANT que la balise ne disparaisse.
        [$largeur, $hauteur] = (array) getimagesizefromstring($octets);
        $this->assertSame([100, 200], [$largeur, $hauteur]);
    }

    /** AC4 — l'aperçu de la liste est neutre, même quand une légende accompagne la photo. */
    public function test_la_liste_montre_photo_et_non_le_nom_du_fichier(): void
    {
        [$member, $conversation] = $this->groupe();

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'image',
            'content' => 'La fuite sous l’évier',
            'file' => FichiersReels::jpeg('IMG_2031-chez-moi.jpg'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.content', 'La fuite sous l’évier');

        $ligne = collect($this->getJson('/api/conversations')->assertOk()->json('data'))->firstWhere('id', $conversation->id);
        $this->assertSame(__('messaging.image_preview'), $ligne['last_message_preview']);
        $this->assertStringNotContainsString('IMG_2031', (string) $ligne['last_message_preview']);
        $this->assertSame('Photo', __('messaging.image_preview', [], 'fr'));
    }

    public function test_un_pdf_sans_legende_porte_l_apercu_document_et_l_avis_le_dit(): void
    {
        [$member, $conversation, $admin] = $this->groupe();

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'document',
            'file' => FichiersReels::pdf('devis-plomberie.pdf'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.type', 'document')
            ->assertJsonPath('data.content', '')
            ->assertJsonPath('data.attachments.0.mime_type', 'application/pdf')
            ->assertJsonPath('data.attachments.0.name', 'devis-plomberie.pdf')
            ->assertJsonPath('data.attachments.0.thumbnail_url', null);

        $this->assertSame(__('messaging.document_preview'), $conversation->fresh()->last_message_preview);
        // L'avis de nouveau message ne part pas vide : il dit « Document », jamais le nom du fichier.
        $avis = AppNotification::query()->where('user_id', $admin->id)->sole();
        $this->assertSame(__('messaging.document_preview'), $avis->params['excerpt']);
    }

    /** AC2 et la garde de l'amendement : 10 Mo passent, 11 Mo rendent 422 sans rien écrire. */
    public function test_un_pdf_de_10_mo_passe_et_un_pdf_de_11_mo_est_refuse(): void
    {
        [$member, $conversation] = $this->groupe();
        Sanctum::actingAs($member);

        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'document',
            'file' => $this->pdfDe(10 * 1024 * 1024),
        ], ['Accept' => 'application/json'])->assertCreated();
        $avant = Message::query()->count();

        $response = $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'document',
            'file' => $this->pdfDe(11 * 1024 * 1024),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        $this->assertSame(
            __('validation.max.file', ['attribute' => __('messaging.attributes.file'), 'max' => 10240]),
            $response->json('errors.file.0'),
        );
        $this->assertSame($avant, Message::query()->count());
        $this->assertSame(1, Media::query()->count());
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function acceptes(): array
    {
        return [
            'jpeg' => ['image', 'jpeg'],
            'png' => ['image', 'png'],
            'webp' => ['image', 'webp'],
            'pdf' => ['document', 'pdf'],
        ];
    }

    #[DataProvider('acceptes')]
    public function test_les_formats_annonces_sont_acceptes(string $type, string $format): void
    {
        [$member, $conversation] = $this->groupe();

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => $type,
            'file' => FichiersReels::$format(),
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.type', $type);
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function refuses(): array
    {
        return [
            'exécutable renommé .jpg' => [['type' => 'image', 'file' => 'exe-jpg']],
            'exécutable renommé .pdf' => [['type' => 'document', 'file' => 'exe-pdf']],
            'PDF déposé comme image' => [['type' => 'image', 'file' => 'pdf']],
            'photo déposée comme document' => [['type' => 'document', 'file' => 'jpeg']],
            'HEIC' => [['type' => 'image', 'file' => 'heic']],
            'image de plus de 8 Mo' => [['type' => 'image', 'file' => 'jpeg-8mo']],
            'image sans fichier' => [['type' => 'image']],
            'document sans fichier' => [['type' => 'document']],
            'fichier joint à un texte' => [['content' => 'Bonjour', 'file' => 'jpeg']],
            'fichier joint à une note vocale' => [['type' => 'audio', 'duration' => 3, 'audio' => 'ogg', 'file' => 'jpeg']],
            'image de plus de 20 Mpx' => [['type' => 'image', 'file' => 'bombe']],
        ];
    }

    /** @param  array<string, mixed>  $corps */
    #[DataProvider('refuses')]
    public function test_les_fichiers_hors_contrat_sont_refuses_avant_toute_ecriture(array $corps): void
    {
        [$member, $conversation] = $this->groupe();

        foreach (['file', 'audio'] as $champ) {
            if (isset($corps[$champ])) {
                $corps[$champ] = match ($corps[$champ]) {
                    'exe-jpg' => FichiersReels::executable('photo.jpg'),
                    'exe-pdf' => FichiersReels::executable('devis.pdf'),
                    'pdf' => FichiersReels::pdf(),
                    'heic' => FichiersReels::heic(),
                    'ogg' => FichiersReels::ogg(),
                    'jpeg-8mo' => $this->photoDeTelephone(8 * 1024 * 1024 + 2048),
                    'bombe' => ImageEnTete::png(5000, 4001),
                    default => FichiersReels::jpeg(),
                };
            }
        }

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", $corps, ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        $this->assertSame(0, Message::query()->count());
        $this->assertSame(0, Media::query()->count());
    }

    /** ADR-0072 — la même photo rejouée sous la même clé : un message, une pièce. */
    public function test_une_photo_rejouee_sous_la_meme_cle_ne_s_ecrit_qu_une_fois(): void
    {
        [$member, $conversation] = $this->groupe();
        Sanctum::actingAs($member);
        $enTetes = ['Idempotency-Key' => '5d2c7e1a-9b3f-4a6e-8c0d-2f4b6a8c0e1d', 'Accept' => 'application/json'];

        $ids = [];
        foreach ([1, 2] as $essai) {
            $ids[] = $this->post("/api/conversations/{$conversation->id}/messages", [
                'type' => 'image',
                'file' => FichiersReels::jpeg(),
            ], $enTetes)->assertCreated()->json('data.id');
        }

        $this->assertSame($ids[0], $ids[1]);
        $this->assertSame(1, Message::query()->count());
        $this->assertSame(1, Media::query()->count());
    }

    /** Un `type` envoyé en liste est refusé sur `type`, jamais en 500 dans le choix des règles du fichier. */
    public function test_un_type_en_liste_est_refuse_sans_erreur_serveur(): void
    {
        [$member, $conversation] = $this->groupe();

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => ['image'],
            'file' => FichiersReels::jpeg(),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');

        $this->assertSame(0, Message::query()->count());
    }

    public function test_la_borne_de_pixels_est_celle_des_avatars(): void
    {
        $this->assertSame(20_000_000, PixelsAuPlus::MAXIMUM);
        $this->assertGreaterThan(PixelsAuPlus::MAXIMUM, 5000 * 4001);
    }

    /** L'en-tête annonce un JPEG que GD ne sait pas décoder : 422, ni message ni fichier. */
    public function test_une_image_illisible_est_refusee_sans_rien_ecrire(): void
    {
        [$member, $conversation] = $this->groupe();

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'image',
            'file' => ImageEnTete::jpeg(400, 300),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'media.file_rejected');

        $this->assertSame(0, Message::query()->count());
        $this->assertSame(0, Media::query()->count());
    }

    /**
     * AC3, tel que la mesure le permet. L'URL signée (`media.private.show`) est HORS `auth:sanctum` :
     * la signature EST l'autorisation (`PrivateMediaController`), une URL déjà émise reste lisible
     * jusqu'à son échéance (`PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES`, 30 min) par qui la détient.
     * Le contrôle réutilisé est celui de la réponse qui l'émet : l'ancien membre et le
     * non-participant n'en obtiennent plus (403 sur le fil), et un lien expiré ou retouché rend 403.
     */
    public function test_seule_une_reponse_autorisee_emet_l_url_de_la_piece(): void
    {
        [$member, $conversation, $admin, $retire] = $this->groupe();
        $intrus = User::factory()->create();

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'image',
            'file' => FichiersReels::png(),
        ], ['Accept' => 'application/json'])->assertCreated();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$retire->id}")->assertOk();

        // Un participant actuel lit la pièce par l'URL que lui rend le fil.
        // (Le retrait a écrit un avis système : la photo n'est pas forcément le premier message.)
        $photo = collect($this->getJson("/api/conversations/{$conversation->id}/messages")->assertOk()->json('data'))
            ->firstWhere('type', 'image');
        $url = (string) ($photo['attachments'][0]['url'] ?? '');
        $this->assertStringContainsString('/media/', $url);
        $this->assertContains($this->get($url)->status(), [200, 302]);

        // L'ancien membre et l'intrus n'obtiennent plus d'URL.
        foreach ([$retire, $intrus] as $sansAcces) {
            Sanctum::actingAs($sansAcces);
            $this->getJson("/api/conversations/{$conversation->id}/messages")->assertForbidden();
        }

        // Une URL retouchée vers un autre média existant, ou échue, rend 403.
        $autreMedia = Media::query()->create([
            'model_type' => (new Message)->getMorphClass(), 'model_id' => 0, 'collection_name' => 'attachments',
            'name' => 'autre', 'file_name' => 'autre.pdf', 'mime_type' => 'application/pdf',
            'disk' => config('media-library.disk_name'), 'size' => 1, 'manipulations' => [], 'custom_properties' => [],
            'generated_conversions' => [], 'responsive_images' => [],
        ]);
        $autre = (string) preg_replace('#/media/(\d+)/file#', '/media/'.$autreMedia->id.'/file', $url);
        $this->assertNotSame($url, $autre);
        $this->get($autre)->assertForbidden();
        $this->travel(31)->minutes();
        $this->get($url)->assertForbidden();
    }

    public function test_un_fil_en_lecture_seule_refuse_la_piece_comme_le_texte(): void
    {
        ['tenant' => $tenant, 'thread' => $thread, 'property' => $property] = $this->filDIntervention();
        Lease::query()->where('property_id', $property->id)->update(['status' => LeaseStatus::Terminated]);
        $this->tenantOf($property);

        Sanctum::actingAs($tenant->fresh());
        $this->post("/api/conversations/{$thread->id}/messages", [
            'type' => 'image',
            'file' => FichiersReels::jpeg(),
        ], ['Accept' => 'application/json'])->assertForbidden();

        $this->assertSame(0, Message::query()->where('conversation_id', $thread->id)->where('type', 'image')->count());
        $this->assertSame(0, Media::query()->count());
    }

    /** La vignette (file `media`, synchrone en test) est servie par la même porte signée. */
    public function test_la_photo_a_sa_vignette_servie_par_url_signee(): void
    {
        [$member, $conversation] = $this->groupe();

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'image',
            'file' => FichiersReels::jpeg(),
        ], ['Accept' => 'application/json'])->assertCreated();

        $photo = collect($this->getJson("/api/conversations/{$conversation->id}/messages")->assertOk()->json('data'))
            ->firstWhere('type', 'image');
        $vignette = $photo['attachments'][0]['thumbnail_url'] ?? null;
        $this->assertIsString($vignette);
        $this->assertStringContainsString('conversion=thumbnail', $vignette);
        $this->assertContains($this->get($vignette)->status(), [200, 302]);
    }

    /**
     * Un JPEG de téléphone : orientation 6 et un bloc GPS (`ImageEnTete::jpegAvecExif`), porté à la
     * taille voulue par des octets APRÈS le marqueur de fin (`EOI`), comme la vidéo qu'un téléphone
     * accole à une « photo animée ». GD s'arrête à `EOI` ; le réencodage ne les recopie pas.
     * (Des segments `COM` ne conviennent pas : au-delà de 50, `finfo` renonce — « name use count
     * (50) exceeded » — et la règle `mimetypes:` refuse un JPEG valide.)
     */
    private function photoDeTelephone(int $octets): UploadedFile
    {
        $source = ImageEnTete::jpegAvecExif(200, 100, orientation: 6);
        $jpeg = (string) file_get_contents((string) $source->getRealPath());
        $chemin = (string) tempnam(sys_get_temp_dir(), 'tck2631');
        file_put_contents($chemin, $jpeg.str_repeat("\x00", max(0, $octets - strlen($jpeg))));

        return new UploadedFile($chemin, 'IMG_2031.jpg', null, null, true);
    }

    /** Un vrai PDF (dompdf), allongé après `%%EOF` : `finfo` lit `application/pdf` sur son en-tête. */
    private function pdfDe(int $octets): UploadedFile
    {
        $source = FichiersReels::pdf();
        $pdf = (string) file_get_contents((string) $source->getRealPath());
        $chemin = (string) tempnam(sys_get_temp_dir(), 'tck2631');
        file_put_contents($chemin, $pdf.str_repeat('%', $octets - strlen($pdf)));

        return new UploadedFile($chemin, 'devis.pdf', null, null, true);
    }

    /** @return array{0: User, 1: Conversation, 2: User, 3: User} membre, groupe, admin, membre à retirer */
    private function groupe(): array
    {
        $admin = User::factory()->create();
        $member = User::factory()->create();
        $retire = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($member->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        $conversation->participants()->attach($retire->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return [$member, $conversation, $admin, $retire];
    }

    /** @return array{tenant: User, thread: Conversation, property: Property} */
    private function filDIntervention(): array
    {
        ['property' => $property, 'landlord' => $landlord, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        $lease = Lease::query()->where('property_id', $property->id)->sole();
        $mr = MaintenanceRequest::query()->sole();
        $mr->update(['lease_id' => $lease->id]);

        $thread = app(GroupConversationService::class)->create(
            $landlord,
            $mr->title,
            [$provider->id, $tenant->id],
            $property->id,
            $lease->id,
            $mr->id,
            sendInvites: false,
        );

        return ['tenant' => $tenant, 'thread' => $thread, 'property' => $property];
    }
}
