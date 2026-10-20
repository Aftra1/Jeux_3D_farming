# CLAUDE.md — La Société du Lac

## Règles d'économie
- Rapport final de 15 lignes maximum : ce qui est fait, choix à valider, comment tester. Ne pas reformuler ma demande ni détailler chaque fichier.
- Tests : lancer `node tests/run.mjs` à chaque étape. Tests navigateur et captures uniquement pour une nouveauté visuelle de l'étape, pas de rejeu complet des étapes précédentes.
- Pas de test de sabotage sauf si le moteur de simulation change.
- Lire seulement les fichiers nécessaires, modifier par remplacements ciblés plutôt que réécrire des fichiers entiers.
- Ne pas narrer chaque action pendant le travail.
- Garder CLAUDE.md concis : condenser le journal en une ligne par étape.
- Si une étape demande une refonte importante non prévue, me demander avant.

Jeu de gestion 3D dans le navigateur (Three.js), déployé sur GitHub Pages.
Le joueur gère les installations d'une société secrète cachée dans un lieu isolé
(manoir, bibliothèque, village au bord d'un lac). Les secrets se révèlent peu à peu.
**Émotion visée : sérénité, détente, mystère feutré. Jamais anxiogène**
(pas de minuteur stressant, pas d'échec brutal, pas de clignotement agressif).

## Méthode de travail
- On avance par **petites étapes**. Après chaque étape : résumé, comment tester,
  puis **attendre la validation** de l'utilisateur. Ne jamais enchaîner deux étapes.
- Mettre ce fichier à jour à chaque étape (architecture, décisions, journal).

## Contraintes techniques
- HTML + CSS + JavaScript (modules ES natifs). **Aucune étape de build.**
- Three.js **0.169.0** chargé depuis jsDelivr via une `importmap` (`index.html`).
  Ne pas utiliser de version flottante.
- Tous les chemins sont relatifs (compatibles GitHub Pages en sous-dossier).
  `.nojekyll` est présent pour servir les fichiers tels quels.
- Contrôles souris **et** tactiles dès le départ (Pointer Events uniquement).
- Sauvegarde : `localStorage` (module `js/save/`).

## Tests automatisés
```
node tests/run.mjs
```
Tests sans navigateur (simulation, hors ligne, déblocage, migration et validation des
sauvegardes). À lancer avant chaque commit touchant `js/sim/`, `js/save/` ou `balance.js`.

## Lancer en local
Les modules ES exigent un serveur HTTP (pas `file://`) :
```
npx http-server -p 8080     # ou : python3 -m http.server 8080
```
puis ouvrir http://localhost:8080. Sur téléphone : même réseau, IP de la machine.

## Architecture
```
index.html            importmap Three.js, conteneur #game, interface #ui (HTML statique)
css/style.css         plein écran, canvas pixelated, panneaux parchemin, police pixel
assets/fonts/         Pixelify Sans 400/700 (woff2, OFL — hébergée localement)
js/config.js          PALETTE, GRID, RENDER, SAVE, CAMERA — constantes visuelles/techniques
js/balance.js         BALANCE — TOUTES les valeurs de gameplay (tick, hors ligne,
                      départ des ressources, coûts, déblocages, productions)
js/resources.js       RESOURCE_TYPES — registre des ressources (noms, icône, effet)
tests/run.mjs         tests Node (node:test), sans dépendance au rendu
js/main.js            assemblage, routage des entrées, boucle ; window.__game pour déboguer
js/render/
  renderer.js         PixelRenderer : cible basse résolution + passe contour
  textures.js         textures pixel procédurales (RNG à graine), rampe toon 3 niveaux
  lighting.js         soleil doré rasant + hémisphère bleuté, ombres nettes
  camera.js           IsoCamera : orthographique, bornée, alignée au pixel
  effects.js          Sparks : symboles de production (variantes 'star', 'omen')
js/grid/
  grid.js             Grid : données 16x16 + socle 3D ; tileAtWorld, tileCenter
  highlight.js        TileHighlight : cadre (1 case ou emprise w x d), ambre ou rouge refus
js/buildings/
  catalog.js          BUILDING_TYPES / BUILDING_ORDER : registre (noms, emprise, icône, modèle)
  models.js           modèles low-poly (buildLibrary, buildObservatory), matériaux
                      partagés, ouvertures allumées/éteintes (setLightOn)
  buildings.js        BuildingManager : registre des bâtiments posés + vues 3D
  placement.js        Placement : mode placement, aperçu fantôme, validation
js/input/
  controls.js         Controls : glisser, molette, pincer, survol, tap, visée tactile
js/sim/
  simulation.js       Simulation : pas fixe, ressources, total cumulé (`earned`), économie, production
js/story/
  fragments.js        FRAGMENTS — textes et paliers du Carnet (fichier de données à éditer)
  journal.js          Journal : fragments débloqués / non lus (sans DOM ni Three.js)
js/save/
  save.js             SaveStore (localStorage protégé), parseSave (validation +
                      migrations), SaveManager (load / save / wipe)
js/ui/
  ui.js               UI : compteurs et outils générés depuis les registres, Annuler,
                      bulle d'aide, panneau de retour, confirmation de nouvelle partie
  icons.js            icônes SVG pixel (ressources, bâtiments, cadenas)
```

### Flux des entrées (main.js)
`Controls` ne connaît que des gestes ; `main.js` les route selon le mode :
- **Mode normal** : survol/tap → `highlight.set(case)`.
- **Mode placement** (`placement.active`) : survol souris ou glisser 1 doigt
  (`onAim`) → `placement.aim(point)` ; clic/tap → `placement.tryPlace(point)` ;
  clic droit (tap bouton 2), Échap, bouton « Annuler » ou re-clic sur l'outil →
  `placement.cancel()`.
- `Placement` ne pose jamais directement : il passe par `rules` = la Simulation
  (`canPlace` = emplacement libre + moyens suffisants ; `placeBuilding` = pose atomique
  avec paiement).
- `refreshUI()` (main.js) construit l'état complet (ressources, offres avec coût et
  disponibilité, mode placement) et appelle `ui.render(state)`. Déclenché par
  `Placement.onChange` et par `sim.subscribe` (gain/dépense de ressources) ; ce
  dernier appelle aussi `placement.refresh()` pour que l'aperçu passe de rouge à
  ambre dès que le joueur a assez de Savoirs.
L'UI n'importe rien de la 3D : elle émet `onSelect(type)` / `onCancel()`.

### Ajouter un type de bâtiment (registres, aucun cas codé en dur)
1. `js/buildings/catalog.js` : entrée `BUILDING_TYPES[id]` (name, plural, one, many,
   verb, footprint, height, icon, build) — l'ordre des clés = ordre de la barre d'outils ;
2. `js/balance.js` : `BALANCE.buildings[id]` (cost, firstFree, unlock, production) ;
3. `js/buildings/models.js` : sa fabrique ; `js/ui/icons.js` : son icône ;
4. si nouvelle ressource : `js/resources.js` + `BALANCE.resources` + icône (+ variante
   d'effet), et une migration de sauvegarde ajoutant la ressource.
Barre d'outils, verrouillage, placement, simulation, sauvegarde, rendu des effets et
panneau hors ligne lisent ces registres.

### Données des bâtiments (buildings.js)
- `buildings.records` : tableau, dans l'ordre de pose, d'enregistrements
  **purs et sérialisables** : `{ uid, type, x, z, rotation }`. `(x, z)` = coin
  −x/−z de l'emprise ; `rotation` en quarts de tour (toujours 0 pour l'instant).
- `buildings.byUid` : index uid → enregistrement ; `buildings.at(x, z)` via la grille.
- Occupation : chaque case couverte porte `tile.occupant = uid` (sinon `null`).
- Champs gérés par la simulation sur les producteurs : `prodTicks` (avancement du
  cycle, en ticks) et `paused` (cycle fini mais entrées manquantes), sérialisables.
- `buildings.syncViews()` aligne l'aspect 3D sur les données (ouverture éteinte si
  `paused`) ; appelé à chaque notification de la simulation et après chargement.
