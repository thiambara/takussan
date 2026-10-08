<?php

namespace App\Observers;

use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Address;
use App\Models\Property;

/**
 * TCK-598 (contrainte 6, ADR-0052 §2) — invalide les données en cache de la fiche publique quand
 * ce que la fiche sert change.
 *
 * ⚠ **Classe DISTINCTE de `PropertyObserver`**, enregistrée à côté de lui : celui-là appartient à
 * d'autres tickets (modération, similaires). Celle-ci ne fait qu'une chose.
 *
 * Le déclencheur est « une colonne a changé » — moins une liste d'EXCLUSIONS, et non une liste de
 * champs servis : une liste de champs servis oublierait le prochain champ ajouté à la fiche, une
 * liste d'exclusions ne peut qu'invalider trop. Exclus : les compteurs, que la fiche peut montrer en
 * retard (contrainte 4), et `updated_at`, qui n'est pas affiché.
 *
 * Une vue n'invalide rien, et pas parce qu'elle est exclue : elle ne passe pas par Éloquent
 * (`PropertyViewCounter`, `toBase()`), donc aucun événement ne part.
 *
 * Ce que l'appel signé ne porte pas — photos, étiquettes, avis, documents, agence, contact — attend
 * la revalidation temporelle du front (300 s).
 */
class PropertyPublicCacheObserver
{
    /** @var list<string> */
    public const COLONNES_SANS_EFFET = ['views_count', 'favorites_count', 'updated_at'];

    public function updated(Property $property): void
    {
        $changees = array_diff(array_keys($property->getChanges()), self::COLONNES_SANS_EFFET);
        if ($changees === []) {
            return;
        }

        $slugs = [(string) $property->slug];
        // Le slug a changé : l'ANCIEN aussi, sinon son entrée resservirait l'ancienne fiche.
        if ($property->wasChanged('slug') && filled($property->getOriginal('slug'))) {
            $slugs[] = (string) $property->getOriginal('slug');
        }

        $this->invalider($slugs);
    }

    public function deleted(Property $property): void
    {
        $this->invalider([(string) $property->slug]);
    }

    public function restored(Property $property): void
    {
        $this->invalider([(string) $property->slug]);
    }

    /** L'adresse d'un bien est servie par la fiche (`location`), mais vit sur son propre modèle. */
    public function adresseModifiee(Address $address): void
    {
        if ($address->addressable_type !== Property::class) {
            return;
        }

        $slug = Property::withTrashed()->whereKey($address->addressable_id)->value('slug');
        if (is_string($slug) && $slug !== '') {
            $this->invalider([$slug]);
        }
    }

    /** @param  list<string>  $slugs */
    private function invalider(array $slugs): void
    {
        $slugs = array_values(array_unique(array_filter($slugs, fn (string $s) => $s !== '')));
        if ($slugs !== []) {
            RevalidatePublicPropertyPage::dispatch($slugs);
        }
    }
}
