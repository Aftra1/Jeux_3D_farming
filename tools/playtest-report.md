# Rapport d'équilibrage (tools/playtest.mjs)

Parties jouées avec le moteur réel (`js/sim/simulation.js`), une décision par seconde de jeu,
jusqu'au palier 5 du Phare. Valeurs lues dans `js/balance.js` (non modifié).
« Attente » = temps entre deux achats, sans achat que le profil juge utile ; alerte au-delà de 5 min.

## Profils

- **prudent** (achète dès qu'il peut ; emplacements au hasard ; Sanctuaire seulement pour une missive) : Phare achevé en **4 min 25** ; 68 achats ; fin : 46 Bibliothèques (2 renforcées), 16 Observatoires, 1 Sanctuaires.
- **équilibré** (achète si cela rapproche l'objectif (en acceptant 15 % de détour) ; Bibliothèques en rangées ; Sanctuaire au meilleur endroit s'il en renforce 2) : Phare achevé en **7 min 19** ; 74 achats ; fin : 61 Bibliothèques (4 renforcées), 7 Observatoires, 1 Sanctuaires.
- **optimiseur** (achète seulement si cela rapproche l'objectif ; Bibliothèques en réseau autour des Sanctuaires (4 renforcées chacun)) : Phare achevé en **5 min 27** ; 55 achats ; fin : 35 Bibliothèques (4 renforcées), 14 Observatoires, 1 Sanctuaires.

## Temps pour atteindre chaque jalon (temps de jeu)

| Jalon | prudent | équilibré | optimiseur |
| --- | --- | --- | --- |
| Missive 1 · Rallumer une première lampe | 0 min 00 | 0 min 00 | 0 min 00 |
| Missive 2 · Trois lampes veillent | 0 min 30 | 0 min 30 | 0 min 30 |
| Missive 3 · Un regard vers le ciel | 1 min 20 | 0 min 50 | 0 min 50 |
| Missive 4 · Relever un cercle de pierres | 1 min 44 | 1 min 38 | 1 min 32 |
| Missive 5 · Deux lampes gardées | 1 min 44 | 1 min 38 | 1 min 32 |
| Missive 6 · Poser les fondations du phare | 2 min 08 | 2 min 24 | 2 min 16 |
| Missive 7 · Élever la base de pierre | 2 min 24 | 2 min 44 | 2 min 46 |
| Missive 8 · Monter le fût du phare | 2 min 52 | 3 min 36 | 3 min 24 |
| Missive 9 · Poser la galerie | 3 min 30 | 5 min 02 | 4 min 14 |
| Missive 10 · Allumer la lanterne | 4 min 24 | 7 min 18 | 5 min 26 |
| Premier Observatoire | 1 min 20 | 0 min 50 | 0 min 50 |
| Premier Sanctuaire | 1 min 44 | 1 min 38 | 1 min 32 |
| Phare palier 1 | 2 min 08 | 2 min 24 | 2 min 16 |
| Phare palier 2 | 2 min 24 | 2 min 44 | 2 min 46 |
| Phare palier 3 | 2 min 52 | 3 min 36 | 3 min 24 |
| Phare palier 4 | 3 min 30 | 5 min 02 | 4 min 14 |
| Phare palier 5 | 4 min 24 | 7 min 18 | 5 min 26 |

## Plus longues attentes (3 par profil)

| Profil | Attente | Période | Achat suivant | Ressource limitante | Alerte |
| --- | --- | --- | --- | --- | --- |
| prudent | 0 min 54 | 3 min 30 → 4 min 24 | Phare palier 5 | Savoirs (25.60/s) |  |
| prudent | 0 min 38 | 2 min 52 → 3 min 30 | Phare palier 4 | Savoirs (23.20/s) |  |
| prudent | 0 min 28 | 2 min 24 → 2 min 52 | Phare palier 3 | Savoirs (20.80/s) |  |
| équilibré | 2 min 16 | 5 min 02 → 7 min 18 | Phare palier 5 | Présages (1.75/s) |  |
| équilibré | 1 min 26 | 3 min 36 → 5 min 02 | Phare palier 4 | Présages (1.75/s) |  |
| équilibré | 0 min 52 | 2 min 44 → 3 min 36 | Phare palier 3 | Présages (1.75/s) |  |
| optimiseur | 1 min 10 | 4 min 16 → 5 min 26 | Phare palier 5 | Savoirs (20.30/s) |  |
| optimiseur | 0 min 46 | 3 min 28 → 4 min 14 | Phare palier 4 | Présages (3.00/s) |  |
| optimiseur | 0 min 30 | 2 min 54 → 3 min 24 | Phare palier 3 | Savoirs (18.40/s) |  |

## Durée totale

Partie complète (palier 5 du Phare) : de **4 min 25** à **7 min 19** de jeu actif
selon le profil. Joueur simulé idéal (décision chaque seconde) : un vrai joueur sera plus lent.

## Alertes

- Aucune attente de plus de 5 minutes.

## Propositions d'ajustement (non appliquées)

1. Aucune attente de plus de 5 minutes : aucun ajustement nécessaire.
