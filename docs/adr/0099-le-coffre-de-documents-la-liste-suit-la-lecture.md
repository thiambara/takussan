# ADR-0099 — Le coffre de documents : la liste suit la lecture, et les documents générés sont listés depuis leur source, jamais copiés

- **Statut** : Accepté le 2026-11-10 (recommandation de la famille 4 validée par le porteur, « je valide tes recommandations ») — modalités : décisions de la session, à revoir
- **Date** : 2026-11-10
- **Tickets** : TCK-2655 (API), TCK-2656 (coffre par dossier) ; la partie « Documents » de TCK-2639 (fiche bien) et de TCK-2641 (fiche bailleur)
- **Amende** : la règle posée par TCK-820 (liste restreinte aux téléversements de l'appelant), **sans la révoquer**
- **S'appuie sur** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (cloisonnement des bailleurs), [ADR-0055](0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md) (impersonation)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `GET /api/documents` ne liste **que ce que l'appelant a téléversé** (`DocumentPolicy::restreindreAuTeleverseur`, `where('uploaded_by', …)`). TCK-820 l'a posé au motif qu'aucun écran ne lisait cette liste, et qu'une liste large exposait des pièces.
- Effets :
  - le locataire ne voit pas un document que l'agence a rattaché à son bail ;
  - l'agence ne voit pas, depuis un bien, ce qu'un collègue y a déposé.
- **La lecture unitaire est plus large** (`DocumentPolicy::view` / `reaches`) :
  - un document de bail se lit par le bailleur, le personnel de l'agence et le locataire ;
  - un document de bien se lit par le bailleur et le personnel.

  La liste et la lecture ne disent donc pas la même chose.
- **Les PDF que la plateforme produit ne sont pas des `Document`.** Six endpoints les rendent à la volée : contrat, quittance, état des lieux, facture, relevé du bailleur, devis d'intervention. Le contrat signé est un média du bail (`signed_contract`, [ADR-0042](0042-preuve-de-consentement-a-la-signature-du-bail.md)). `DocumentPdfService::store()` n'a aucun appelant.
- **Le locataire n'a aucun endroit où retrouver « mon contrat ».**

## Décision

**Une liste ne montre que ce qu'un `show` ouvrirait, par un seul prédicat. Les documents que la plateforme génère se listent depuis leur source et se téléchargent par leur endpoint, sans copie.**

1. **Avec une cible, la liste suit la lecture.**
   - Une cible est un bien, un bail, une fiche client, un profil bailleur ou un état des lieux. La liste rend **tout** ce que l'appelant peut `view` sur cette cible, quel qu'en soit l'auteur.
   - Le prédicat est **unique** : la règle de `view` / `reaches`, traduite en SQL pour la liste. Elle n'est pas écrite deux fois.
   - **Sans cible, la règle de TCK-820 reste** : on ne liste que ses propres téléversements.
2. **Le coffre.** `GET /api/me/document-vault` range par dossier ce que l'appelant peut lire, selon son **profil actif** :
   - **locataire** : un dossier par bail, ses quittances par année, ses pièces ;
   - **bailleur** : un dossier par bien, ses relevés et attestations, ses pièces ;
   - **prestataire** : ses factures, ses pièces.

   Chaque entrée dit si elle est `uploaded` ou `generated`, et donne son chemin de téléchargement existant.
3. **Les documents générés sont listés depuis leur source, jamais matérialisés en `Document`.**
   - Les sources sont : le contrat, les quittances (une par échéance **payée**, aucune pour une échéance remboursée, TCK-2505), les états des lieux signés, les relevés et les factures.
   - Ils se téléchargent **par leur endpoint actuel, sous sa propre autorisation**. Le coffre ne leur donne aucun droit de plus.
   - Ils n'ont ni versions, ni vérification, ni partage par lien.
4. **Règles conservées** :
   - sous impersonation, les pièces de profil ne se listent pas (TCK-697) ;
   - l'agent suspendu ou retiré ne liste plus ce qu'il a téléversé dans l'agence (TCK-2295) ;
   - le super-admin n'a pas de coffre de plateforme, et ouvre un document par son identifiant, journalisé (TCK-820).
5. **Les cibles se nomment par des alias courts** (`property`, `lease`, `customer`, `owner_profile`, `inventory`) et non par le nom de classe complet. Le rattachement à l'écran se fait par une liste nommée de cibles (`attachable_targets`), jamais par un identifiant numérique saisi.

## Conséquences

- **Une liste plus large qu'aujourd'hui, mais jamais plus large que la lecture.** Le risque que TCK-820 fermait, une liste qui expose, ne revient pas : toute entrée listée s'ouvrait déjà par son identifiant.
- **Un test de parité garde la règle** : toute entrée listée s'ouvre (200), et toute entrée qu'un `show` refuse n'est pas listée. Il se vérifie par ablation, en retirant une condition du SQL.
- **Le coffre se calcule à la lecture**, à partir de plusieurs sources : un nombre de requêtes **constant**, et non une requête par échéance. Un locataire de 36 échéances se lit comme un locataire de 3.
- **Aucune croissance de stockage par quittance.** Le PDF se rend à la demande, comme aujourd'hui.
- **Le partage par lien d'un document généré** (le locataire qui envoie son contrat à une banque) est hors périmètre. S'il est voulu, ce sera un lien signé vers l'endpoint de génération, sur le modèle du lien porteur d'[ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md), jamais une copie.

## Options écartées

- **Matérialiser chaque PDF généré en `Document`** : deux sources du même PDF, une copie qui dérive quand le bail change (renouvellement, avenant), et un stockage qui croît à chaque quittance.
- **Révoquer TCK-820 et lister tout ce que l'on peut lire, sans cible** : une liste globale sans écran pour la lire, ce que TCK-820 refusait à raison. La cible borne la liste à ce qu'un écran montre.
- **Une seconde règle de lecture pour la liste**, plus étroite que `view` : c'est le défaut d'aujourd'hui, une liste et une lecture qui ne disent pas la même chose.

## Application

- `DocumentPolicy` : le prédicat de `view` traduit en portée SQL, partagée par `index` avec cible. `DocumentVaultController`. `GET /api/documents/generated?target=`.
- Gardes (TCK-2655) :
  - le test de parité entre la liste et le `show`, par profil ;
  - le test des quittances (payée seulement) ;
  - le test d'impersonation ;
  - le test de l'agent retiré ;
  - le compte de requêtes constant du coffre.
