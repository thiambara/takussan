<?php

namespace Database\Seeders\Support;

use App\Models\Enums\DocumentType;
use App\Models\Enums\MaintenanceCategory;
use Faker\Generator;

/**
 * Le texte que les seeders écrivent, en français d'une agence de Dakar (TCK-2380).
 *
 * `sentence()` et `paragraph()` de Faker rendent du latin quelle que soit la locale : les messages,
 * tâches, interventions et avis semés se lisaient « Fuga ea quia officia est blanditiis quia. ».
 * Chaque banque est propre à son domaine — une intervention de plomberie parle de plomberie — et le
 * tirage passe par le Faker du contexte, donc par sa graine.
 *
 * Le wolof est en pause depuis le 2026-10-16 : aucune phrase `wo` ici.
 */
class SeedTexts
{
    public function __construct(private readonly Generator $faker) {}

    /** Message d'un prospect, ou de l'agence qui lui répond, dans le fil d'un bien. */
    public function messageDeProspect(bool $duProspect): string
    {
        return $this->un($duProspect ? [
            'Bonjour, le bien est-il toujours disponible ?',
            'Bonjour, je souhaiterais organiser une visite cette semaine si possible.',
            'Le loyer est-il négociable ?',
            'Les charges sont-elles comprises dans le prix ?',
            'Est-ce que le quartier est calme le soir ?',
            'Je peux passer samedi matin, vers 10 h ?',
            'Il faut combien de mois de caution ?',
            'Y a-t-il un groupe électrogène ou un surpresseur ?',
            'Merci pour la visite, je vous fais un retour d\'ici demain.',
            'Je suis intéressé, quels documents faut-il fournir pour le dossier ?',
            'Le parking est-il inclus ?',
            'D\'accord, je vous envoie mes pièces aujourd\'hui.',
        ] : [
            'Bonjour, oui le bien est toujours disponible.',
            'Avec plaisir. Je vous propose jeudi à 17 h, cela vous convient ?',
            'Le prix affiché est ferme, mais on peut en discuter avec le propriétaire.',
            'Les charges ne sont pas comprises, elles tournent autour de 10 000 FCFA par mois.',
            'Deux mois de caution et un mois d\'avance, plus les frais d\'agence.',
            'C\'est noté pour samedi 10 h, je vous attends devant l\'immeuble.',
            'Il nous faut une pièce d\'identité, vos trois derniers bulletins et un garant.',
            'Merci pour votre visite, n\'hésitez pas si vous avez d\'autres questions.',
            'Le propriétaire a accepté votre dossier, on peut préparer le bail.',
            'Je vous confirme le rendez-vous, voici mon numéro en cas de retard.',
        ]);
    }

    /** Message échangé entre membres de l'équipe d'une agence. */
    public function messageDEquipe(): string
    {
        return $this->un([
            'Qui peut faire la visite de 16 h à Mermoz ?',
            'Le locataire du F3 de Sacré-Cœur a payé son loyer ce matin.',
            'Pensez à mettre à jour les photos des biens publiés cette semaine.',
            'Le plombier passe demain à 9 h, quelqu\'un peut lui ouvrir ?',
            'J\'ai relancé les deux impayés de la semaine, j\'attends les retours.',
            'Réunion d\'équipe lundi 9 h pour faire le point sur les mandats.',
            'Nouveau mandat signé aux Almadies, je crée la fiche aujourd\'hui.',
            'L\'état des lieux de sortie est prévu vendredi.',
            'Le client de la villa de Ngor veut une contre-visite.',
            'C\'est fait, merci.',
            'Je m\'en occupe.',
            'Bien reçu, je regarde ça dans l\'après-midi.',
        ]);
    }

    public function sujetDeGroupe(): string
    {
        return $this->un([
            'Planning des visites', 'Suivi des impayés', 'Mandats du mois', 'Interventions en cours',
            'États des lieux à venir', 'Point hebdomadaire', 'Relances locataires', 'Photos à refaire',
        ]);
    }

