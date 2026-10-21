# Rapport d'équilibrage (tools/playtest.mjs)

Parties jouées avec le moteur réel (`js/sim/simulation.js`), une décision par seconde de jeu,
jusqu'au palier 5 du Phare. Valeurs lues dans `js/balance.js` (non modifié).
« Attente » = temps sans aucun achat possible ; alerte au-delà de 5 min. « Pause » = temps entre deux
achats du profil (il peut épargner alors qu'un achat est possible), à titre indicatif.

## Profils

- **prudent** (achète dès qu'il peut ; emplacements au hasard ; Sanctuaire seulement pour une missive) : Phare achevé en **2 h 05** ; 62 achats ; fin : 40 Bibliothèques (2 renforcées), 14 Observatoires, 3 Sanctuaires.
- **équilibré** (achète si cela rapproche l'objectif (en acceptant 15 % de détour) ; Bibliothèques en rangées ; Sanctuaire au meilleur endroit s'il en renforce 2) : Phare achevé en **56 min 01** ; 47 achats ; fin : 30 Bibliothèques (7 renforcées), 9 Observatoires, 3 Sanctuaires.
- **équilibré + visiteurs** (équilibré, et attrape chaque Visiteur du lac 5 s après son apparition (intervalles et cadeaux de balance.js)) : Phare achevé en **51 min 03** ; 47 achats ; fin : 31 Bibliothèques (5 renforcées), 9 Observatoires, 2 Sanctuaires.
- **optimiseur** (achète seulement si cela rapproche l'objectif ; Bibliothèques en réseau autour des Sanctuaires (4 renforcées chacun)) : Phare achevé en **52 min 25** ; 45 achats ; fin : 30 Bibliothèques (4 renforcées), 9 Observatoires, 1 Sanctuaires.

## Temps pour atteindre chaque jalon (temps de jeu)

| Jalon | prudent | équilibré | équilibré + visiteurs | optimiseur |
| --- | --- | --- | --- | --- |
| Missive 1 · Rallumer une première lampe | 0 min 00 | 0 min 00 | 0 min 00 | 0 min 00 |
| Missive 2 · Trois lampes veillent | 0 min 32 | 0 min 32 | 0 min 32 | 0 min 32 |
| Missive 3 · Un regard vers le ciel | 6 min 20 | 3 min 20 | 3 min 00 | 3 min 06 |
| Missive 4 · Relever un cercle de pierres | 14 min 32 | 9 min 10 | 8 min 40 | 8 min 46 |
| Missive 5 · Deux lampes gardées | 40 min 32 | 9 min 10 | 8 min 40 | 8 min 46 |
| Missive 6 · Poser les fondations du phare | 42 min 12 | 14 min 40 | 14 min 00 | 14 min 46 |
| Missive 7 · Élever la base de pierre | 51 min 04 | 20 min 42 | 19 min 20 | 20 min 42 |
| Missive 8 · Monter le fût du phare | 1 h 13 | 29 min 22 | 27 min 34 | 28 min 46 |
| Missive 9 · Poser la galerie | 1 h 39 | 39 min 40 | 38 min 10 | 39 min 22 |
| Missive 10 · Allumer la lanterne | 2 h 05 | 56 min 00 | 51 min 02 | 52 min 24 |
| Premier Observatoire | 6 min 20 | 3 min 20 | 3 min 00 | 3 min 06 |
| Premier Sanctuaire | 14 min 32 | 9 min 10 | 8 min 40 | 8 min 46 |
| Phare palier 1 | 42 min 12 | 14 min 40 | 14 min 00 | 14 min 46 |
| Phare palier 2 | 51 min 04 | 20 min 42 | 19 min 20 | 20 min 42 |
| Phare palier 3 | 1 h 13 | 29 min 22 | 27 min 34 | 28 min 46 |
| Phare palier 4 | 1 h 39 | 39 min 40 | 38 min 10 | 39 min 22 |
| Phare palier 5 | 2 h 05 | 56 min 00 | 51 min 02 | 52 min 24 |

## Plus longues attentes sans achat possible (3 par profil)

| Profil | Attente | Période | Premier achat possible | Ressource limitante | Alerte |
| --- | --- | --- | --- | --- | --- |
| prudent | 3 min 27 | 57 min 17 → 1 h 00 | Sanctuaire | Savoirs (15.50/s) |  |
| prudent | 3 min 23 | 1 h 04 → 1 h 07 | Sanctuaire | Savoirs (15.60/s) |  |
| prudent | 3 min 17 | 1 h 00 → 1 h 04 | Sanctuaire | Savoirs (16.10/s) |  |
| équilibré | 1 min 37 | 45 min 17 → 46 min 54 | Bibliothèque | Savoirs (20.00/s) |  |
| équilibré | 1 min 33 | 43 min 43 → 45 min 16 | Observatoire | Présages (2.00/s) |  |
| équilibré | 1 min 33 | 47 min 03 → 48 min 36 | Bibliothèque | Savoirs (21.40/s) |  |
| équilibré + visiteurs | 1 min 39 | 40 min 33 → 42 min 12 | Bibliothèque | Présages (2.25/s) |  |
| équilibré + visiteurs | 1 min 33 | 31 min 35 → 33 min 08 | Bibliothèque | Savoirs (17.45/s) |  |
| équilibré + visiteurs | 1 min 25 | 23 min 11 → 24 min 36 | Observatoire | Savoirs (15.60/s) |  |
| optimiseur | 1 min 21 | 23 min 41 → 25 min 02 | Observatoire | Présages (1.50/s) |  |
| optimiseur | 1 min 19 | 30 min 55 → 32 min 14 | Sanctuaire | Présages (1.75/s) |  |
| optimiseur | 1 min 17 | 29 min 37 → 30 min 54 | Bibliothèque | Présages (1.75/s) |  |

## Plus longue pause entre deux achats (le profil épargne alors qu'un achat est possible)

| Profil | Pause | Période | Achat suivant | Ressource limitante |
| --- | --- | --- | --- | --- |
| prudent | 8 min 34 | 1 h 57 → 2 h 05 | Phare palier 5 | Savoirs (22.40/s) |
| équilibré | 8 min 58 | 47 min 02 → 56 min 00 | Phare palier 5 | Savoirs (21.40/s) |
| équilibré + visiteurs | 8 min 50 | 42 min 12 → 51 min 02 | Phare palier 5 | Savoirs (20.70/s) |
| optimiseur | 10 min 16 | 42 min 08 → 52 min 24 | Phare palier 5 | Présages (2.25/s) |

## Durée totale

Partie complète (palier 5 du Phare) : de **51 min 03** à **2 h 05** de jeu actif
selon le profil. Joueur simulé idéal (décision chaque seconde) : un vrai joueur sera plus lent.

## Effet des Visiteurs du lac

Équilibré : 56 min 01 sans visiteurs, 51 min 03 en les attrapant tous (17 visiteurs : 5746 Savoirs, 3 Présages) → **−8.9 %** (limite : −10 %) ✓.

## Alertes

- Aucune attente de plus de 5 minutes.

## Propositions d'ajustement (non appliquées)

1. Aucune attente de plus de 5 minutes : aucun ajustement nécessaire.
