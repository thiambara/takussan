<?php

namespace Tests\Feature\Moderation;

use App\Models\Address;
use App\Models\Agency;
use App\Models\DuplicateSuspicion;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\MediaFingerprint;
use App\Models\Property;
use App\Models\User;
use App\Services\Moderation\DuplicateListingDetector;
use App\Services\Property\PropertyDuplicationService;
use App\Support\PhotoFingerprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-597 (ADR-0054, AC10) — une annonce recopiée se soupçonne par la photo ORIGINALE et par
 * l'adresse, entre publieurs différents seulement, et la suspicion entre dans la file.
 *
 * Avant : aucune empreinte, aucune comparaison — une recherche de `phash|dhash` ne trouvait rien.
 * Les disques sont des faux DISTANTS : l'original se lit par le disque, jamais par `getPath()`.
 */
class DuplicateListingDetectorTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        RemoteDiskFake::install('r2-media');
        RemoteDiskFake::install('r2-private');
    }

    /** Une image texturée déterministe (blocs aléatoires à graine), et un même « filigrane » optionnel. */
    private function png(int $seed, bool $watermark = false): string
    {
        mt_srand($seed);
        $image = imagecreatetruecolor(360, 320);
        for ($y = 0; $y < 8; $y++) {
            for ($x = 0; $x < 9; $x++) {
                $grey = mt_rand(0, 255);
                imagefilledrectangle($image, $x * 40, $y * 40, $x * 40 + 39, $y * 40 + 39, imagecolorallocate($image, $grey, $grey, $grey));
            }
        }
        if ($watermark) {
            imagefilledrectangle($image, 250, 270, 350, 310, imagecolorallocate($image, 255, 255, 255));
        }
        ob_start();
        imagepng($image);
        imagedestroy($image);

        return (string) ob_get_clean();
    }

    private function listing(?Agency $agency, array $attributes = []): Property
    {
        return Property::factory()->published()->create(array_merge(['agency_id' => $agency?->id], $attributes));
    }

    private function addPhoto(Property $property, string $png): void
    {
        $property->addMediaFromString($png)->usingFileName('photo.png')->toMediaCollection('photos');
    }

    public function test_the_same_original_in_two_agencies_creates_one_suspicion(): void
    {
        $original = $this->listing(Agency::factory()->create());
        $copy = $this->listing(Agency::factory()->create());
        $photo = $this->png(7);

        $this->addPhoto($original, $photo);
        $this->addPhoto($copy, $photo);
        $this->addPhoto($copy, $photo); // ré-ajoutée : toujours UNE suspicion par paire

        $this->assertSame(3, MediaFingerprint::query()->count(), 'chaque photo a son empreinte');
        $this->assertSame(1, DuplicateSuspicion::query()->count());
        $suspicion = DuplicateSuspicion::query()->firstOrFail();
        $this->assertSame($copy->id, $suspicion->property_id);
        $this->assertSame($original->id, $suspicion->matched_property_id);
        $this->assertSame('photo', $suspicion->signal);
        $this->assertSame(0, $suspicion->distance);
    }

    public function test_a_voluntary_duplication_within_one_agency_creates_none(): void
    {
        $agency = Agency::factory()->create();
        $source = $this->listing($agency);
        $this->addPhoto($source, $this->png(11));

        $actor = User::factory()->create();
        app(PropertyDuplicationService::class)->duplicate($source, $actor, ['copy_media' => true]);

        $this->assertSame(2, MediaFingerprint::query()->count(), 'la copie a bien son empreinte');
        $this->assertSame(0, DuplicateSuspicion::query()->count());
    }

    public function test_different_photos_carrying_the_same_watermark_create_none(): void
    {
        $a = $this->png(21, watermark: true);
        $b = $this->png(22, watermark: true);
        $this->assertGreaterThan(PhotoFingerprint::THRESHOLD, PhotoFingerprint::distance(PhotoFingerprint::fromBinary($a), PhotoFingerprint::fromBinary($b)));

        $this->addPhoto($this->listing(Agency::factory()->create()), $a);
        $this->addPhoto($this->listing(Agency::factory()->create()), $b);

        $this->assertSame(0, DuplicateSuspicion::query()->count());
    }

    /** Le seuil : 3 bits d'écart sont « la même photo », 4 ne le sont plus — bandes partagées ou non. */
    public function test_the_hamming_threshold_is_three(): void
    {
        $original = $this->listing(Agency::factory()->create());
        $near = $this->listing(Agency::factory()->create());
        $far = $this->listing(Agency::factory()->create());
        $this->addPhoto($original, $this->png(41));
        $this->addPhoto($near, $this->png(42));
        $this->addPhoto($far, $this->png(43));
        DuplicateSuspicion::query()->delete();

        $base = MediaFingerprint::query()->where('property_id', $original->id)->value('hash');
        $rewrite = function (Property $property, int $hash): MediaFingerprint {
            $fingerprint = MediaFingerprint::query()->where('property_id', $property->id)->firstOrFail();
            [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);
            $fingerprint->update(['hash' => $hash, 'band_0' => $b0, 'band_1' => $b1, 'band_2' => $b2, 'band_3' => $b3]);

            return $fingerprint;
        };
        // Trois puis quatre bits retournés dans la dernière bande, à des places DISTINCTES (les deux
        // copies sont à 7 bits l'une de l'autre) : les trois premières bandes restent communes.
        $nearFp = $rewrite($near, $base ^ 0b111);
        $farFp = $rewrite($far, $base ^ (0b1111 << 4));

        $detector = app(DuplicateListingDetector::class);
        $this->assertSame(0, $detector->detectForPhoto($farFp), '4 bits : pas la même photo');
        $this->assertSame(1, $detector->detectForPhoto($nearFp), '3 bits : la même photo');
    }

    /** Un aplat de couleur unie. */
    private function flat(int $red, int $green, int $blue): string
    {
        $image = imagecreatetruecolor(360, 320);
        imagefilledrectangle($image, 0, 0, 359, 319, imagecolorallocate($image, $red, $green, $blue));
        ob_start();
        imagepng($image);
        imagedestroy($image);

        return (string) ob_get_clean();
    }

    /**
     * verif-597 m2 — deux aplats de couleurs différentes ont la même empreinte dégénérée (`0`) :
     * ils ne font pas une suspicion. Avant, toute photo de mur, de ciel ou de gabarit en créait.
     */
    public function test_two_flat_photos_of_different_colours_create_no_suspicion(): void
    {
        $red = $this->listing(Agency::factory()->create());
        $blue = $this->listing(Agency::factory()->create());

        $this->addPhoto($red, $this->flat(220, 30, 30));
        $this->addPhoto($blue, $this->flat(30, 30, 220));

        $this->assertSame(2, MediaFingerprint::query()->count(), 'les empreintes sont calculées');
        $this->assertTrue(PhotoFingerprint::isDegenerate((int) MediaFingerprint::query()->value('hash')));
        $this->assertSame(0, DuplicateSuspicion::query()->count());
    }

    /** Un candidat dégénéré ne se compare pas non plus, même à un bit d'une empreinte valide. */
    public function test_a_degenerate_candidate_is_never_a_match(): void
    {
        $original = $this->listing(Agency::factory()->create());
        $other = $this->listing(Agency::factory()->create());
        $this->addPhoto($original, $this->png(61));
        $this->addPhoto($other, $this->png(62));
        DuplicateSuspicion::query()->delete();

        $rewrite = function (Property $property, int $hash): MediaFingerprint {
            [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);
            $fingerprint = MediaFingerprint::query()->where('property_id', $property->id)->firstOrFail();
            $fingerprint->update(['hash' => $hash, 'band_0' => $b0, 'band_1' => $b1, 'band_2' => $b2, 'band_3' => $b3]);

            return $fingerprint;
        };
        $valid = $rewrite($original, 0xFF);   // poids 8 : valide
        $rewrite($other, 0x7F);               // poids 7 : dégénéré, à 1 bit

        $this->assertSame(0, app(DuplicateListingDetector::class)->detectForPhoto($valid));
    }

    /**
     * verif-597 m2 — sous la borne de candidats, les PLUS PROCHES passent d'abord. Avant, les plus
     * anciens remplissaient la borne et le vrai doublon, plus récent, n'était jamais comparé.
     */
    public function test_the_candidate_cap_keeps_the_closest_not_the_oldest(): void
    {
        $original = $this->listing(Agency::factory()->create());
        $older = $this->listing(Agency::factory()->create());
        $copy = $this->listing(Agency::factory()->create());
        $this->addPhoto($original, $this->png(51));
        $this->addPhoto($older, $this->png(52));
        DuplicateSuspicion::query()->delete();
        $base = (int) MediaFingerprint::query()->where('property_id', $original->id)->value('hash');

        // MAX_CANDIDATES empreintes ANCIENNES qui partagent trois bandes, à 8 bits : la borne pleine.
        $template = (array) DB::table('media')->where('model_id', $older->id)->first();
        unset($template['id']);
        $far = $base ^ (0xFF << 8);
        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($far);
        $rows = [];
        for ($i = 0; $i < DuplicateListingDetector::MAX_CANDIDATES; $i++) {
            $mediaId = DB::table('media')->insertGetId(['uuid' => (string) Str::uuid()] + $template);
            $rows[] = ['media_id' => $mediaId, 'property_id' => $older->id, 'agency_id' => $older->agency_id,
                'hash' => $far, 'band_0' => $b0, 'band_1' => $b1, 'band_2' => $b2, 'band_3' => $b3,
                'created_at' => now(), 'updated_at' => now()];
        }
        MediaFingerprint::query()->insert($rows);

        // La copie, PLUS RÉCENTE que toutes, à 1 bit de l'original.
        $this->addPhoto($copy, $this->png(54));
        $near = $base ^ 0b1;
        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($near);
        MediaFingerprint::query()->where('property_id', $copy->id)
            ->update(['hash' => $near, 'band_0' => $b0, 'band_1' => $b1, 'band_2' => $b2, 'band_3' => $b3]);
        DuplicateSuspicion::query()->delete();

        $fingerprint = MediaFingerprint::query()->where('property_id', $original->id)->firstOrFail();
        $this->assertSame(1, app(DuplicateListingDetector::class)->detectForPhoto($fingerprint));
        $this->assertSame($copy->id, DuplicateSuspicion::query()->value('matched_property_id'));
    }

    public function test_an_unreadable_file_gets_no_fingerprint_and_fails_nothing(): void
    {
        $this->assertNull(PhotoFingerprint::fromBinary('pas une image'));
    }

    public function test_the_address_signal_folds_case_and_tolerates_five_percent(): void
    {
        $place = ['city' => 'Dakar', 'neighborhood' => 'Almadiès', 'latitude' => 14.74521, 'longitude' => -17.51234];
        $first = $this->listing(Agency::factory()->create(), ['area' => 120, 'price' => 1_000_000]);
        $second = $this->listing(Agency::factory()->create(), ['area' => 124, 'price' => 1_040_000, 'contract_type' => $first->contract_type]);
        $far = $this->listing(Agency::factory()->create(), ['area' => 120, 'price' => 1_200_000, 'contract_type' => $first->contract_type]);
        foreach ([[$first, $place], [$second, ['city' => 'DAKAR', 'neighborhood' => 'ALMADIÈS'] + $place], [$far, $place]] as [$property, $address]) {
            Address::query()->create($address + ['addressable_type' => Property::class, 'addressable_id' => $property->id, 'country' => 'SN']);
        }

        $created = app(DuplicateListingDetector::class)->detectByAddress($second);

        $this->assertSame(1, $created);
        $suspicion = DuplicateSuspicion::query()->firstOrFail();
        $this->assertSame([$second->id, $first->id, 'address'], [$suspicion->property_id, $suspicion->matched_property_id, $suspicion->signal]);
    }

    public function test_the_suspicion_reaches_the_queue_and_hide_puts_the_copy_under_platform_hold(): void
    {
        $original = $this->listing(Agency::factory()->create());
        $copy = $this->listing(Agency::factory()->create());
        $photo = $this->png(31);
        $this->addPhoto($original, $photo);
        $this->addPhoto($copy, $photo);
        $suspicion = DuplicateSuspicion::query()->firstOrFail();

        $super = User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->actingAsApi($super);

        $item = collect($this->getJson('/api/admin/moderation')->assertOk()->json('data'))
            ->firstWhere('id', "suspected_duplicate:{$suspicion->id}");
        $this->assertNotNull($item);
        $this->assertSame($copy->id, $item['subject_id']);
        $this->assertSame($original->id, $item['duplicate']['matched']['id']);

        $this->postJson("/api/admin/moderation/suspected_duplicate:{$suspicion->id}/decide", ['decision' => 'approve'])
            ->assertStatus(422)->assertJsonPath('code', 'moderation.decision_invalid_for_type');
        $this->postJson("/api/admin/moderation/suspected_duplicate:{$suspicion->id}/decide", ['decision' => 'hide', 'reason_code' => 'duplicate'])
            ->assertOk();

        $copy->refresh();
        $this->assertSame(PropertyStatus::Rejected, $copy->status);
        $this->assertSame(PropertyVisibility::Private, $copy->visibility);
        $this->assertNotNull($copy->platform_hold_at);
        $this->assertNull($original->refresh()->platform_hold_at, 'l\'annonce recopiée n\'est pas touchée');
        $this->assertSame('hide', $suspicion->refresh()->decision);

        $this->postJson("/api/admin/moderation/suspected_duplicate:{$suspicion->id}/decide", ['decision' => 'reject', 'reason_code' => 'off_topic'])
            ->assertStatus(409);
    }
}
