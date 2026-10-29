<?php

namespace App\Services\Radar;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\Property;
use App\Models\PropertyContact;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Billing\QuotaResolver;
use App\Services\Media\PrivateMediaAccess;
use App\Support\LienFront;
use App\Support\RadarWaMe;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\FileAdder;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * TCK-2389 (ADR-0077 §6, §11) — « Publier pour lui » : sur l'accord confirmé d'un annonceur, ses annonces `consented` deviennent des
 * biens publics dans l'espace d'un compte créé pour lui ({@see AdvertiserProvisioner}), dont le numéro est le contact sur place.
 * `super_admin` seul (`platform.radar.publish`), prise en charge de l'annonceur exigée.
 *
 * **L'écran n'est pas la garde** : l'aperçu dit ce qui bloque, mais `publish()` relit tout sous verrou — l'accord
 * ({@see RadarConsentCoverage}, la seule définition), l'étape, la réserve de photos, les champs requis — et un refus n'écrit
 * RIEN (une seule transaction). Ordre des verrous : annonces → annonceur (celui de `AdvertiserClaim`).
 *
 * Aucun `PublishReadiness` : l'accord (ADR-0077 §3) tient lieu d'acceptation des conditions, et le numéro de l'annonceur n'est pas
 * vérifié — c'est le code SMS qui le vérifiera (ADR-0033 §3) et qui accordera alors les crédits de bienvenue.
 */
final class RadarPublisher
{
    /** Champs sans lesquels un bien ne se publie pas : ceux de la relecture, et le titre (affiché au public). */
    public const REQUIRED = [...RadarReviewFields::REQUIRED_FOR_REVIEW, 'title'];

    public const MESSAGE_VERSION = 'publie.v1';

    public function __construct(
        private readonly AdvertiserClaim $claim,
        private readonly AdvertiserProvisioner $provisioner,
        private readonly RadarConsentCoverage $coverage,
        private readonly RadarPhotoReserve $reserve,
        private readonly QuotaResolver $quotas,
    ) {}

    /**
     * Ce que la publication ferait, sans rien écrire : les annonces `consented` couvertes par un accord valide, ce qui
     * bloque chacune, et ce qui bloque l'ensemble.
     *
     * @return array{advertiser: array<string, mixed>, account: array<string, mixed>, listings: list<array<string, mixed>>, blocking: list<string>}
     */
    public function preview(RadarAdvertiser $advertiser): array
    {
        $covered = $this->coverage->coveredListingIds($advertiser);
        $listings = $covered === [] ? new Collection : RadarListing::query()
            ->where('radar_advertiser_id', $advertiser->id)
            ->where('stage', RadarListingStage::Consented->value)
            ->whereIn('id', $covered)
            ->with('media')
            ->orderBy('id')
            ->get();

        $blocking = [];
        if ($this->provisioner->phoneRegistered($advertiser)) {
            $blocking[] = 'radar.advertiser.phone_registered';
        }
        if ($advertiser->do_not_contact_at !== null) {
            $blocking[] = 'radar.advertiser.do_not_contact';
        }
        if ($listings->isEmpty()) {
            $blocking[] = 'radar.publish.nothing_covered';
        }

        [$firstName, $lastName] = self::nameOf($advertiser);

        return [
            'advertiser' => [
                'id' => $advertiser->id,
                'display_name' => $advertiser->display_name,
                'nature' => $advertiser->nature->value,
                'do_not_contact_at' => $advertiser->do_not_contact_at?->toIso8601String(),
            ],
            'account' => [
                'exists' => $advertiser->user_id !== null,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => (string) $advertiser->phone,
                'space_name' => self::spaceName($firstName),
            ],
            'listings' => $listings->map(fn (RadarListing $listing) => $this->previewOf($listing))->values()->all(),
            'blocking' => $blocking,
        ];
    }