    /** @return array{0: string, 1: string} titre, description */
    public function tache(): array
    {
        return $this->un([
            ['Relancer le locataire pour le loyer du mois', 'Appeler puis envoyer un message WhatsApp si pas de réponse.'],
            ['Préparer le dossier de bail', 'Rassembler la pièce d\'identité, les justificatifs de revenus et l\'attestation du garant.'],
            ['Organiser la visite du bien', 'Confirmer l\'heure avec le prospect et récupérer les clés auprès du gardien.'],
            ['Mettre à jour les photos de l\'annonce', 'Refaire les photos du salon et de la cuisine en journée.'],
            ['Faire signer l\'état des lieux d\'entrée', 'Passer avec le locataire et le propriétaire, relever les compteurs.'],
            ['Envoyer la quittance au locataire', 'Le paiement a été reçu, transmettre la quittance par e-mail.'],
            ['Vérifier le titre foncier', 'Demander une copie au propriétaire et la contrôler avant publication.'],
            ['Appeler le propriétaire pour le renouvellement', 'Le bail arrive à échéance, proposer les nouvelles conditions.'],
            ['Faire passer un artisan', 'Prendre rendez-vous et obtenir un devis avant d\'engager les travaux.'],
            ['Récupérer les clés auprès de l\'ancien locataire', 'Prévoir l\'état des lieux de sortie le même jour.'],
        ]);
    }

    /** @return array{0: string, 1: string} titre, description */
    public function intervention(MaintenanceCategory $categorie): array
    {
        return $this->un(match ($categorie) {
            MaintenanceCategory::Plumbing => [
                ['Fuite sous l\'évier de la cuisine', 'L\'eau goutte en continu sous l\'évier, le placard est mouillé.'],
                ['Chasse d\'eau qui ne s\'arrête pas', 'La chasse d\'eau des toilettes coule en permanence.'],
                ['Pas d\'eau chaude', 'Le chauffe-eau ne chauffe plus depuis deux jours.'],
                ['Surpresseur en panne', 'Plus de pression à l\'étage depuis ce matin.'],
            ],
            MaintenanceCategory::Electrical => [
                ['Disjoncteur qui saute', 'Le disjoncteur saute dès qu\'on branche la climatisation.'],
                ['Prise qui ne fonctionne plus', 'La prise de la chambre principale ne donne plus de courant.'],
                ['Éclairage du couloir en panne', 'Les lampes du couloir ne s\'allument plus.'],
            ],
            MaintenanceCategory::Structural => [
                ['Fissure sur le mur du salon', 'Une fissure s\'est élargie sur le mur porteur du salon.'],
                ['Infiltration par la terrasse', 'Des traces d\'humidité au plafond après la pluie.'],
                ['Carrelage décollé', 'Plusieurs carreaux se sont décollés dans l\'entrée.'],
            ],
            MaintenanceCategory::Appliance => [
                ['Climatiseur qui ne refroidit plus', 'Le climatiseur de la chambre tourne mais ne refroidit plus.'],
                ['Réfrigérateur en panne', 'Le réfrigérateur fourni avec le logement ne fait plus de froid.'],
                ['Gazinière défectueuse', 'Un des brûleurs ne s\'allume plus.'],
            ],
            MaintenanceCategory::Painting => [
                ['Peinture écaillée dans la chambre', 'La peinture s\'écaille près de la fenêtre.'],
                ['Rafraîchir les murs avant entrée', 'Repeindre le salon avant l\'arrivée du nouveau locataire.'],
            ],
            MaintenanceCategory::Cleaning => [
                ['Nettoyage avant état des lieux', 'Nettoyage complet du logement avant la remise des clés.'],
                ['Nettoyage de la cage d\'escalier', 'La cage d\'escalier n\'a pas été nettoyée depuis plusieurs semaines.'],
            ],
            MaintenanceCategory::PestControl => [
                ['Présence de cafards dans la cuisine', 'Traitement demandé, les cafards sont revenus.'],
                ['Désinsectisation contre les moustiques', 'Beaucoup de moustiques depuis la saison des pluies.'],
                ['Souris dans le magasin', 'Des traces de rongeurs dans la réserve.'],
            ],
            MaintenanceCategory::Locksmith => [
                ['Serrure de la porte d\'entrée bloquée', 'La clé tourne dans le vide, la porte ne se verrouille plus.'],
                ['Clés perdues', 'Le locataire a perdu ses clés, il faut changer le barillet.'],
            ],
            MaintenanceCategory::Other => [
                ['Portail qui ferme mal', 'Le portail coulissant force à la fermeture.'],
                ['Antenne parabolique à réorienter', 'Plus de signal depuis le dernier coup de vent.'],
            ],
        });
    }

