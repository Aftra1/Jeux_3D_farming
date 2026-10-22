# Rapport d'équilibrage (tools/playtest.mjs)

Parties jouées avec le moteur réel (`js/sim/simulation.js`), une décision par seconde de jeu,
jusqu'au palier 5 du Phare. Valeurs lues dans `js/balance.js` (non modifié).
« Attente » = temps sans aucun achat possible ; alerte au-delà de 5 min. « Pause » = temps entre deux
achats du profil (il peut épargner alors qu'un achat est possible), à titre indicatif.

## Profils

- **prudent** (achète dès qu'il peut ; emplacements au hasard ; Sanctuaire seulement pour une missive) : Phare achevé en **2 h 05** ; 67 achats ; fin : 42 Bibliothèques (2 renforcées), 14 Observatoires, 3 Sanctuaires.
- **équilibré** (achète si cela rapproche l'objectif (en acceptant 15 % de détour) ; Bibliothèques en rangées ; Sanctuaire au meilleur endroit s'il en renforce 2 ; rallie chaque îlot dès qu'il peut) : Phare achevé en **56 min 01** ; 55 achats ; fin : 31 Bibliothèques (7 renforcées), 10 Observatoires, 3 Sanctuaires.
- **équilibré + visiteurs** (équilibré, et attrape chaque Visiteur du lac 5 s après son apparition (intervalles et cadeaux de balance.js)) : Phare achevé en **51 min 03** ; 55 achats ; fin : 32 Bibliothèques (6 renforcées), 10 Observatoires, 2 Sanctuaires.
- **optimiseur** (achète seulement si cela rapproche l'objectif ; Bibliothèques en réseau autour des Sanctuaires (4 renforcées chacun)) : Phare achevé en **52 min 25** ; 49 achats ; fin : 30 Bibliothèques (4 renforcées), 10 Observatoires, 1 Sanctuaires.

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

## Chapitre II (Embarcadères et Reliques, à partir de la partie terminée)

- **prudent** : chapitre II en **37 min 59** ; 3 Embarcadères ; aucune attente > 5 min.
- **équilibré** : chapitre II en **37 min 17** ✓ (cible 30–45 min) ; 3 Embarcadères ; 3 îlots ralliés (fin = dernière missive et 3 îlots) ; aucune attente > 5 min.
- **équilibré + visiteurs** : chapitre II en **36 min 59** ; 3 Embarcadères ; 3 îlots ralliés (fin = dernière missive et 3 îlots) ; aucune attente > 5 min.
- **optimiseur** : chapitre II en **37 min 39** ; 3 Embarcadères ; aucune attente > 5 min.

| Jalon (depuis la fin) | prudent | équilibré | équilibré + visiteurs | optimiseur |
| --- | --- | --- | --- | --- |
| Missive 11 · Rouvrir un embarcadère | +4 min 03 | +4 min 17 | +4 min 25 | +4 min 27 |
| Missive 12 · Remonter des Reliques | +5 min 03 | +5 min 17 | +5 min 25 | +5 min 27 |
| Missive 13 · Un second embarcadère | +10 min 11 | +11 min 57 | +11 min 59 | +11 min 55 |
| Missive 14 · Rendre les noms du registre | +17 min 11 | +18 min 09 | +18 min 13 | +18 min 15 |
| Missive 15 · Sous la lueur | +37 min 59 | +37 min 17 | +36 min 59 | +37 min 39 |
| Embarcadère 1 | +4 min 03 | +4 min 17 | +4 min 25 | +4 min 27 |
| Embarcadère 2 | +10 min 11 | +11 min 57 | +11 min 59 | +11 min 55 |
| Embarcadère 3 | +27 min 25 | +23 min 23 | +22 min 19 | +24 min 17 |
| Embarcadère 4 | — | — | — | — |
| Îlot 1 rallié | — | +12 min 09 | +12 min 13 | — |
| Îlot 2 rallié | — | +21 min 09 | +21 min 13 | — |
| Îlot 3 rallié | — | +32 min 35 | +32 min 19 | — |

Plus longues attentes sans achat possible pendant le chapitre II :

| Profil | Attente | Période | Premier achat possible | Ressource limitante | Alerte |
| --- | --- | --- | --- | --- | --- |
| prudent | 2 min 11 | +4 min 04 → +6 min 15 | Sanctuaire | Savoirs (24.50/s) |  |
| prudent | 2 min 09 | +0 min 00 → +2 min 09 | Sanctuaire | Savoirs (24.50/s) |  |
| prudent | 2 min 09 | +10 min 12 → +12 min 21 | Sanctuaire | Savoirs (24.50/s) |  |
| équilibré | 1 min 35 | +5 min 44 → +7 min 19 | Observatoire | Savoirs (24.00/s) |  |
| équilibré | 1 min 25 | +0 min 00 → +1 min 25 | Bibliothèque | Savoirs (23.25/s) |  |
| équilibré | 1 min 25 | +4 min 18 → +5 min 43 | Bibliothèque | Présages (2.00/s) |  |
| équilibré + visiteurs | 1 min 33 | +4 min 26 → +5 min 59 | Observatoire | Présages (2.00/s) |  |
| équilibré + visiteurs | 1 min 27 | +0 min 38 → +2 min 05 | Sanctuaire | Savoirs (24.00/s) |  |
| équilibré + visiteurs | 1 min 19 | +6 min 00 → +7 min 19 | Sanctuaire | Savoirs (23.50/s) |  |
| optimiseur | 1 min 11 | +11 min 56 → +13 min 07 | Sanctuaire | Présages (1.75/s) |  |
| optimiseur | 1 min 09 | +24 min 18 → +25 min 27 | Sanctuaire | Présages (1.75/s) |  |
| optimiseur | 1 min 05 | +4 min 28 → +5 min 33 | Sanctuaire | Présages (2.00/s) |  |

## Effet des Visiteurs du lac

Équilibré : 56 min 01 sans visiteurs, 51 min 03 en les attrapant tous (29 visiteurs : 10846 Savoirs, 14 Présages) → **−8.9 %** (limite : −10 %) ✓.

## Alertes

- Aucune attente de plus de 5 minutes.

## Propositions d'ajustement (non appliquées)

1. Aucune attente de plus de 5 minutes : aucun ajustement nécessaire.