    /**
     * @param  list<int>  $listingIds
     * @return array{user: User, agency: Agency, properties: list<Property>, created: bool}
     */
    public function publish(RadarAdvertiser $advertiser, array $listingIds, User $by): array
    {
        $ids = array_values(array_unique(array_map('intval', $listingIds)));
        sort($ids);

        $published = DB::transaction(function () use ($advertiser, $ids, $by): array {
            $listings = RadarListing::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            $foreign = array_values(array_merge(
                array_diff($ids, $listings->pluck('id')->map(fn ($id) => (int) $id)->all()),
                $listings->where('radar_advertiser_id', '!=', $advertiser->id)->pluck('id')->map(fn ($id) => (int) $id)->all(),
            ));
            abort_code_if($foreign !== [], 422, 'radar.publish.listing_foreign', ['listing_ids' => $foreign]);

            $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
            $this->claim->assertHeld($locked, $by);
            abort_code_if($locked->do_not_contact_at !== null, 422, 'radar.advertiser.do_not_contact');

            // L'écran n'est pas la garde : l'accord se relit ICI, sous verrou.
            $missing = array_values(array_diff($ids, $this->coverage->coveredAmong($ids)));
            abort_code_if($missing !== [], 422, 'radar.publish.not_covered', ['listing_ids' => $missing]);
            foreach ($listings as $listing) {
                abort_code_unless(
                    $listing->stage === RadarListingStage::Consented,
                    409,
                    'radar.listing.stage_conflict',
                    ['stage' => $listing->stage->value, 'listing_id' => $listing->id],
                );
            }
            foreach ($listings as $listing) {
                abort_code_if($this->reserve->count($listing) === 0, 422, 'radar.publish.no_photo', ['listing_id' => $listing->id]);
                abort_code_if(
                    self::missingFields($listing) !== [],
                    422,
                    'radar.publish.missing_field',
                    ['listing_id' => $listing->id, 'fields' => self::missingFields($listing)],
                );
            }

            ['created' => $created, 'user' => $user, 'agency' => $agency] = $this->provisioner->provision($locked);

            $properties = [];
            $copied = [];
            try {
                foreach ($listings as $listing) {
                    $this->quotas->assertCanCreateActiveListing($agency->id);
                    $property = $this->createProperty($listing, $locked, $user, $agency);
                    // `copy()` garde l'`order_column` de la réserve : le rang se pose ici, pour que la couverture suive l'ordre voulu.
                    foreach ($this->reserve->ordered($listing)->values() as $rank => $media) {
                        $copied[] = $media->copy($property, 'photos', fileAdderCallback: fn (FileAdder $adder) => $adder->setOrder($rank + 1));
                    }
                    $listing->forceFill(['property_id' => $property->id, 'stage' => RadarListingStage::Published, 'stage_reason' => null])->save();
                    $properties[] = $property;
                }

                activity('Admin')
                    ->causedBy($by)
                    ->performedOn($locked)
                    ->withProperties([
                        'advertiser_id' => $locked->id,
                        'user_id' => $user->id,
                        'agency_id' => $agency->id,
                        'created_account' => $created,
                        'listing_ids' => $ids,
                        'property_ids' => array_map(fn (Property $property) => $property->id, $properties),
                    ])
                    ->event('radar_published')
                    ->log('Annonces du Radar publiées pour l\'annonceur');
            } catch (Throwable $e) {
                // La transaction rend les lignes, jamais les fichiers : les originaux déjà copiés s'effacent ici.
                $this->discardFiles($copied);

                throw $e;
            }

            return ['user' => $user, 'agency' => $agency, 'properties' => $properties, 'created' => $created];
        });

        // P122.01 — l'observateur de Scout a indexé chaque bien AVANT son adresse : réindexé après la transaction, adresse rechargée.
        foreach ($published['properties'] as $property) {
            $property->load('address')->reindexer();
        }

        return $published;
    }

    /**
     * Le second message, celui qui annonce les biens en ligne : un texte fixe versionné
     * (`resources/radar/messages/publie.v1.<locale>.md`), jamais généré, et son lien `wa.me`.
     *
     * @return array{text: string, wa_me: string, version: string}
     */
    public function publishedMessage(RadarAdvertiser $advertiser, string $locale): array
    {
        abort_code_unless(in_array($locale, ConsentMessageComposer::LOCALES, true), 422, 'radar.outreach.locale_unsupported');

        $slugs = Property::query()
            ->whereIn('id', RadarListing::query()
                ->where('radar_advertiser_id', $advertiser->id)
                ->where('stage', RadarListingStage::Published->value)
                ->whereNotNull('property_id')
                ->select('property_id'))
            ->orderBy('id')
            ->pluck('slug');
        abort_code_if($slugs->isEmpty() || $advertiser->phone === null, 422, 'radar.publish.nothing_published');

        $template = rtrim((string) file_get_contents(resource_path('radar/messages/'.self::MESSAGE_VERSION.".{$locale}.md")), "\n");
        $firstName = ConsentMessageComposer::part(self::nameOf($advertiser)[0], 60);
        // Une seule passe : un `{liens}` écrit dans un prénom reste du texte. Sans prénom, l'espace qui le précède s'en va.
        $text = strtr($template, [
            ' {prenom}' => $firstName === '' ? '' : ' '.$firstName,
            '{prenom}' => $firstName,
            '{liens}' => $slugs->map(fn (string $slug) => self::publicUrl($slug, $locale))->implode("\n"),
            '{lien_activation}' => LienFront::vers('/auth/login'),
        ]);

        return ['text' => $text, 'wa_me' => RadarWaMe::url($advertiser->phone, $text), 'version' => self::MESSAGE_VERSION];
    }