    public function compteRenduDIntervention(): string
    {
        return $this->un([
            'Intervention terminée, le problème est réglé.',
            'Pièce remplacée, testé en présence du locataire.',
            'Réparation faite, une seconde visite n\'est pas nécessaire.',
            'Travaux terminés, facture transmise à l\'agence.',
            'Réglé provisoirement, une pièce est commandée.',
        ]);
    }

    /** @return array{0: string, 1: string} titre, contenu */
    public function avis(int $note): array
    {
        return $this->un(match (true) {
            $note >= 5 => [
                ['Très bon logement', 'Appartement conforme à l\'annonce, bien situé et calme. L\'agence a été réactive du début à la fin.'],
                ['Je recommande', 'Visite rapide, dossier simple et propriétaire à l\'écoute. Rien à redire.'],
                ['Excellent emplacement', 'Proche des commerces et des transports, très lumineux.'],
            ],
            $note === 4 => [
                ['Bon rapport qualité-prix', 'Logement propre et bien entretenu, quelques coupures d\'eau en saison chaude.'],
                ['Satisfait dans l\'ensemble', 'Bon accueil de l\'agence, il a fallu relancer pour une petite réparation.'],
                ['Quartier agréable', 'Bien situé, un peu de bruit le week-end mais rien de gênant.'],
            ],
            default => [
                ['Correct sans plus', 'Le logement correspond aux photos mais la cuisine mériterait d\'être rénovée.'],
                ['Peut mieux faire', 'Les délais d\'intervention sont un peu longs, sinon le bien est correct.'],
                ['Moyen', 'Bien placé mais l\'humidité dans la salle de bain est un vrai problème.'],
            ],
        });
    }

    public function motifDAnnulation(): string
    {
        return $this->un([
            'Le client a trouvé un autre logement.',
            'Dates incompatibles avec son déménagement.',
            'Le budget ne convenait finalement pas.',
            'Le propriétaire a retiré le bien de la location.',
            'Le client n\'a pas fourni les pièces demandées.',
            'Changement de projet professionnel du client.',
        ]);
    }

    public function noteClient(): string
    {
        return $this->un([
            'Cherche un F3 à Mermoz ou Sacré-Cœur, budget autour de 400 000 FCFA.',
            'Rappeler en fin de mois, attend la confirmation de sa mutation.',
            'A visité deux biens, préfère un appartement en étage avec ascenseur.',
            'Dossier complet, garant salarié du public.',
            'Souhaite emménager avant la rentrée scolaire.',
            'Préfère être contacté sur WhatsApp en fin de journée.',
            'Intéressé par l\'achat d\'un terrain à Diamniadio.',
            'Budget revu à la hausse après la dernière visite.',
            'Client sérieux, déjà locataire chez nous il y a deux ans.',
        ]);
    }

    public function noteDeChangementDePrix(): string
    {
        return $this->un([
            'Ajustement après échange avec le propriétaire.',
            'Alignement sur les prix du quartier.',
            'Baisse pour relancer l\'annonce.',
            'Hausse après travaux de rénovation.',
        ]);
    }

    /** @return array{0: DocumentType, 1: string, 2: string} type, nom, description */
    public function documentDeBien(string $reference): array
    {
        [$type, $nom, $description] = $this->un([
            [DocumentType::Other, 'Titre foncier', 'Copie du titre foncier fournie par le propriétaire.'],
            [DocumentType::Other, 'Plan du logement', 'Plan coté remis à la prise de mandat.'],
            [DocumentType::Insurance, 'Attestation d\'assurance', 'Assurance habitation de l\'année en cours.'],
            [DocumentType::Photo, 'Photos de la façade', 'Photos prises lors de la visite de mandat.'],
            [DocumentType::Receipt, 'Reçu de taxe foncière', 'Dernier reçu de la contribution foncière.'],
            [DocumentType::Other, 'Mandat de gestion', 'Mandat signé par le propriétaire.'],
        ]);

        return [$type, "{$nom} - {$reference}", $description];
    }

    /** @template T @param  list<T>  $choix @return T */
    private function un(array $choix): mixed
    {
        return $this->faker->randomElement($choix);
    }
}
