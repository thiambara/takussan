# Écrire pour les agents

Résumé adapté de `writing-for-agents` (`mattpocock/skills`, v1.3.2, MIT). Vaut pour tout ce qu'un agent lit : une
compétence, un `CLAUDE.md`, un document atteint par un renvoi.

## Les renvois

Un **renvoi** est une ligne présente dans le contexte de l'agent qui nomme un document hors contexte et dit **quand**
l'ouvrir. La description d'une compétence en est un ; une ligne du `CLAUDE.md` qui cite un document aussi. C'est la
**formulation** du renvoi, pas sa cible, qui décide si l'agent ouvre le document. Une cible indispensable derrière un
renvoi mal tourné est une loterie : affûter la formulation d'abord, n'intégrer le contenu que si ça ne suffit pas.

- **Le mot qui déclenche en tête.**
- **Un déclencheur par cas réellement distinct** ; des synonymes du même cas n'en font qu'un.
- **Chaque mot d'un renvoi toujours chargé se paie à chaque tour** : il se taille plus sévèrement que le corps.

## Les deux charges

- **La charge de contexte** : ce qui est chargé à chaque tour (un `CLAUDE.md`, la description d'une compétence) coûte
  des tokens et de l'attention, que ça serve ou non. Mesuré ici le 2026-08-22 : les trois `CLAUDE.md` pesaient
  ~32 % du démarrage d'une séance ([journal](../../../docs/journal-des-corrections.md)).
- **La charge cognitive** : ce que le porteur doit savoir pour invoquer la bonne chose. C'est le prix de son contrôle ;
  la dépenser où son jugement compte, la retirer ailleurs.

## L'échelle de l'information

1. **Les étapes dans le fichier** : ce que l'agent fait, dans l'ordre.
2. **La référence dans le fichier** : consultée à la demande.
3. **La référence déportée** : un fichier à part, atteint par un renvoi, chargé seulement quand le renvoi se déclenche.

Garder dans le fichier ce dont **tous** les cas ont besoin ; déporter ce que seuls certains atteignent. Garder ensemble
la définition, les règles et les pièges d'un même concept, sous un même titre.

## Chaque étape finit sur un critère d'achèvement

Le critère dit à l'agent que l'étape est finie. Flou (« quand c'est compris »), il invite à finir trop tôt ; exigeant
et vérifiable (« chaque modèle modifié est recensé »), il produit le travail de fond. Affûter le critère avant toute
autre parade.

## Les mots qui portent

Un mot que le modèle connaît déjà (*balle traçante*, *rouge*, *ablation*) ancre tout un comportement en un token.
Répété comme mot, jamais comme phrase, il remplace des paraphrases. Préférer un mot existant à un mot inventé.

**L'interdit attire ce qu'il interdit** : « ne fais pas X » met X dans le contexte. Écrire le comportement visé ; ne
garder l'interdit que comme garde-fou impossible à dire autrement, et toujours à côté du comportement visé.

## Tailler

- **Une source de vérité par sens.** Une règle écrite deux fois diverge ; ce dépôt l'a payé (J-08).
- **L'environnement est une source de vérité** : `package.json`, la configuration, l'arborescence, `--help`. Un
  document qui les recopie est un cache qui périme ; ne mettre en cache que ce qu'on ne trouve pas en regardant — la
  convention non écrite, la raison d'un choix, le piège qu'aucune configuration n'avoue. Le dépôt va plus loin : un
  compte se prend par une commande, jamais dans un document.
- **Chasser les lignes sans effet**, phrase par phrase : une consigne que le modèle suit déjà par défaut paie sa charge
  pour rien. Supprimer la phrase entière plutôt que la raboter.
