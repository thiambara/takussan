<?php

namespace App\Services\Messaging\Copilote;

/**
 * TCK-2975 (ADR-0131 § 3) — le filtrage, AVANT écriture, des sources d'une réponse et des appuis d'un brouillon :
 * un appui `message` doit être un message de l'entrée lue pour le demandeur, un appui `objet` le sujet du fil ou
 * l'objet d'une de ses cartes que le demandeur lit (`LectureDuFilPourIa::lire()['objets']`). Tout le reste —
 * un message d'un autre fil, un objet d'une autre agence, un identifiant inventé ou mal formé — est retiré.
 */
final class AppuisDuFil
{
    /**
     * @param  list<int>  $messages
     * @param  list<array{type: string, id: int}>  $objets
     * @return list<array{type: string, id: int, objet_type?: string}>
     */
    public static function garder(mixed $appuis, array $messages, array $objets): array
    {
        if (! is_array($appuis)) {
            return [];
        }
        $connus = array_flip($messages);
        $lisibles = [];
        foreach ($objets as $o) {
            $lisibles[$o['type'].':'.$o['id']] = true;
        }

        $gardes = [];
        foreach ($appuis as $appui) {
            $id = is_array($appui) ? ($appui['id'] ?? null) : null;
            if (! is_int($id) && ! (is_string($id) && ctype_digit($id))) {
                continue;
            }
            $id = (int) $id;
            // Le modèle écrit `nature` (son schéma) ; la proposition enregistrée garde `type`.
            $type = $appui['nature'] ?? null;
            if ($type === 'message' && isset($connus[$id])) {
                $gardes[] = ['type' => 'message', 'id' => $id];
            } elseif ($type === 'objet' && is_string($appui['objet_type'] ?? null) && isset($lisibles[$appui['objet_type'].':'.$id])) {
                $gardes[] = ['type' => 'objet', 'id' => $id, 'objet_type' => $appui['objet_type']];
            }
        }

        return array_values(array_unique($gardes, SORT_REGULAR));
    }
}