    public static function publicUrl(string $slug, string $locale = 'fr'): string
    {
        return LienFront::vers("/{$locale}/properties/{$slug}");
    }

    /** @return array<string, mixed> */
    private function previewOf(RadarListing $listing): array
    {
        $values = RadarReviewFields::values((array) $listing->extracted);
        $status = $listing->photoPreparationStatus();
        $photos = $this->reserve->ordered($listing);

        $blocking = [];
        if ($photos->isEmpty()) {
            $blocking[] = 'radar.publish.no_photo';
        }
        if ($status['status'] === 'pending') {
            $blocking[] = 'radar.publish.photos_pending';
        }
        if (self::missingFields($listing) !== []) {
            $blocking[] = 'radar.publish.missing_field';
        }

        return [
            'id' => $listing->id,
            'title' => $values['title'],
            'price' => $values['price'],
            'contract' => $values['contract'],
            'property_type' => $values['property_type'],
            'neighborhood_id' => $values['neighborhood_id'],
            'photo_preparation' => $status,
            'photos' => $photos->map(fn (Media $media) => [
                'id' => $media->id,
                'url' => app(PrivateMediaAccess::class)->signedUrl($media),
            ])->all(),
            'matches' => $listing->matches ?? [],
            'duplicate_of_listing_id' => $listing->duplicate_of_listing_id,
            'duplicate_of_property_id' => $listing->duplicate_of_property_id,
            'blocking' => $blocking,
        ];
    }

    /** @return list<string> */
    private static function missingFields(RadarListing $listing): array
    {
        $values = RadarReviewFields::values((array) $listing->extracted);

        return array_values(array_filter(self::REQUIRED, fn (string $field) => $values[$field] === null || $values[$field] === ''));
    }

    private function createProperty(RadarListing $listing, RadarAdvertiser $advertiser, User $user, Agency $agency): Property
    {
        $values = RadarReviewFields::values((array) $listing->extracted);
        $isRent = $values['contract'] === ContractType::Rent->value;

        $property = Property::query()->create([
            'agency_id' => $agency->id,
            'user_id' => $user->id,
            'title' => $values['title'],
            'description' => $values['description'],
            'type' => $values['property_type'],
            'contract_type' => $values['contract'],
            'rent_period' => $isRent ? ($values['rent_period'] ?? 'monthly') : null,
            'price' => $values['price'],
            'currency' => Currency::XOF,
            'area' => $values['surface_m2'],
            'bedrooms' => $values['bedrooms'],
            'bathrooms' => $values['bathrooms'],
            'furnished' => $values['furnished'],
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
            // Traçabilité, sans colonne neuve. Les équipements ne sont pas repris : ce sont des étiquettes du catalogue.
            'metadata' => ['radar_listing_id' => $listing->id],
        ]);

        // Le quartier du référentiel suffit : `GeoAddressCanonicalizer` en tire la ville, la région et le nom. Un texte de
        // ville écrit en plus pourrait faire tomber le quartier (ville lue d'une autre).
        $property->address()->create(['geo_neighborhood_id' => $values['neighborhood_id'], 'country' => 'SN']);

        PropertyContact::query()->create([
            'property_id' => $property->id,
            'label' => null,
            'phone' => $advertiser->phone,
            'has_whatsapp' => true,
            'position' => 0,
        ]);

        return $property;
    }

    /** @param  list<Media>  $medias */
    private function discardFiles(array $medias): void
    {
        foreach ($medias as $media) {
            Storage::disk($media->disk)->delete($media->getPathRelativeToRoot());
        }
    }

    /** @return array{0: string, 1: string} prénom (premier mot) et reste, vides sans nom */
    private static function nameOf(RadarAdvertiser $advertiser): array
    {
        $parts = preg_split('/\s+/', trim((string) $advertiser->display_name), 2) ?: [];

        return [$parts[0] ?? '', $parts[1] ?? ''];
    }

    private static function spaceName(string $firstName): string
    {
        return $firstName !== ''
            ? (string) __('onboarding.auto_space.name_with_first_name', ['first_name' => $firstName], 'fr')
            : (string) __('onboarding.auto_space.name_default', [], 'fr');
    }
}
