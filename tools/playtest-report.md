# Rapport d'équilibrage (tools/playtest.mjs)

Parties jouées avec le moteur réel (`js/sim/simulation.js`), une décision par seconde de jeu,
jusqu'au palier 5 du Phare. Valeurs lues dans `js/balance.js` (non modifié). Les profils achètent aussi des améliorations (niveaux 1 à 3).
« Attente » = temps sans aucun achat possible ; alerte au-delà de 5 min. « Pause » = temps entre deux
achats du profil (il peut épargner alors qu'un achat est possible), à titre indicatif.

## Profils

- **prudent** (achète dès qu'il peut ; emplacements au hasard ; Sanctuaire seulement pour une missive ; une fois sur trois, améliore plutôt que de bâtir) : Phare achevé en **1 h 53** ; 102 achats ; fin : 42 Bibliothèques (2 renforcées), 14 Observatoires, 3 Sanctuaires.
- **équilibré** (achète si cela rapproche l'objectif (en acceptant 15 % de détour) ; Bibliothèques en rangées ; Sanctuaire au meilleur endroit s'il en renforce 2 ; rallie chaque îlot dès qu'il peut ; améliore quand cela rapproche l'objectif aussi bien qu'une construction) : Phare achevé en **1 h 02** ✓ (cible 45–75 min) ; 113 achats ; fin : 31 Bibliothèques (7 renforcées), 12 Observatoires, 3 Sanctuaires.
- **équilibré + visiteurs** (équilibré, et attrape chaque Visiteur du lac 5 s après son apparition (intervalles et cadeaux de balance.js)) : Phare achevé en **56 min 59** ; 118 achats ; fin : 32 Bibliothèques (7 renforcées), 13 Observatoires, 3 Sanctuaires.
- **optimiseur** (achète seulement si cela rapproche l'objectif ; Bibliothèques en réseau autour des Sanctuaires (4 renforcées chacun) ; améliore dès que cela rapproche l'objectif) : Phare achevé en **59 min 16** ; 97 achats ; fin : 31 Bibliothèques (4 renforcées), 13 Observatoires, 1 Sanctuaires.

## Temps pour atteindre chaque jalon (temps de jeu)

| Jalon | prudent | équilibré | équilibré + visiteurs | optimiseur |
| --- | --- | --- | --- | --- |
| Missive 1 · Rallumer une première lampe | 0 min 00 | 0 min 00 | 0 min 00 | 0 min 00 |
| Missive 2 · Trois lampes veillent | 0 min 32 | 0 min 32 | 0 min 32 | 0 min 32 |
| Missive 3 · Un regard vers le ciel | 6 min 20 | 3 min 20 | 3 min 00 | 3 min 06 |
| Missive 4 · Relever un cercle de pierres | 14 min 32 | 9 min 10 | 8 min 40 | 8 min 46 |
| Missive 5 · Deux lampes gardées | 42 min 14 | 9 min 10 | 8 min 40 | 8 min 46 |
| Missive 6 · Poser les fondations du phare | 43 min 40 | 14 min 40 | 14 min 00 | 14 min 46 |
| Missive 7 · Élever la base de pierre | 52 min 10 | 21 min 28 | 20 min 12 | 21 min 32 |
| Missive 8 · Monter le fût du phare | 1 h 12 | 31 min 32 | 30 min 42 | 32 min 30 |
| Missive 9 · Poser la galerie | 1 h 33 | 49 min 38 | 45 min 28 | 46 min 48 |
| Missive 10 · Allumer la lanterne | 1 h 53 | 1 h 02 | 56 min 58 | 59 min 15 |
| Premier Observatoire | 6 min 20 | 3 min 20 | 3 min 00 | 3 min 06 |
| Premier Sanctuaire | 14 min 32 | 9 min 10 | 8 min 40 | 8 min 46 |
| Phare palier 1 | 43 min 40 | 14 min 40 | 14 min 00 | 14 min 46 |
| Phare palier 2 | 52 min 10 | 21 min 28 | 20 min 12 | 21 min 32 |
| Phare palier 3 | 1 h 12 | 31 min 32 | 30 min 42 | 32 min 30 |
| Phare palier 4 | 1 h 33 | 49 min 38 | 45 min 28 | 46 min 48 |
| Phare palier 5 | 1 h 53 | 1 h 02 | 56 min 58 | 59 min 15 |

## Plus longues attentes sans achat possible (3 par profil)

| Profil | Attente | Période | Premier achat possible | Ressource limitante | Alerte |
| --- | --- | --- | --- | --- | --- |
| prudent | 1 min 21 | 13 min 07 → 14 min 28 | Amélioration (library) | Savoirs (11.00/s) |  |
| prudent | 1 min 19 | 14 min 33 → 15 min 52 | Amélioration (library) | Savoirs (11.50/s) |  |
| prudent | 1 min 15 | 24 min 27 → 25 min 42 | Amélioration (library) | Savoirs (12.00/s) |  |
| équilibré | 1 min 05 | 12 min 35 → 13 min 40 | Observatoire | Présages (0.75/s) |  |
| équilibré | 1 min 05 | 16 min 19 → 17 min 24 | Amélioration (library) | Présages (1.00/s) |  |
| équilibré | 1 min 05 | 17 min 25 → 18 min 30 | Amélioration (library) | Présages (1.00/s) |  |
| équilibré + visiteurs | 1 min 07 | 12 min 17 → 13 min 24 | Bibliothèque | Savoirs (11.50/s) |  |
| équilibré + visiteurs | 1 min 03 | 15 min 47 → 16 min 50 | Amélioration (library) | Présages (1.00/s) |  |
| équilibré + visiteurs | 0 min 59 | 17 min 31 → 18 min 30 | Amélioration (library) | Savoirs (15.05/s) |  |
| optimiseur | 1 min 01 | 16 min 09 → 17 min 10 | Amélioration (library) | Présages (1.00/s) |  |
| optimiseur | 0 min 59 | 12 min 43 → 13 min 42 | Observatoire | Présages (0.75/s) |  |
| optimiseur | 0 min 59 | 17 min 11 → 18 min 10 | Amélioration (library) | Présages (1.00/s) |  |

## Plus longue pause entre deux achats (le profil épargne alors qu'un achat est possible)

| Profil | Pause | Période | Achat suivant | Ressource limitante |
| --- | --- | --- | --- | --- |
| prudent | 6 min 22 | 1 h 46 → 1 h 53 | Phare palier 5 | Savoirs (30.10/s) |
| équilibré | 4 min 36 | 57 min 36 → 1 h 02 | Phare palier 5 | Savoirs (41.57/s) |
| équilibré + visiteurs | 4 min 38 | 52 min 20 → 56 min 58 | Phare palier 5 | Savoirs (40.90/s) |
| optimiseur | 4 min 55 | 54 min 20 → 59 min 15 | Phare palier 5 | Présages (2.75/s) |

## Durée totale

Partie complète (palier 5 du Phare) : de **56 min 59** à **1 h 53** de jeu actif
selon le profil. Joueur simulé idéal (décision chaque seconde) : un vrai joueur sera plus lent.

## Constructions et améliorations choisies

Une « construction » est une pose de bâtiment ; une « amélioration » un niveau acheté (Phare et îlots exclus).
Part d'améliorations = améliorations / (constructions + améliorations).

| Profil | Chapitre | Constructions | Améliorations | Part d'améliorations | Améliorations par type |
| --- | --- | --- | --- | --- | --- |
| prudent | I | 58 | 11 | 16 % | Bibliothèque 11 |
| prudent | II | 5 | 24 | 83 % | Bibliothèque 24 |
| équilibré | I | 42 | 39 | 48 % | Bibliothèque 31, Observatoire 8 |
| équilibré | II | 8 | 17 | 68 % | Observatoire 14, Bibliothèque 2, Embarcadère 1 |
| équilibré + visiteurs | I | 43 | 40 | 48 % | Bibliothèque 31, Observatoire 9 |
| équilibré + visiteurs | II | 10 | 18 | 64 % | Bibliothèque 4, Observatoire 14 |
| optimiseur | I | 42 | 37 | 47 % | Bibliothèque 31, Observatoire 6 |
| optimiseur | II | 8 | 6 | 43 % | Bibliothèque 6 |

## Chapitre II (Embarcadères et Reliques, à partir de la partie terminée)

- **prudent** : chapitre II en **35 min 03** ; 3 Embarcadères ; aucune attente > 5 min.
- **équilibré** : chapitre II en **33 min 34** ✓ (cible 30–45 min) ; 3 Embarcadères ; 3 îlots ralliés (fin = dernière missive et 3 îlots) ; aucune attente > 5 min.
- **équilibré + visiteurs** : chapitre II en **33 min 19** ; 4 Embarcadères ; 3 îlots ralliés (fin = dernière missive et 3 îlots) ; aucune attente > 5 min.
- **optimiseur** : chapitre II en **32 min 08** ; 4 Embarcadères ; aucune attente > 5 min.

| Jalon (depuis la fin) | prudent | équilibré | équilibré + visiteurs | optimiseur |
| --- | --- | --- | --- | --- |
| Missive 11 · Rouvrir un embarcadère | +3 min 03 | +3 min 25 | +3 min 17 | +3 min 24 |
| Missive 12 · Remonter des Reliques | +4 min 03 | +4 min 25 | +4 min 17 | +4 min 24 |
| Missive 13 · Un second embarcadère | +8 min 19 | +8 min 47 | +8 min 21 | +8 min 28 |
| Missive 14 · Rendre les noms du registre | +15 min 43 | +16 min 11 | +15 min 53 | +16 min 00 |
| Missive 15 · Sous la lueur | +35 min 03 | +33 min 34 | +33 min 19 | +32 min 08 |
| Embarcadère 1 | +3 min 03 | +3 min 25 | +3 min 17 | +3 min 24 |
| Embarcadère 2 | +8 min 19 | +8 min 47 | +8 min 21 | +8 min 28 |
| Embarcadère 3 | +21 min 35 | +16 min 34 | +16 min 12 | +16 min 32 |
| Embarcadère 4 | — | — | +33 min 07 | +27 min 48 |
| Îlot 1 rallié | — | +10 min 11 | +9 min 53 | — |
| Îlot 2 rallié | — | +18 min 22 | +18 min 00 | — |
| Îlot 3 rallié | — | +28 min 59 | +28 min 41 | — |

Plus longues attentes sans achat possible pendant le chapitre II :

| Profil | Attente | Période | Premier achat possible | Ressource limitante | Alerte |
| --- | --- | --- | --- | --- | --- |
| prudent | 0 min 27 | +0 min 00 → +0 min 27 | Amélioration (library) | Savoirs (32.75/s) |  |
| prudent | 0 min 27 | +3 min 04 → +3 min 31 | Amélioration (library) | Savoirs (32.75/s) |  |
| prudent | 0 min 27 | +8 min 20 → +8 min 47 | Amélioration (library) | Savoirs (34.25/s) |  |
| équilibré | 0 min 49 | +4 min 32 → +5 min 21 | Sanctuaire | Présages (3.08/s) |  |
| équilibré | 0 min 49 | +21 min 44 → +22 min 33 | Amélioration (observatory) | Présages (3.58/s) |  |
| équilibré | 0 min 49 | +24 min 10 → +24 min 59 | Amélioration (observatory) | Présages (3.83/s) |  |
| équilibré + visiteurs | 0 min 47 | +18 min 12 → +18 min 59 | Amélioration (observatory) | Présages (3.58/s) |  |
| équilibré + visiteurs | 0 min 47 | +23 min 40 → +24 min 27 | Amélioration (observatory) | Savoirs (45.67/s) |  |
| équilibré + visiteurs | 0 min 47 | +24 min 28 → +25 min 15 | Amélioration (observatory) | Savoirs (45.50/s) |  |
| optimiseur | 0 min 21 | +0 min 00 → +0 min 21 | Amélioration (observatory) | Présages (2.75/s) |  |
| optimiseur | 0 min 21 | +0 min 41 → +1 min 02 | Amélioration (observatory) | Présages (3.00/s) |  |
| optimiseur | 0 min 21 | +17 min 11 → +17 min 32 | Amélioration (observatory) | Présages (3.00/s) |  |

## Effet des Visiteurs du lac

Équilibré : 1 h 02 sans visiteurs, 56 min 59 en les attrapant tous (30 visiteurs : 16756 Savoirs, 20 Présages) → **−8.4 %** (limite : −10 %) ✓.

## Alertes

- Aucune attente de plus de 5 minutes.

## Propositions d'ajustement (non appliquées)

1. Aucune attente de plus de 5 minutes : aucun ajustement nécessaire.
