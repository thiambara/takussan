<?php

namespace Tests\Support;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\GeoNeighborhood;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;

/**
 * TCK-2389 — l'état de départ d'une publication : un opérateur `super_admin` qui tient l'annonceur, une annonce
 * `consented` couverte par un accord confirmé, sa réserve de photos prête. Chaque test défait ce qu'il veut éprouver.
 *
 * Suppose `OperateursPlateforme` et `RefreshDatabase` dans la classe qui l'utilise.
 */
trait FixturesDePublicationRadar
{
    private const NUMERO_ANNONCEUR = '+221771234567';

    private User $operateur;

    private RadarAdvertiser $annonceur;

    private GeoNeighborhood $quartier;

    private ?RadarOutreach $message = null;

    protected function installerLaPublication(PlatformProfileLevel $niveau = PlatformProfileLevel::SuperAdmin): void
    {
        $this->operateur = $this->agirEnOperateur($niveau);
        $this->quartier = GeoNeighborhood::factory()->create();
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO_ANNONCEUR, 'display_name' => 'Awa Diop']);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
    }

    /** Un JPEG de 16 × 12 px que GD relit. */
    protected static function jpeg(int $teinte = 120): string
    {
        $image = imagecreatetruecolor(16, 12);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, $teinte, 83, 50));
        ob_start();
        imagejpeg($image);

        return (string) ob_get_clean();
    }

    /**
     * Une annonce `consented`, lue, avec `$photos` photos dans la réserve (préparation terminée) ; couverte par l'accord
     * confirmé du message de l'annonceur si `$couverte`.
     *
     * @param  array<string, mixed>  $surcharge
     * @param  array<string, mixed>  $extracted  surcharges de la sortie lue (voir `RadarListingFactory::extracted()`)
     */
    protected function annonceConsentie(array $surcharge = [], int $photos = 2, bool $couverte = true, array $extracted = []): RadarListing
    {
        $annonce = RadarListing::factory()
            ->extracted(array_replace_recursive(['neighborhood' => ['neighborhood_id' => $this->quartier->id]], $extracted))
            ->create($surcharge + [
                'radar_advertiser_id' => $this->annonceur->id,
                'stage' => RadarListingStage::Consented,
                'source_kind' => RadarSourceKind::Url,
                'source_url' => 'https://sn.coinafrique.com/annonce/'.fake()->unique()->numerify('#####'),
            ]);

        $elements = [];
        for ($i = 0; $i < $photos; $i++) {
            $media = $annonce->addMediaFromString(self::jpeg(100 + $i * 20))->usingFileName("p{$i}.jpg")->toMediaCollection('radar_photos');
            $elements[] = ['url' => "https://a.cdn.test/p/{$annonce->id}-{$i}.jpg", 'media_id' => $media->id];
        }
        if ($elements !== []) {
            $annonce->forceFill(['photo_urls' => array_column($elements, 'url'), 'photo_preparation' => $elements])->save();
        }

        if ($couverte) {
            $this->couvrir($annonce);
        }

        return $annonce->fresh();
    }

    /** Ajoute l'annonce au message d'accord confirmé (le crée au premier appel). */
    protected function couvrir(RadarListing $annonce): void
    {
        if ($this->message === null) {
            $this->message = RadarOutreach::factory()->sent()->create([
                'radar_advertiser_id' => $this->annonceur->id, 'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
            ]);
            RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $this->message->id]);
        }
        $this->message->listings()->attach($annonce->id);
    }
}