- Vues 3D séparées : `buildings.views` (uid → Object3D). La simulation et la
  sauvegarde ne manipulent que les enregistrements.
- `buildings.toJSON()` → `{ version: 1, nextUid, buildings: [...] }` : format prévu
  pour la sauvegarde (le chargement sera écrit à l'étape sauvegarde).
- `canPlace(type, x, z)` → `{ ok }` ou `{ ok: false, reason: 'bounds' | 'occupied' | 'unknown' }`.

### Conventions
- Repère monde : 1 unité = 1 case. Grille centrée sur l'origine, case (0,0) au coin −x/−z.
  Dessus du sol à `y = grid.topY = 0`.
- Toute couleur vient de `PALETTE` (config.js). Pas de couleur codée en dur ailleurs
  (exception : l'alpha du remplissage de surbrillance dans textures.js).
- Textures : `NearestFilter`, pas de mipmaps, `SRGBColorSpace`, générées sur canvas
  avec un RNG à graine (le monde est identique à chaque chargement).
- Matériaux éclairés : `MeshToonMaterial` + `getToonRamp()` (3 niveaux).
  Éléments interactifs/surbrillance : `MeshBasicMaterial` (non éclairé, toujours lisible).

## Pipeline de rendu (render/renderer.js)
1. La scène est rendue dans un `WebGLRenderTarget` à la **résolution interne**
   (NearestFilter, HalfFloat, avec `DepthTexture`).
2. Une passe plein écran détecte les bords sur la profondeur (caméra ortho ⇒ profondeur
   linéaire) : un pixel dont un voisin est plus loin de `RENDER.outlineThreshold`
   est assombri vers `slateDeep` ⇒ contour léger des silhouettes.
3. Le résultat est écrit dans le canvas, de même taille que la cible, puis agrandi
   en CSS d'un **facteur entier** (`image-rendering: pixelated`).

Résolution interne : facteur `scale = floor(petit côté physique / 180)`, puis
`interne = ceil(physique / scale)`. Desktop 16:9 ⇒ 320x180 ; téléphone portrait
(390x844 @3x) ⇒ 195x422. Les pixels restent carrés et nets quel que soit l'écran.

## Simulation et économie (sim/simulation.js, balance.js)
- **Production générique** : `production = { intervalSeconds, inputs, outputs }`.
  En fin de cycle, le bâtiment paie `inputs` et reçoit `outputs` ; s'il ne peut pas
  payer, il se met **en pause sans rien consommer** (`paused = true`, cycle bloqué
  à la fin) et reprend seul au premier tick où il peut payer.
- **Ordre de résolution** : à chaque tick, les cycles avancent, puis les bâtiments en
  fin de cycle sont résolus **dans l'ordre de pose**. Une Bibliothèque posée avant un
  Observatoire et finissant au même tick lui fournit ses Savoirs à temps.
- **Moteur unique `#run(ticks)`** pour le direct ET le hors ligne : il saute d'un
  événement au suivant (prochaine fin de cycle, ou tick suivant si un bâtiment en
  pause peut payer). Le hors ligne est donc exactement le jeu continu, ce que
  vérifient les tests contre une implémentation de référence naïve, tick par tick
  (4 scénarios, de 3,7 s à 2 h). Coût : proportionnel au nombre de productions, pas
  au nombre de ticks.
- `efficiency` < 1 multiplie les **sorties** pendant le hors ligne (ressources
  fractionnaires possibles, affichées arrondies à l'inférieur) ; les entrées restent
  entières, donc la chaîne reste cohérente. Avec 1 (défaut), égalité stricte.
- **Déblocage** : `unlock: { buildings: { library: 2 } }` ; `missingUnlocks(type)` liste
  les conditions manquantes, `canPlace` renvoie `reason: 'locked'` en premier.
- `applyOffline` renvoie `produced` (par type de bâtiment et ressource) et `consumed`,
  utilisés par le panneau de retour.
- Événements publiés : `produced { uid, outputs }`, `paused { uid }`, `resumed { uid }`.
- **Pas de temps fixe** : `BALANCE.ticksPerSecond` (10). Chaque image, `main.js` appelle
  `sim.advance(dtRéel)` ; un accumulateur exécute le nombre exact de ticks écoulés
  (tolérance 1e-9 contre les erreurs d'arrondi). Vérifié : 60 s donnent exactement
  600 ticks / 30 Savoirs à 24, 30, 60 et 144 images/s.
- Rattrapage borné à `BALANCE.maxCatchUpSeconds` (1 s) par appel : un onglet en
  arrière-plan ne produit pas pendant son absence (la progression hors ligne sera
  une décision de l'étape sauvegarde).
- La simulation est **sans Three.js** : elle lit/écrit `buildings.records` et
  `resources`, et publie des événements (`{ kind: 'produced', uid, resource, amount }`)
  que le rendu consomme via `sim.drainEvents()` (étincelles). Les effets visuels
  n'influencent jamais l'état.
- `sim.subscribe(fn)` : notifié à chaque production et à chaque pose.
- Ressources : **Savoirs** (`knowledge`) et **Présages** (`omens`), départ 0.
- Bibliothèque : +1 Savoir / 2 s, coût 10, la toute première gratuite.
- Observatoire : coût 30 Savoirs, requiert 2 Bibliothèques, consomme 2 Savoirs pour
  1 Présage toutes les 4 s. Tout est dans `balance.js`.
- `costOf(type)` tient compte de la gratuité ; `canPlace` renvoie `reason: 'cost'`
  avec le coût si les moyens manquent (priorité : terrain/occupation d'abord).
- `sim.toJSON()` → `{ version: 1, tick, resources }` (avec `buildings.toJSON()`,
  tout l'état de partie est sérialisable).

## Sauvegarde et hors ligne (save/save.js, main.js)
- Clé `localStorage` : `SAVE.storageKey` (`societe-du-lac:save`). Format **version 3** :
  `{ version, savedAt, sim: { tick, resources, earned }, buildings: { nextUid,
  buildings: [{ uid, type, x, z, rotation, prodTicks, paused }] }, journal: { unlocked, unread } }`.
- Historique : v1 (étape 4) sans `omens` ni `paused` ; migration 1 → 2 ajoute
  `omens: 0` et `paused: false` ; 2 → 3 : voir Carnet. Testées avec de vraies sauvegardes.
- `save.js` ne dépend pas de Three.js : les types valides sont les clés de
  `BALANCE.buildings` (testable sous Node).
- **`savedAt` = instant jusqu'où l'état est à jour.** Invariant clé : on ne
  sauvegarde jamais un état « en retard » sur l'horloge. D'où :
  - sauvegarde périodique (`SAVE.autosaveSeconds` = 10 s) comptée **dans la boucle
    rAF**, qui s'arrête quand la page est masquée (un `setInterval` continuerait à
    réécrire `savedAt` avec un état figé et ferait perdre la production hors ligne) ;
  - sauvegarde aussi à chaque pose, sur `visibilitychange` (masquée) et `pagehide`.
- **Chargement** au démarrage, avant la création de l'UI : `parseSave` valide tout
  (JSON, version, types, entiers, ressources ≥ 0, types de bâtiments connus, uid
  uniques), applique les migrations, puis `buildings.load` refuse chevauchements et
  sorties de terrain. La moindre anomalie → nouvelle partie, `console.warn`
  « [sauvegarde] … », et copie du texte brut sous `<clé>:illisible`.
- Version plus récente que le jeu → traitée comme illisible (nouvelle partie).
- Migrations : `MIGRATIONS[n]` transforme la version n en n + 1 ; incrémenter
  `SAVE_VERSION` et ajouter l'étape à chaque changement de format.
- `localStorage` indisponible (navigation privée, quota) : le jeu reste jouable,
  un seul avertissement par type de problème.
- **Hors ligne** : `sim.applyOffline(secondes)` crédite exactement ce qu'aurait produit
  chaque bâtiment (en reprenant son `prodTicks`), plafonné à `BALANCE.offline.maxSeconds`
  (2 h) et multiplié par `efficiency` (1). Pas d'étincelles pour ce rattrapage.
  - Au chargement : absence = `Date.now() - savedAt`.
  - Onglet redevenu visible : absence = temps depuis le masquage ; `clock.getDelta()`
    est vidé pour que ce temps ne passe pas aussi dans `sim.advance`.
  - Après chaque crédit, sauvegarde immédiate (pas de double comptage au rechargement).
  - Panneau « Retour au domaine » si gain > 0 **et** absence ≥
    `BALANCE.offline.noticeMinSeconds` (30 s) ; le gain est crédité dans tous les cas.
    Les gains successifs s'additionnent tant que le panneau est ouvert.
- **Nouvelle partie** : bouton discret en haut à droite → confirmation (choix par défaut
  « Garder ma partie », Échap ou clic sur le voile pour annuler) → `saver.wipe()`
  (efface et bloque toute écriture, y compris celle de `pagehide`) puis rechargement.

## Carnet (story/, ui.js)
- Palier = **total cumulé gagné** (`sim.earned`, incrémenté par le moteur à chaque sortie,
  jamais diminué par une dépense), pas le solde. Fragments : 5, 25, 100 Présages.
- `journal.update(sim.earned)` à chaque notification de la simulation (et après chargement/
  hors ligne) ; un fragment débloqué le reste même si son palier change ensuite.
- Signal : sceau ambre fixe dans le coin du bouton « Carnet » + bordure ambre, apparition
  douce unique, aucune fenêtre. Ouvrir le Carnet marque tout comme lu (non-lus sauvegardés).
- Panneau non bloquant (pas de voile) ; fragments verrouillés = lignes d'encre pâlie +
  « se révèle à 25 Présages cumulés (12 / 25) ». Échap / Refermer / re-clic ferment.
- Sauvegarde **v3** : `sim.earned` et `journal: { unlocked, unread }`. Migration v2 → v3 :
  `earned` = solde actuel (borne basse : rien ne dépense de Présages), Carnet vide ; les
  paliers déjà atteints se débloquent au chargement. Id de fragment inconnu ignoré.

## Bâtiments
- **Observatoire** (`observatory`) : emprise **1x1**, silhouette verticale (≈ 2,1 de
  haut contre 1,95 pour la Bibliothèque, mais 4 fois plus étroit). Socle et tour
  octogonale effilée en pierre claire (texture d'assises `parchmentDark` /
  `parchmentShade`), anneau et coupole à facettes en ardoise, lunette en bois, porte
  et **meurtrière ambre** sur la face orientée à 45° (face caméra). En pause, la
  meurtrière passe à sa version éteinte (ardoise).
- Facettes : `MeshToonMaterial` n'a pas de `flatShading` ; les cylindres/sphères sont
  désindexés (`faceted()`) pour obtenir des normales par face.
- **Bibliothèque** (`library`) : emprise **2x2**. Socle de pierre ardoise, murs de
  planches, poteaux d'angle sombres, toit à deux pans en bardeaux d'ardoise,
  cheminée, porte face +z, **fenêtre éclairée ambre** face +x (les faces +x et +z
  sont celles que voit la caméra).
- Modèles : primitives uniquement ; UV recalées en unités monde (`boxWorldUV`)
  pour garder 8 texels par unité partout ; matériaux partagés entre instances.
- Emprise paire : centrée sur le sommet de grille le plus proche du pointeur
  (`grid.footprintOrigin`), impaire : sur la case sous le pointeur.
- Production : un symbole (sprite 7x7 px) monte de 0,9 unité au-dessus du faîte
  (`height` dans le catalogue) et s'efface en 1,4 s, avec une légère dérive. La
  variante dépend de la ressource produite (`RESOURCE_TYPES[res].spark`) : étoile
  ambre pleine pour les Savoirs, **losange creux doré pâle** pour les Présages.
- Pose : courte apparition avec léger rebond (0,35 s). Le mode placement reste
  actif après une pose (on peut en poser plusieurs) jusqu'à annulation.
- Aperçu fantôme : clone du modèle, matériaux transparents (opacité 0,55, sans
  écriture de profondeur, donc sans contour) ; si refus, tous ses maillages
  passent au matériau `refuse` (rouge brique discret, opacité 0,35) et le cadre
  au sol devient rouge. La bulle d'aide explique le refus.

## Interface
- HTML/CSS par-dessus le canvas (`#ui`, `pointer-events: none` sauf panneaux).
- Panneaux parchemin : fond `parchment`, bordure bois, liseré ardoise, coins
  carrés ; « pixel » d'interface = 2 px CSS (`--px`).
- Police **Pixelify Sans** hébergée dans `assets/fonts/` (pas de CDN de polices).
- **Compteurs** en haut à gauche, générés depuis `RESOURCE_TYPES` (grimoire pour les
  Savoirs, œil stylisé pour les Présages) : valeur en gras, libellé accordé
  (« 1 Présage »), léger sursaut vertical (0,4 s) à chaque gain. En colonne sur
  petit écran.
- **Outil verrouillé** : icône cadenas, bordure pointillée, condition affichée
  (« Requiert 2 Bibliothèques »), `aria-disabled="true"`, clic sans effet.
  Un outil seulement trop cher reste cliquable (pas d'`aria-disabled`).
- Petits écrans (≤ 480 px) : outils compacts, bouton Annuler réduit à « ✕ ».
- Le type du dernier pointeur est suivi sur toute la page (aides souris/tactile
  correctes même quand on choisit l'outil au doigt).
- Barre d'outils en bas (bouton Bibliothèque avec icône SVG pixel et son coût —
  « Gratuite » ou « 10 Savoirs » —, bouton Annuler visible seulement en placement),
  bulle d'aide juste au-dessus de la barre.
- Dialogues parchemin centrés (titre bois sombre, apparition douce 0,35 s) : retour
  hors ligne (non bloquant, bouton « Reprendre ») et confirmation de nouvelle partie
  (voile ardoise, bloquant). Échap ferme d'abord le dialogue ouvert, sinon annule
  le placement.
- Bouton d'un bâtiment trop cher : **grisé** (`.unaffordable`, `aria-disabled`) mais
  toujours cliquable, pour voir l'aperçu (rouge) et le motif « il en faut 10 ». Cibles tactiles ≥ 44 px,
  marges `safe-area-inset` pour les écrans à encoche.
- Ambre dans l'UI = interactif uniquement (survol, outil sélectionné).

## Caméra et contrôles
- Orthographique, azimut 45°, élévation **30°** (losanges 2:1 du pixel art iso).
  Orientation fixe (pas de rotation pour l'instant).
- Échelle : `CAMERA.pixelsPerUnit` (12) px internes par unité à zoom 1 ;
  zoom borné `[0.5, 3]`, zoom initial ajusté pour voir toute la grille.
- Cible bornée à la grille + `panMargin`. Position alignée sur la grille des pixels
  internes (plan écran) pour éviter le scintillement des textures.
- Déplacement par « saisie » : le point du sol attrapé reste sous le pointeur/doigt.
- Souris : glisser (gauche ou droit) = déplacer, molette = zoom vers le curseur,
  survol = surbrillance. Tactile : 1 doigt = déplacer, 2 doigts = pincer (zoom +
  déplacement), tap = surbrillance (persiste). Seuil tap/glisser : 8 px CSS.
- En mode placement : souris inchangée (glisser = déplacer la vue, clic = poser,
  clic droit = annuler). Tactile : **1 doigt vise** (l'aperçu suit le doigt, sans
  déplacer la vue), **tap = poser**, relâcher après un glisser ne pose rien ;
  **2 doigts** déplacent/zooment. Choix fait pour éviter les poses accidentelles.

## Direction artistique
- Pixel art en 3D : basse résolution, NearestFilter, pas d'antialiasing.
- Low-poly simple (cubes, prismes), textures pixel sans dégradé, ombrage plat 2–3
  niveaux, contour sombre léger.
- Palette (config.js) :
  - Bleu ardoise profond — ombres, ciel, contours (`slateDeep #1b2333`, `slate #2a3650`…)
  - Bois brun chaud — constructions, terre (`wood #6e4a31`…)
  - Parchemin crème — chemins, UI (`parchment #eadfc0`)
  - Vert sauge — végétation (`sage #748f68`…)
  - **Ambre doré — réservé aux éléments interactifs** (`amber #f2b33d`). Ne jamais
    l'utiliser pour du décor. Exception assumée : les **fenêtres éclairées** des
    bâtiments (demandées par la DA) — elles signalent aussi un bâtiment actif.
  - Rouge brique discret `refuse #a8524a` : **uniquement** pour un refus d'action.
- Éclairage : soleil de fin de journée doré, rasant, venant de la gauche ; ombres
  bleutées (hémisphère ciel ardoise) ; plus tard, petites sources chaudes
  (lanternes, symboles).
- UI (à venir) : HTML/CSS par-dessus le canvas, panneaux parchemin/carnet,
  police pixel, compteurs en sceaux ou bougies.

## Décisions
- **Canvas à la résolution interne + agrandissement CSS entier** plutôt qu'un
  agrandissement dans un shader : pixels parfaitement carrés et coût GPU minimal.
- **Contour par profondeur** (pas par normales) : suffisant pour des silhouettes
  low-poly, un seul échantillonnage de texture par voisin.
- **Socle en une seule `BoxGeometry`** avec un atlas sur la face du dessus (une
  variante d'herbe par case) : 1 seul draw call pour le sol. La sélection de case
  se fait par intersection rayon/plan, pas par raycast sur des maillages.
- **Ombres `BasicShadowMap` 512²** : volontairement nettes et pixelisées.
- Intensités de lumière calibrées pour le mode physique de Three r169
  (soleil 3.4, hémisphère 1.1, `shadow.intensity` 0.7 pour des ombres douces).
- **Pas de PointLight par bâtiment** pour la fenêtre : chaque nouvelle lumière
  force la recompilation des shaders (saccade à chaque pose). La fenêtre est un
  `MeshBasicMaterial` non éclairé. À revoir pour les lanternes (peu nombreuses).
- **Registre de données séparé des vues 3D** : prêt pour la simulation et la
  sauvegarde sans dépendre de Three.js.
- **Équilibrage isolé dans `balance.js`** (et non `config.js`) : les réglages de
  gameplay se modifient sans toucher au rendu.
- **Simulation dans la boucle `requestAnimationFrame` avec accumulateur** plutôt
  qu'un `setInterval` : pas de dérive, pas de travail quand l'onglet est caché,
  et un seul point d'entrée temporel.
- **Bouton trop cher grisé mais cliquable** : l'aperçu peut ainsi montrer le refus,
  comme demandé ; aucune pose n'est possible tant que le coût n'est pas couvert.
- **Pause en fin de cycle** (plutôt qu'au début) : un Observatoire « travaille » son
  cycle puis attend les Savoirs ; il produit dès qu'ils arrivent. Rien n'est jamais
  consommé à l'avance, donc jamais perdu.
- **Moteur à sauts d'événements partagé direct/hors ligne** plutôt qu'une formule
  fermée : avec une chaîne et des pauses, aucune formule simple n'est exacte.
- **Seuil d'affichage du panneau hors ligne (30 s)** : sans lui, un simple changement
  d'onglet afficherait « 2 Savoirs ». Mettre `noticeMinSeconds: 0` pour l'afficher
  dès le moindre gain.
- **Réinitialisation par rechargement de page** plutôt que remise à zéro en place :
  garantit un état initial identique à une vraie nouvelle partie.
- **Sauvegarde illisible conservée en copie** (`:illisible`) avant d'être remplacée.
- **Police auto-hébergée** plutôt que Google Fonts : fonctionne hors ligne et sans
  dépendance externe supplémentaire.

## Tests
- **Automatisés** : `node tests/run.mjs` (voir plus haut). Couvrent : égalité hors
  ligne = continu = référence tick par tick, plafond, rapport hors ligne, indépendance
  aux FPS, pause/reprise sans consommation, déblocage, migration v1 → v2 d'une vraie
  sauvegarde de l'étape 4, aller-retour v2, sauvegardes invalides.
  Vérifié qu'ils échouent si l'on casse le réveil des bâtiments en pause.
- **Navigateur** : vérification manuelle (voir « Lancer en local ») et captures
  headless via Playwright/Chromium (CDN redirigé vers une copie locale de Three.js
  avec `page.route` si besoin). Penser à `__game.saver.enabled = false` avant de
  modifier la sauvegarde à la main, sinon `pagehide` la réécrit au rechargement.

## Journal des étapes
- **1** : grille iso 16x16, rendu pixel art (basse résolution, toon, contour), caméra bornée souris + tactile, surbrillance.
- **2** : Bibliothèque 2x2, barre d'outils parchemin, aperçu fantôme et refus, annulation, registre sérialisable.
- **3** : Savoirs, production à pas fixe (10 ticks/s), coût et première gratuite, `balance.js`.
- **4** : sauvegarde versionnée localStorage, hors ligne plafonné (2 h) avec panneau de retour, nouvelle partie.
- **5** : Observatoire et Présages, pause/reprise, moteur unique direct/hors ligne, sauvegarde v2, tests Node.
- **6** : Carnet (3 fragments à 5/25/100 Présages cumulés), signal ambre discret, total cumulé, sauvegarde v3.
