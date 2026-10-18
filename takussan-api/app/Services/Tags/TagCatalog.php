<?php

namespace App\Services\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Services\Geo\GeoReindexation;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TCK-633 (ADR-0062 §7) — le catalogue des équipements et des étiquettes CRM, VERSIONNÉ ici et
 * chargé à chaque déploiement par `tags:sync-catalog` (la production ne lance aucun seeder, E-2).
 *
 * Règles, dans l'ordre :
 *   1. tout `feature` devient `amenity` (même identifiant : les liaisons tiennent) ;
 *   2. un nom absent est créé, approuvé ;
 *   3. un nom présent EN ATTENTE (une proposition que le catalogue reprend) est approuvé ;
 *   4. un nom présent REFUSÉ le reste : un refus de modération ne se défait pas par déploiement.
 * Le nom se compare comme l'index `tags_name_lower_unique` : casse repliée par ICU.
 */
final class TagCatalog
{
    public function __construct(private readonly GeoReindexation $reindexation) {}

    /** @var list<string> */
    public const EQUIPEMENTS = [
        'Piscine', 'Climatisation', 'Ascenseur', 'Parking', 'Garage', 'Balcon', 'Terrasse',
        'Toit-terrasse', 'Jardin', 'Cuisine équipée', 'Gardien', 'Vue sur mer', 'WiFi',
        'Fibre optique', 'TV', 'Machine à laver', 'Sèche-linge', 'Micro-ondes', 'Lave-vaisselle',
        'Sécurité 24/7', 'Caméras de surveillance', 'Portail électrique', 'Interphone',
        'Groupe électrogène', 'Panneaux solaires', 'Forage', 'Surpresseur', 'Citerne d\'eau',
        'Chauffe-eau', 'Ventilateurs', 'Moustiquaires', 'Chambre de bonne', 'Dépendance',
        'Salle de sport', 'Aire de jeux',
    ];

    /** @var list<string> */
    public const CRM = ['VIP', 'Prospect chaud', 'Étranger', 'Famille', 'Étudiant'];

    public function synchroniser(): void
    {
        DB::transaction(function () {
            Tag::query()->where('type', TagType::Feature->value)->update(['type' => TagType::Amenity->value, 'updated_at' => now()]);

            foreach (self::EQUIPEMENTS as $nom) {
                $this->assurer($nom, TagType::Amenity);
            }
            foreach (self::CRM as $nom) {
                $this->assurer($nom, TagType::Crm);
            }
        });
    }

    /** Le nom est-il celui d'un équipement du catalogue ? Comparé comme `assurer()` : casse repliée. */
    public static function estUnEquipement(string $nom): bool
    {
        return in_array(CaseInsensitive::fold($nom), array_map(CaseInsensitive::fold(...), self::EQUIPEMENTS), true);
    }

    /**
     * Un slug libre : `tags.slug` est unique tous types confondus.
     *
     * TCK-847 (P30.03) — `$horsCatalogue` : le slug d'une PROPOSITION. Le front traduit un nom du
     * catalogue par son slug ; une proposition dont le slug serait celui d'un nom du catalogue sans
     * porter ce nom (« Forage ! », « Fibre optique. ») reçoit d'office un suffixe, pour que
     * l'équipement du catalogue garde le sien.
     */
    public static function slugLibre(string $nom, bool $horsCatalogue = false): string
    {
        $base = self::slugDe($nom);
        $reserve = $horsCatalogue
            && in_array($base, array_map(self::slugDe(...), self::noms()), true)
            && ! in_array(CaseInsensitive::fold($nom), array_map(CaseInsensitive::fold(...), self::noms()), true);
        $n = $reserve ? 2 : 1;
        $slug = $reserve ? $base.'-2' : $base;
        while (Tag::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.++$n;
        }

        return $slug;
    }

    private static function slugDe(string $nom): string
    {
        return Str::limit(Str::slug($nom), 90, '') ?: 'etiquette';
    }

    /** @return list<string> */
    private static function noms(): array
    {
        return [...self::EQUIPEMENTS, ...self::CRM];
    }

    private function assurer(string $nom, TagType $type): void
    {
        $tag = Tag::query()->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])->first();

        if ($tag === null) {
            // TCK-847 (P30.03) — le slug exact, repris à une proposition NON APPROUVÉE qui le
            // détiendrait (créée avant la réservation, ou avant que le catalogue n'ajoute ce nom).
            $detenteur = Tag::query()->where('slug', self::slugDe($nom))
                ->where('status', '!=', ReferentialStatus::Approved->value)
                ->lockForUpdate()
                ->first();
            $detenteur?->forceFill(['slug' => self::slugLibre($detenteur->name, horsCatalogue: true)])->save();

            Tag::query()->create([
                'name' => $nom,
                'slug' => self::slugLibre($nom),
                'type' => $type,
                'status' => ReferentialStatus::Approved,
            ]);

            return;
        }

        if ($tag->status === ReferentialStatus::Pending) {
            $tag->forceFill(['status' => ReferentialStatus::Approved])->save();
            // Approuvée, la proposition devient visible — donc trouvable — sur tous ses biens.
            $this->reindexation->biens($tag->properties()->pluck('properties.id')->map(fn ($id) => (int) $id)->all());
        }
    }
}
