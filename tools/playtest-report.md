# Rapport d'équilibrage (tools/playtest.mjs)

Parties jouées avec le moteur réel (`js/sim/simulation.js`), une décision par seconde de jeu,
jusqu'au palier 5 du Phare. Valeurs lues dans `js/balance.js` (non modifié). Les profils achètent aussi des améliorations (niveaux 1 à 3).
« Attente » = temps sans aucun achat possible ; alerte au-delà de 5 min. « Pause » = temps entre deux
achats du profil (il peut épargner alors qu'un achat est possible), à titre indicatif.

## Profils

- **prudent** (achète dès qu'il peut ; emplacements au hasard ; Sanctuaire seulement pour une missive ; une fois sur trois, améliore plutôt que de bâtir) : Phare achevé en **1 h 51** ; 110 achats ; fin : 42 Bibliothèques (2 renforcées), 14 Observatoires, 2 Sanctuaires.
- **équilibré** (achète si cela rapproche l'objectif (en acceptant 15 % de détour) ; Bibliothèques en rangées ; Sanctuaire au meilleur endroit s'il en renforce 2 ; rallie chaque îlot dès qu'il peut ; améliore quand cela rapproche l'objectif aussi bien qu'une construction) : Phare achevé en **1 h 03** ✓ (cible 45–75 min) ; 135 achats ; fin : 32 Bibliothèques (7 renforcées), 10 Observatoires, 3 Sanctuaires.
- **équilibré + visiteurs** (équilibré, et attrape chaque Visiteur du lac 5 s après son apparition (intervalles et cadeaux de balance.js)) : Phare achevé en **1 h 01** ; 144 achats ; fin : 32 Bibliothèques (8 renforcées), 10 Observatoires, 3 Sanctuaires.
- **optimiseur** (achète seulement si cela rapproche l'objectif ; Bibliothèques en réseau autour des Sanctuaires (4 renforcées chacun) ; améliore dès que cela rapproche l'objectif) : Phare achevé en **56 min 58** ; 104 achats ; fin : 33 Bibliothèques (4 renforcées), 12 Observatoires, 1 Sanctuaires.

## Temps pour atteindre chaque jalon (temps de jeu)

| Jalon | prudent | équilibré | équilibré + visiteurs | optimiseur |
| --- | --- | --- | --- | --- |
| Missive 1 · Rallumer une première lampe | 0 min 00 | 0 min 00 | 0 min 00 | 0 min 00 |
| Missive 2 · Trois lampes veillent | 0 min 32 | 0 min 32 | 0 min 32 | 0 min 32 |
| Missive 3 · Un regard vers le ciel | 6 min 20 | 3 min 20 | 3 min 00 | 3 min 06 |
| Missive 4 · Relever un cercle de pierres | 14 min 32 | 9 min 10 | 8 min 40 | 8 min 46 |
| Missive 5 · Deux lampes gardées | 42 min 10 | 9 min 10 | 8 min 40 | 8 min 46 |
| Missive 6 · Poser les fondations du phare | 43 min 30 | 14 min 40 | 14 min 00 | 15 min 36 |
| Missive 7 · Élever la base de pierre | 51 min 26 | 21 min 28 | 20 min 12 | 22 min 28 |
| Missive 8 · Monter le fût du phare | 1 h 09 | 32 min 42 | 30 min 16 | 31 min 50 |
| Missive 9 · Poser la galerie | 1 h 32 | 48 min 04 | 44 min 54 | 44 min 32 |
| Missive 10 · Allumer la lanterne | 1 h 51 | 1 h 03 | 1 h 01 | 56 min 57 |
| Premier Observatoire | 6 min 20 | 3 min 20 | 3 min 00 | 3 min 06 |
| Premier Sanctuaire | 14 min 32 | 9 min 10 | 8 min 40 | 8 min 46 |
| Phare palier 1 | 43 min 30 | 14 min 40 | 14 min 00 | 15 min 36 |
| Phare palier 2 | 51 min 26 | 21 min 28 | 20 min 12 | 22 min 28 |
| Phare palier 3 | 1 h 09 | 32 min 42 | 30 min 16 | 31 min 50 |
| Phare palier 4 | 1 h 32 | 48 min 04 | 44 min 54 | 44 min 32 |
| Phare palier 5 | 1 h 51 | 1 h 03 | 1 h 01 | 56 min 57 |

## Plus longues attentes sans achat possible (3 par profil)

| Profil | Attente | Période | Premier achat possible | Ressource limitante | Alerte |
| --- | --- | --- | --- | --- | --- |
| prudent | 1 min 21 | 13 min 07 → 14 min 28 | Amélioration (library) | Savoirs (11.00/s) |  |
| prudent | 1 min 11 | 10 min 47 → 11 min 58 | Bibliothèque | Savoirs (11.00/s) |  |
| prudent | 1 min 07 | 11 min 59 → 13 min 06 | Observatoire | Savoirs (11.50/s) |  |
| équilibré | 0 min 49 | 7 min 45 → 8 min 34 | Bibliothèque | Savoirs (11.00/s) |  |
| équilibré | 0 min 45 | 9 min 11 → 9 min 56 | Observatoire | Présages (0.25/s) |  |
| équilibré | 0 min 43 | 7 min 01 → 7 min 44 | Bibliothèque | Présages (0.25/s) |  |
| équilibré + visiteurs | 0 min 47 | 7 min 05 → 7 min 52 | Observatoire | Présages (0.25/s) |  |
| équilibré + visiteurs | 0 min 43 | 6 min 21 → 7 min 04 | Bibliothèque | Présages (0.25/s) |  |
| équilibré + visiteurs | 0 min 34 | 8 min 41 → 9 min 15 | Observatoire | Présages (0.25/s) |  |
| optimiseur | 0 min 49 | 15 min 37 → 16 min 26 | Observatoire | Présages (0.75/s) |  |
| optimiseur | 0 min 45 | 11 min 31 → 12 min 16 | Scriptorium | Présages (0.50/s) |  |
| optimiseur | 0 min 45 | 12 min 21 → 13 min 06 | Scriptorium | Présages (0.75/s) |  |

## Plus longue pause entre deux achats (le profil épargne alors qu'un achat est possible)

| Profil | Pause | Période | Achat suivant | Ressource limitante |
| --- | --- | --- | --- | --- |
| prudent | 6 min 02 | 1 h 45 → 1 h 51 | Phare palier 5 | Savoirs (31.64/s) |
| équilibré | 3 min 58 | 59 min 16 → 1 h 03 | Phare palier 5 | Savoirs (48.44/s) |
| équilibré + visiteurs | 3 min 46 | 26 min 30 → 30 min 16 | Phare palier 3 | Savoirs (20.25/s) |
| optimiseur | 4 min 55 | 52 min 02 → 56 min 57 | Phare palier 5 | Présages (3.03/s) |

## Durée totale

Partie complète (palier 5 du Phare) : de **56 min 58** à **1 h 51** de jeu actif
selon le profil. Joueur simulé idéal (décision chaque seconde) : un vrai joueur sera plus lent.

## Constructions et améliorations choisies

Une « construction » est une pose de bâtiment ; une « amélioration » un niveau acheté (Phare et îlots exclus).
Part d'améliorations = améliorations / (constructions + améliorations).

| Profil | Chapitre | Constructions | Améliorations | Part d'améliorations | Améliorations par type |
| --- | --- | --- | --- | --- | --- |
| prudent | I | 59 | 13 | 18 % | Bibliothèque 13 |
| prudent | II | 5 | 29 | 85 % | Bibliothèque 29 |
| équilibré | I | 46 | 44 | 49 % | Bibliothèque 32, Observatoire 9, Cloche 2, Scriptorium 1 |
| équilibré | II | 6 | 32 | 84 % | Bibliothèque 20, Observatoire 11, Embarcadère 1 |
| équilibré + visiteurs | I | 46 | 50 | 52 % | Bibliothèque 32, Observatoire 15, Scriptorium 1, Cloche 2 |
| équilibré + visiteurs | II | 6 | 35 | 85 % | Observatoire 5, Bibliothèque 29, Embarcadère 1 |
| optimiseur | I | 44 | 35 | 44 % | Bibliothèque 30, Observatoire 5 |
| optimiseur | II | 10 | 11 | 52 % | Bibliothèque 10, Observatoire 1 |

## Scriptorium et Cloche (étape 7b)

La Cloche est sonnée par le joueur simulé dès qu'elle est prête (prudent : 90 s après). Le Scriptorium est posé là où il sert le plus
d'Observatoires pas encore servis. Les profils améliorent aussi les deux (voir le tableau précédent).

| Profil | Scriptoriums | Observatoires servis (fin) | Cloches | Producteurs à portée (par Cloche) | Sonneries I / II | Temps sous sonnerie |
| --- | --- | --- | --- | --- | --- | --- |
| prudent | 1 (niv. 1) | 0 / 14 | 1 (niv. 1) | 6 | 13 / 7 | 10 min 00 |
| équilibré | 1 (niv. 2) | 3 / 10 | 2 (niv. 2, 2) | 13, 13 | 19 / 31 | 25 min 00 |
| équilibré + visiteurs | 1 (niv. 2) | 6 / 10 | 2 (niv. 2, 2) | 17, 12 | 22 / 28 | 25 min 00 |
| optimiseur | 1 (niv. 1) | 3 / 12 | 2 (niv. 1, 1) | 11, 11 | 13 / 21 | 17 min 00 |

Effet sur la durée du profil équilibré :

- Chapitre I (équilibré) : **1 h 03** avec Scriptorium et Cloche, 1 h 02 sans (+1.7 %).
- Chapitre II (équilibré) : **32 min 45** avec, 33 min 34 sans (−2.4 %).

## Chapitre II (Embarcadères et Reliques, à partir de la partie terminée)

- **prudent** : chapitre II en **34 min 41** ; 3 Embarcadères ; aucune attente > 5 min.
- **équilibré** : chapitre II en **32 min 45** ✓ (cible 30–45 min) ; 3 Embarcadères ; 3 îlots ralliés (fin = dernière missive et 3 îlots) ; aucune attente > 5 min.
- **équilibré + visiteurs** : chapitre II en **31 min 21** ; 3 Embarcadères ; 3 îlots ralliés (fin = dernière missive et 3 îlots) ; aucune attente > 5 min.
- **optimiseur** : chapitre II en **31 min 46** ; 4 Embarcadères ; aucune attente > 5 min.

| Jalon (depuis la fin) | prudent | équilibré | équilibré + visiteurs | optimiseur |
| --- | --- | --- | --- | --- |
| Missive 11 · Rouvrir un embarcadère | +2 min 55 | +3 min 07 | +2 min 11 | +3 min 20 |
| Missive 12 · Remonter des Reliques | +3 min 55 | +4 min 07 | +3 min 11 | +4 min 20 |
| Missive 13 · Un second embarcadère | +7 min 57 | +7 min 42 | +6 min 21 | +8 min 24 |
| Missive 14 · Rendre les noms du registre | +15 min 31 | +15 min 30 | +14 min 09 | +15 min 56 |
| Missive 15 · Sous la lueur | +34 min 41 | +32 min 45 | +31 min 21 | +31 min 46 |
| Embarcadère 1 | +2 min 55 | +3 min 07 | +2 min 11 | +3 min 20 |
| Embarcadère 2 | +7 min 57 | +7 min 42 | +6 min 21 | +8 min 24 |
| Embarcadère 3 | +20 min 53 | +15 min 33 | +13 min 33 | +16 min 10 |
| Embarcadère 4 | — | — | — | +26 min 52 |
| Îlot 1 rallié | — | +9 min 30 | +8 min 21 | — |
| Îlot 2 rallié | — | +17 min 31 | +16 min 09 | — |
| Îlot 3 rallié | — | +28 min 09 | +26 min 45 | — |

Plus longues attentes sans achat possible pendant le chapitre II :

| Profil | Attente | Période | Premier achat possible | Ressource limitante | Alerte |
| --- | --- | --- | --- | --- | --- |
| prudent | 0 min 17 | +0 min 00 → +0 min 17 | Scriptorium | Savoirs (34.42/s) |  |
| prudent | 0 min 15 | +2 min 56 → +3 min 11 | Scriptorium | Savoirs (34.42/s) |  |
| prudent | 0 min 15 | +7 min 58 → +8 min 13 | Scriptorium | Savoirs (35.92/s) |  |
| équilibré | 0 min 15 | +7 min 43 → +7 min 58 | Scriptorium | Présages (3.14/s) |  |
| équilibré | 0 min 11 | +0 min 00 → +0 min 11 | Scriptorium | Présages (3.31/s) |  |
| équilibré | 0 min 11 | +1 min 18 → +1 min 29 | Scriptorium | Savoirs (53.99/s) |  |
| équilibré + visiteurs | 0 min 11 | +3 min 42 → +3 min 53 | Scriptorium | Savoirs (55.37/s) |  |
| équilibré + visiteurs | 0 min 11 | +6 min 54 → +7 min 05 | Scriptorium | Présages (4.03/s) |  |
| équilibré + visiteurs | 0 min 11 | +7 min 40 → +7 min 51 | Scriptorium | Présages (4.13/s) |  |
| optimiseur | 0 min 16 | +16 min 31 → +16 min 47 | Scriptorium | Présages (3.25/s) |  |
| optimiseur | 0 min 15 | +16 min 11 → +16 min 26 | Scriptorium | Présages (3.15/s) |  |
| optimiseur | 0 min 15 | +26 min 53 → +27 min 08 | Scriptorium | Présages (3.00/s) |  |

## Effet des Visiteurs du lac

Équilibré : 1 h 03 sans visiteurs, 1 h 01 en les attrapant tous (31 visiteurs : 18605 Savoirs, 20 Présages) → **−2.5 %** (limite : −10 %) ✓.

## Alertes

- Aucune attente de plus de 5 minutes.

## Propositions d'ajustement (non appliquées)

1. Aucune attente de plus de 5 minutes : aucun ajustement nécessaire.
