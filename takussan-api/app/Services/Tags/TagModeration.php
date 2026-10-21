<?php

namespace App\Services\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\Tag;
use App\Models\User;
use App\Services\Geo\GeoReindexation;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (ADR-0062 §7) — les décisions de la file des équipements. La recherche indexe les NOMS
 * des étiquettes VISIBLES d'un bien (`Property::toSearchableArray`, `tagsVisibles`) : une
 * approbation, un refus, un renommage et une fusion réindexent les biens touchés, APRÈS la
 * transaction. Le journal s'écrit entre les deux (TCK-1098, P90.03) : un moteur injoignable fait
 * lever la réindexation, et le geste, déjà validé, doit rester tracé.
 */
final class TagModeration
{
    public function __construct(private readonly GeoReindexation $reindexation) {}

    public function approuver(Tag $tag, User $par): Tag
    {
        // L'approbation rend la proposition visible sur TOUS les biens qui la portent, y compris
        // ceux où un autre que son auteur l'a rattachée : la recherche n'indexant que les étiquettes
        // visibles (`Property::tagsVisibles`), ces biens deviennent trouvables — réindexés.
        $biens = DB::transaction(function () use ($tag) {
            $ligne = $this->verrouiller($tag);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Approved])->save();

            return $this->biensDe($ligne);
        });
        $this->journaliser($tag, $par, 'super_admin_tag_approved', [], 'Équipement approuvé');
        $this->reindexation->biens($biens);

        return $tag->refresh();
    }

    public function rejeter(Tag $tag, User $par): Tag
    {
        $biens = DB::transaction(function () use ($tag) {
            $ligne = $this->verrouiller($tag);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Rejected])->save();
            $biens = $this->biensDe($ligne);
            DB::table('taggables')->where('tag_id', $ligne->getKey())->delete();

            return $biens;
        });
        $this->journaliser($tag, $par, 'super_admin_tag_rejected', [], 'Équipement refusé');
        $this->reindexation->biens($biens);

        return $tag->refresh();
    }

    public function renommer(Tag $tag, string $nom, User $par): Tag
    {
        $nom = trim((string) preg_replace('/\s+/u', ' ', $nom));
        $ancien = $tag->name;

        $biens = DB::transaction(function () use ($tag, $nom) {
            $ligne = $this->verrouiller($tag);
            // TCK-729 (P30.01) — le front traduit un équipement du catalogue par son slug, et
            // `tags:sync-catalog` le retrouve par son nom : renommé, il garderait son libellé à
            // l'écran et serait recréé au déploiement suivant sous `<slug>-2`. Seules les
            // propositions se renomment.
            abort_code_if(TagCatalog::estUnEquipement($ligne->name), 409, 'tags.catalog_rename_forbidden');
            $pris = Tag::query()->whereKeyNot($ligne->getKey())
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
                ->exists();
            abort_code_if($pris, 409, 'tags.name_taken');
            $this->reecrireRecherchesSauvegardees($ligne->name, $nom);
            $ligne->forceFill(['name' => $nom])->save();

            return $this->biensDe($ligne);
        });
        $this->journaliser($tag, $par, 'super_admin_tag_renamed', ['from' => $ancien, 'to' => $nom], 'Équipement renommé');
        $this->reindexation->biens($biens);

        return $tag->refresh();
    }

    public function fusionner(Tag $source, Tag $cible, User $par): Tag
    {
        abort_code_if($source->is($cible), 422, 'tags.merge_into_self');

        $biens = DB::transaction(function () use ($source, $cible) {
            foreach ($source->getKey() < $cible->getKey() ? [$source, $cible] : [$cible, $source] as $ligne) {
                $this->verrouiller($ligne);
            }
            // Les fusions restent au sein d'un même type : la source est SUPPRIMÉE, et une
            // étiquette CRM emporterait ses liaisons (des clients) vers un équipement.
            $src = Tag::query()->findOrFail($source->getKey());
            // Le type ne suffit pas : une étiquette CRM basculée en équipement (`PUT /api/tags`)
            // porte encore ses clients. Ce sont les LIAISONS qui disent ce que la fusion emporterait.
            $porteAutreChoseQueDesBiens = DB::table('taggables')
                ->where('tag_id', $src->getKey())
                ->where('taggable_type', '!=', Property::class)
                ->exists();
            abort_code_if($src->type !== TagType::Amenity || $porteAutreChoseQueDesBiens, 422, 'tags.merge_source_invalid');
            // TCK-846 (P30.02) — la source est SUPPRIMÉE, et `tags:sync-catalog` recrée au déploiement
            // tout nom du catalogue absent : la fusion serait défaite. Seules les propositions se
            // fusionnent, y compris dans un équipement du catalogue.
            abort_code_if(TagCatalog::estUnEquipement($src->name), 422, 'tags.catalog_merge_forbidden');
            $cbl = Tag::query()->findOrFail($cible->getKey());
            abort_code_if(
                $cbl->type !== TagType::Amenity || $cbl->status === ReferentialStatus::Rejected,
                422,
                'tags.merge_target_invalid',
            );

            $biens = $this->biensDe($source);
            DB::table('taggables')->insertOrIgnoreUsing(
                ['tag_id', 'taggable_id', 'taggable_type', 'attached_by_id', 'created_at', 'updated_at'],
                DB::table('taggables')
                    ->selectRaw('?, taggable_id, taggable_type, attached_by_id, now(), now()', [$cbl->getKey()])
                    ->where('tag_id', $source->getKey()),
            );
            // La suppression emporte les liaisons de la source (`cascadeOnDelete`).
            Tag::query()->whereKey($source->getKey())->delete();
            $this->reecrireRecherchesSauvegardees($src->name, $cbl->name);

            return $biens;
        });
        $this->journaliser($cible, $par, 'super_admin_tag_merged', ['from_id' => $source->getKey(), 'from_name' => $source->name], 'Équipement fusionné');
        $this->reindexation->biens($biens);

        return $cible->refresh();
    }

    /**
     * TCK-1081 (P67.03) — le filtre `tags` compare des NOMS (`PropertySearchService::buildFilter`,
     * une clause par équipement) : une recherche sauvegardée qui porte l'ancien nom ne rendrait
     * plus rien, et une alerte à plusieurs équipements se tairait entière. Ses critères suivent
     * le renommage et la fusion (décision du porteur), dans la transaction de la décision.
     *
     * La forme est gardée — une chaîne `a,b` (l'URL) reste une chaîne, une liste (le front) une
     * liste — et un nom présent deux fois après une fusion n'est gardé qu'une fois.
     */
    private function reecrireRecherchesSauvegardees(string $ancien, string $nouveau): void
    {
        $ancien = trim($ancien);
        if ($ancien === '' || $ancien === $nouveau) {
            return;
        }

        SavedSearch::query()
            ->whereRaw("jsonb_typeof(criteria->'tags') in ('array', 'string')")
            ->chunkById(200, function ($recherches) use ($ancien, $nouveau) {
                foreach ($recherches as $recherche) {
                    $criteres = $recherche->criteria;
                    $tags = $criteres['tags'];
                    $enChaine = is_string($tags);
                    $noms = $enChaine ? explode(',', $tags) : (array) $tags;
                    if (! in_array($ancien, array_map(fn ($n) => is_string($n) ? trim($n) : $n, $noms), true)) {
                        continue;
                    }

                    $noms = array_values(array_unique(array_map(
                        fn ($n) => is_string($n) && trim($n) === $ancien ? $nouveau : $n,
                        $noms,
                    ), SORT_REGULAR));
                    $criteres['tags'] = $enChaine ? implode(',', $noms) : $noms;
                    $recherche->forceFill(['criteria' => $criteres])->save();
                }
            });
    }

    private function verrouiller(Tag $tag): Tag
    {
        return Tag::query()->whereKey($tag->getKey())->lockForUpdate()->firstOrFail();
    }

    private function exigerEnAttente(Tag $ligne): void
    {
        abort_code_if($ligne->status !== ReferentialStatus::Pending, 409, 'tags.not_pending');
    }

    /** @return list<int> */
    private function biensDe(Tag $tag): array
    {
        return DB::table('taggables')
            ->where('tag_id', $tag->getKey())
            ->where('taggable_type', Property::class)
            ->pluck('taggable_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** @param  array<string, mixed>  $details */
    private function journaliser(Tag $tag, User $par, string $evenement, array $details, string $libelle): void
    {
        activity('Admin')
            ->performedOn($tag)
            ->causedBy($par)
            ->withProperties(['tag_id' => $tag->getKey(), 'name' => $tag->name] + $details)
            ->event($evenement)
            ->log($libelle);
    }
}
