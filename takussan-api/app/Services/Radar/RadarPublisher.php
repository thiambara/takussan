<?php

namespace App\Services\Radar;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\PropertyContact;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Auth\OtpPreview;
use App\Services\Billing\QuotaResolver;
use App\Services\Media\PrivateMediaAccess;
use App\Support\LienFront;
use App\Support\PhoneMasker;
use App\Support\RadarWaMe;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\MediaLibrary\MediaCollections\FileAdder;
use Spatie\MediaLibrary\MediaCollections\Filesystem;
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
    /**
     * Champs sans lesquels un bien ne se publie pas : ceux de la relecture. Le titre n'en est plus un (décision 5 du porteur) :
     * sans titre extrait, il se construit des champs structurés ({@see RadarListingTitle}).
     */
    public const REQUIRED = RadarReviewFields::REQUIRED_FOR_REVIEW;

    /** TCK-2390 — `publie.v2` : le lien d'activation est le lien de réclamation signé ({@see ClaimLinks}), plus `/auth/login`. */
    public const MESSAGE_VERSION = 'publie.v2';

    /**
     * La connexion par téléphone est éteinte (`auth.phone_login.enabled`) : le compte créé n'a ni mot de passe ni e-mail, et
     * personne ne peut l'ouvrir ; le second message promet pourtant une activation par code SMS (amendement d'ADR-0033 §3).
     * Un environnement qui publie pour des annonceurs a besoin du drapeau allumé : sans lui, rien ne se publie.
     */
    public const ACTIVATION_UNAVAILABLE = 'radar.publish.activation_unavailable';

    /**
     * L'aperçu des codes OTP est actif ({@see OtpPreview::enabled()} : drapeau ET `APP_ENV` autorisé — la même condition que celle
     * qui l'active vraiment) : le code SMS revient dans la réponse de `request-code`, donc, avec l'exception d'ADR-0033 §3,
     * quiconque connaît le numéro de l'annonceur — public par construction — ouvrirait le compte créé pour lui. Le Radar est un
     * flux de données réelles de tiers : il se ferme, sauf en `local`, où il n'y a que des données de démonstration.
     */
    public const OTP_PREVIEW_ACTIVE = 'radar.publish.otp_preview_active';

    /** TCK-2394 (ADR-0079 § 4) — un annonceur sous mandat ne se publie plus « pour lui » : ses biens ne sont pas dans un compte. */
    public const UNDER_MANDATE = 'radar.publish.under_mandate';

    /** TCK-2394 (ADR-0079 § 5) — le second message d'un annonceur sous mandat : en ligne, STOP, aucun lien d'activation. */
    public const MANDATE_MESSAGE_VERSION = 'mandat.v1';

    public function __construct(
        private readonly AdvertiserClaim $claim,
        private readonly AdvertiserProvisioner $provisioner,
        private readonly RadarConsentCoverage $coverage,
        private readonly RadarPhotoReserve $reserve,
        private readonly QuotaResolver $quotas,
        private readonly ClaimLinks $claimLinks,
        private readonly RadarMandate $mandate,
    ) {}

    /**
     * Ce que la publication ferait, sans rien écrire : les annonces `consented` couvertes par un accord valide, ce qui
     * bloque chacune, et ce qui bloque l'ensemble.
     *
     * `published` : les biens que le Radar a déjà publiés pour cet annonceur, dont le second message se compose sans
     * dépendre de la réponse d'un `publish` (perdue, coupée par un délai, ou page rechargée).
     *
     * @return array{advertiser: array<string, mixed>, account: array<string, mixed>, listings: list<array<string, mixed>>, published: list<array<string, mixed>>, max_photos: int, blocking: list<string>}
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
        if ($this->provisioner->accountUnavailable($advertiser)) {
            $blocking[] = AdvertiserProvisioner::ACCOUNT_UNAVAILABLE;
        }
        if ($advertiser->do_not_contact_at !== null) {
            $blocking[] = 'radar.advertiser.do_not_contact';
        }
        if (! self::activationAvailable()) {
            $blocking[] = self::ACTIVATION_UNAVAILABLE;
        }
        if (self::otpPreviewActive()) {
            $blocking[] = self::OTP_PREVIEW_ACTIVE;
        }
        if ($listings->isEmpty()) {
            $blocking[] = 'radar.publish.nothing_covered';
        }
        if ($advertiser->mandate_at !== null) {
            $blocking[] = self::UNDER_MANDATE;
        }

        [$firstName, $lastName] = self::nameOf($advertiser);

        return [
            'advertiser' => [
                'id' => $advertiser->id,
                'display_name' => $advertiser->display_name,
                'nature' => $advertiser->nature->value,
                'do_not_contact_at' => $advertiser->do_not_contact_at?->toIso8601String(),
                // TCK-2394 (ADR-0079) — publié sous mandat : le second message est `mandat.v1`, sans activation.
                'mandate_at' => $advertiser->mandate_at?->toIso8601String(),
            ],
            'account' => [
                'exists' => $advertiser->user_id !== null,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => (string) $advertiser->phone,
                'space_name' => self::spaceName($firstName),
            ],
            'listings' => $listings->map(fn (RadarListing $listing) => $this->previewOf($listing))->values()->all(),
            'published' => $this->publishedProperties($advertiser),
            // Le plafond de photos d'UNE publication : l'écran refuse la confirmation d'une sélection qui le dépasse.
            'max_photos' => (int) config('radar.publish.max_photos'),
            'blocking' => $blocking,
            // TCK-2394 (ADR-0079) — la publication sous mandat : drapeau éteint, `enabled` faux et rien d'autre.
            'mandate' => $this->mandate->preview($advertiser, $listings->isEmpty()),
        ];
    }

    /**
     * Les biens déjà publiés par le Radar pour l'annonceur, du plus ancien au plus récent : ce que le second message liste.
     *
     * @return list<array{id: int, slug: string, title: string|null, radar_listing_id: int, public_url: string}>
     */
    private function publishedProperties(RadarAdvertiser $advertiser): array
    {
        $listingOf = RadarListing::query()
            ->where('radar_advertiser_id', $advertiser->id)
            ->where('stage', RadarListingStage::Published->value)
            ->whereNotNull('property_id')
            ->pluck('id', 'property_id');

        // `public()` : un bien que l'annonceur a retiré ou qu'une modération a fermé n'est plus un lien à lui envoyer.
        return Property::query()
            ->public()
            ->whereIn('id', $listingOf->keys())
            ->orderBy('id')
            ->get(['id', 'slug', 'title'])
            ->map(fn (Property $property): array => [
                'id' => $property->id,
                'slug' => $property->slug,
                'title' => $property->title,
                'radar_listing_id' => (int) $listingOf[$property->id],
                'public_url' => self::publicUrl($property->slug),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  list<int>  $listingIds
     * @return array{user: User, agency: Agency, properties: list<Property>, created: bool}
     */
    public function publish(RadarAdvertiser $advertiser, array $listingIds, User $by): array
    {
        return $this->publishLocked($advertiser, $listingIds, $by, function (RadarAdvertiser $locked) use ($by): void {
            $this->claim->assertHeld($locked, $by);
            abort_code_if($locked->mandate_at !== null, 422, self::UNDER_MANDATE);
        }, null);
    }

    /**
     * TCK-2394 (ADR-0079, proposé) — publier sous mandat : les mêmes gardes que {@see self::publish()} — prise en charge,
     * accord relu sous verrou, étape, photos, champs, plafond, quota —, moins celles du compte (ni numéro inscrit, ni connexion
     * par téléphone) ; aucun compte n'est créé, les biens naissent dans l'espace des mandats ({@see RadarMandate}), le numéro
     * de l'annonceur en contact. Refusé drapeau `radar_mandate` éteint, sans rien écrire.
     *
     * @param  list<int>  $listingIds
     * @return array{user: User, agency: Agency, properties: list<Property>, created: bool}
     */
    public function publishUnderMandate(RadarAdvertiser $advertiser, array $listingIds, User $by): array
    {
        return $this->publishLocked($advertiser, $listingIds, $by, fn (RadarAdvertiser $locked) => $this->claim->assertHeld($locked, $by), null, mandate: true);
    }

    /**
     * TCK-2390 (ADR-0077 §3) — l'annonceur publie lui-même ses annonces, réclamées par le lien du message : dans SON espace
     * (`$agency`, choisi par la réclamation), sans prise en charge d'opérateur. Toutes les autres gardes sont celles de
     * {@see self::publish()} — accord relu sous verrou, étape, photos, champs, plafond — et le compte rattaché à l'annonceur
     * doit encore être `$owner`.
     *
     * @param  list<int>  $listingIds
     * @return array{user: User, agency: Agency, properties: list<Property>, created: bool}
     */
    public function publishClaimed(RadarAdvertiser $advertiser, array $listingIds, User $owner, Agency $agency): array
    {
        return $this->publishLocked($advertiser, $listingIds, $owner, function (RadarAdvertiser $locked) use ($owner, $agency, $listingIds): void {
            abort_code_unless($locked->user_id === $owner->id, 409, 'radar.claim.account_changed');
            // Décision 2a : jamais sans l'accord `otp` de l'annonceur, relu ICI, sous verrou, au moment de publier — un STOP ou
            // une révocation depuis la réclamation arrête tout, même si un autre accord (capture) couvre encore l'annonce.
            $ids = array_values(array_unique(array_map('intval', $listingIds)));
            $missing = array_values(array_diff($ids, $this->coverage->coveredByOtpAmong($ids, $owner)));
            abort_code_if($missing !== [], 422, 'radar.publish.not_covered', ['listing_ids' => $missing]);
            $space = Agency::query()->whereKey($agency->getKey())->first();
            abort_code_if(
                $space === null || $space->primary_admin_id !== $owner->id || $space->status === AgencyStatus::Suspended,
                422,
                AdvertiserProvisioner::ACCOUNT_UNAVAILABLE,
            );
        }, $agency);
    }

    /**
     * @param  list<int>  $listingIds
     * @param  callable(RadarAdvertiser): void  $authorize  sous le verrou de l'annonceur : qui a le droit de publier
     * @param  Agency|null  $agency  l'espace de l'annonceur qui réclame ; `null` : celui du compte créé ou retrouvé par l'opérateur
     * @param  bool  $mandate  TCK-2394 — sous mandat (ADR-0079) : l'espace des mandats, aucun compte, aucune activation promise
     * @return array{user: User, agency: Agency, properties: list<Property>, created: bool}
     */
    private function publishLocked(RadarAdvertiser $advertiser, array $listingIds, User $by, callable $authorize, ?Agency $agency, bool $mandate = false): array
    {
        $ids = array_values(array_unique(array_map('intval', $listingIds)));
        sort($ids);

        $published = DB::transaction(function () use ($advertiser, $ids, $by, $authorize, $agency, $mandate): array {
            $listings = RadarListing::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            $foreign = array_values(array_merge(
                array_diff($ids, $listings->pluck('id')->map(fn ($id) => (int) $id)->all()),
                $listings->where('radar_advertiser_id', '!=', $advertiser->id)->pluck('id')->map(fn ($id) => (int) $id)->all(),
            ));
            abort_code_if($foreign !== [], 422, 'radar.publish.listing_foreign', ['listing_ids' => $foreign]);

            $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
            $authorize($locked);
            abort_code_if($locked->do_not_contact_at !== null, 422, 'radar.advertiser.do_not_contact');
            if ($mandate) {
                // Drapeau, espace des mandats, et aucun compte rattaché — sous le verrou de l'annonceur.
                $agency = $this->mandate->assertAvailable($locked);
            } else {
                abort_code_unless(self::activationAvailable(), 422, self::ACTIVATION_UNAVAILABLE);
                abort_code_if(self::otpPreviewActive(), 422, self::OTP_PREVIEW_ACTIVE);
            }

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
                // L'écran n'est pas la garde : une réserve encore en préparation serait copiée partielle, et les photos lues
                // ensuite ne la rejoindraient jamais (le job s'arrête dès que l'annonce n'est plus `consented`).
                abort_code_if(
                    $listing->photoPreparationStatus()['status'] === 'pending',
                    422,
                    'radar.publish.photos_pending',
                    ['listing_id' => $listing->id],
                );
                abort_code_if($this->reserve->count($listing) === 0, 422, 'radar.publish.no_photo', ['listing_id' => $listing->id]);
                abort_code_if(
                    self::missingFields($listing) !== [],
                    422,
                    'radar.publish.missing_field',
                    ['listing_id' => $listing->id, 'fields' => self::missingFields($listing)],
                );
            }

            // Le travail de la copie se borne AVANT la première écriture : une publication qui dépasserait le temps d'horloge de PHP
            // (60 s) mourrait sans que le `catch` ne passe, et laisserait ses copies sans ligne `media`.
            $photoCount = $listings->sum(fn (RadarListing $listing): int => $this->reserve->count($listing));
            $maxPhotos = (int) config('radar.publish.max_photos');
            abort_code_if($photoCount > $maxPhotos, 422, 'radar.publish.too_many_photos', ['count' => $photoCount, 'max' => $maxPhotos]);

            ['created' => $created, 'user' => $user, 'agency' => $agency] = match (true) {
                $mandate => ['created' => false, 'user' => $this->mandate->author($agency), 'agency' => $agency],
                $agency === null => $this->provisioner->provision($locked),
                default => ['created' => false, 'user' => $by, 'agency' => $agency],
            };

            $properties = [];
            $copied = [];
            try {
                foreach ($listings as $listing) {
                    $this->quotas->assertCanCreateActiveListing($agency->id);
                    $property = $this->createProperty($listing, $locked, $user, $agency, $mandate);
                    // `copy()` garde l'`order_column` de la réserve : le rang se pose ici, pour que la couverture suive l'ordre voulu.
                    // Il garde aussi ses propriétés (`source_url`, `origin`, `sha256`) : elles restent dans la réserve, que le
                    // Radar purge (ADR-0077 §9), et ne suivent pas la photo publique.
                    foreach ($this->reserve->ordered($listing)->values() as $rank => $media) {
                        $copied[] = $media->copy($property, 'photos', fileAdderCallback: fn (FileAdder $adder) => $adder
                            ->setOrder($rank + 1)
                            ->withCustomProperties([]));
                    }
                    $listing->forceFill(['property_id' => $property->id, 'stage' => RadarListingStage::Published, 'stage_reason' => null])->save();
                    $properties[] = $property;
                }
                if ($mandate) {
                    // La première publication sous mandat reste : une suivante ne la repousse pas.
                    $locked->forceFill(['mandate_at' => $locked->mandate_at ?? now(), 'mandate_by_id' => $locked->mandate_by_id ?? $by->id])->save();
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
                        // TCK-2390 — publié par l'annonceur lui-même, depuis le lien du message.
                        'claimed' => $user->is($by),
                        // TCK-2394 (ADR-0079) — sous mandat : dans l'espace des mandats, sans compte.
                        'mandate' => $mandate,
                    ])
                    ->event('radar_published')
                    ->log('Annonces du Radar publiées pour l\'annonceur');
            } catch (Throwable $e) {
                // La transaction rend les lignes, jamais les fichiers : tout ce que les copies ont écrit s'efface ici.
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
     * (`resources/radar/messages/publie.v2.<locale>.md`), jamais généré, et son lien `wa.me`. Il n'est pas enregistré : son
     * lien de réclamation est émis à sa composition, et sert `radar.claim.link_ttl_days` jours.
     *
     * @return array{text: string, wa_me: string, version: string}
     */
    public function publishedMessage(RadarAdvertiser $advertiser, string $locale): array
    {
        abort_code_unless(in_array($locale, ConsentMessageComposer::LOCALES, true), 422, 'radar.outreach.locale_unsupported');
        // Un STOP est définitif (ADR-0077 §8) : tant que le retrait de ses biens n'a pas purgé son numéro, aucun lien `wa.me` vers lui.
        abort_code_if($advertiser->do_not_contact_at !== null, 422, 'radar.advertiser.do_not_contact');
        // TCK-2394 (ADR-0079 § 5) — sous mandat, sans compte : le message ne promet aucune activation.
        $mandate = $advertiser->mandate_at !== null && $advertiser->user_id === null;
        if (! $mandate) {
            // Le message promet l'activation par SMS : sans connexion par téléphone, la promesse ne se tient pas.
            abort_code_unless(self::activationAvailable(), 422, self::ACTIVATION_UNAVAILABLE);
            abort_code_if(self::otpPreviewActive(), 422, self::OTP_PREVIEW_ACTIVE);
        }

        // `public()` : le message ne promet « en ligne » que ce qui l'est (un bien retiré ou fermé depuis la publication n'y figure plus).
        $slugs = Property::query()
            ->public()
            ->whereIn('id', RadarListing::query()
                ->where('radar_advertiser_id', $advertiser->id)
                ->where('stage', RadarListingStage::Published->value)
                ->whereNotNull('property_id')
                ->select('property_id'))
            ->orderBy('id')
            ->pluck('slug');
        abort_code_if($slugs->isEmpty() || $advertiser->phone === null, 422, 'radar.publish.nothing_published');

        $version = $mandate ? self::MANDATE_MESSAGE_VERSION : self::MESSAGE_VERSION;
        $template = rtrim((string) file_get_contents(resource_path('radar/messages/'.$version.".{$locale}.md")), "\n");
        $firstName = ConsentMessageComposer::part(self::nameOf($advertiser)[0], 60);
        // Une seule passe : un `{liens}` écrit dans un prénom reste du texte. Sans prénom, l'espace qui le précède s'en va.
        $text = strtr($template, [
            ' {prenom}' => $firstName === '' ? '' : ' '.$firstName,
            '{prenom}' => $firstName,
            '{liens}' => $slugs->map(fn (string $slug) => self::publicUrl($slug, $locale))->implode("\n"),
            // `mandat.v1` ne porte pas `{lien_reclamation}` : aucun lien n'est émis pour lui.
            '{lien_reclamation}' => $mandate ? '' : $this->claimLinks->url($advertiser, now(), $locale),
        ]);

        return ['text' => $text, 'wa_me' => RadarWaMe::url($advertiser->phone, $text), 'version' => $version];
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
        $neighborhood = self::neighborhoodName($values['neighborhood_id']);
        $title = RadarListingTitle::resolve($values, $neighborhood);

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
            // Le titre qui sera PUBLIÉ : celui de l'annonce, sinon le titre construit (`title_built`).
            'title' => $title['title'],
            'title_built' => $title['built'],
            'price' => $values['price'],
            'contract' => $values['contract'],
            'property_type' => $values['property_type'],
            'neighborhood_id' => $values['neighborhood_id'],
            // Le nom du quartier CANONIQUE (une fusion se suit jusqu'à sa cible) : l'écran dit où le bien sera publié.
            'neighborhood' => $neighborhood,
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
    public static function missingFields(RadarListing $listing): array
    {
        $values = RadarReviewFields::values((array) $listing->extracted);

        $missing = array_values(array_filter(self::REQUIRED, fn (string $field) => $values[$field] === null || $values[$field] === ''));

        // Refusé (ou non approuvé) depuis la relecture : le canonicaliseur de l'adresse le laisserait tomber, et le bien sortirait
        // public sans ville ni quartier. Un quartier FUSIONNÉ, lui, se publie : l'adresse suit la fusion jusqu'à sa cible.
        if (! in_array('neighborhood_id', $missing, true) && ! self::neighborhoodIsLive((int) $values['neighborhood_id'])) {
            $missing[] = 'neighborhood_id';
        }

        return $missing;
    }

    public static function otpPreviewActive(): bool
    {
        return OtpPreview::enabled() && ! app()->environment('local');
    }

    public static function activationAvailable(): bool
    {
        return (bool) config('auth.phone_login.enabled');
    }

    /** Le nom du quartier canonique, `null` sans quartier ou pour un quartier refusé. */
    public static function neighborhoodName(mixed $id): ?string
    {
        return $id === null ? null : GeoNeighborhood::query()->find((int) $id)?->canonique()?->name;
    }

    /** La ligne qui fait foi (`canonique()` suit les fusions, rend `null` pour un refusé) est approuvée. */
    private static function neighborhoodIsLive(int $id): bool
    {
        return GeoNeighborhood::query()->find($id)?->canonique()?->status === ReferentialStatus::Approved;
    }

    private function createProperty(RadarListing $listing, RadarAdvertiser $advertiser, User $user, Agency $agency, bool $mandate = false): Property
    {
        $values = RadarReviewFields::values((array) $listing->extracted);
        $isRent = $values['contract'] === ContractType::Rent->value;

        $property = Property::query()->create([
            'agency_id' => $agency->id,
            'user_id' => $user->id,
            'title' => RadarListingTitle::resolve($values, self::neighborhoodName($values['neighborhood_id']))['title'],
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
            // TCK-2394 — `radar_mandate` : publié sous mandat (ADR-0079), la mention publique la lira (TCK-2422).
            'metadata' => $mandate ? ['radar_listing_id' => $listing->id, 'radar_mandate' => true] : ['radar_listing_id' => $listing->id],
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

    /**
     * Original ET conversions : `thumbnail` est synchrone et se range sur le disque PUBLIC des conversions, sous un chemin sans
     * ligne `media` après le retour arrière — rien ne la purgerait plus.
     *
     * @param  list<Media>  $medias
     */
    private function discardFiles(array $medias): void
    {
        $filesystem = app(Filesystem::class);
        foreach ($medias as $media) {
            $filesystem->removeAllFiles($media);
        }
    }

    /**
     * TCK-2390 (vérification adverse I-1) — le `display_name` sans aucun numéro : il vient de la signature d'une annonce ou
     * du profil WhatsApp, et peut porter le numéro (« Awa 77 123 45 67 »), comme le sait déjà le message d'accord. Le nom du
     * compte, celui de l'espace PUBLIC et la page de réclamation en dérivent : le numéro est retiré, pas remplacé.
     */
    public static function displayNameWithoutPhone(RadarAdvertiser $advertiser): string
    {
        $masked = str_replace(PhoneMasker::TOKEN, ' ', PhoneMasker::mask((string) $advertiser->display_name));

        return trim((string) preg_replace('/\s+/u', ' ', $masked));
    }

    /** @return array{0: string, 1: string} prénom (premier mot) et reste, vides sans nom */
    public static function nameOf(RadarAdvertiser $advertiser): array
    {
        $parts = preg_split('/\s+/', self::displayNameWithoutPhone($advertiser), 2) ?: [];

        return [$parts[0] ?? '', $parts[1] ?? ''];
    }

    public static function spaceName(string $firstName): string
    {
        return $firstName !== ''
            ? (string) __('onboarding.auto_space.name_with_first_name', ['first_name' => $firstName], 'fr')
            : (string) __('onboarding.auto_space.name_default', [], 'fr');
    }
}
