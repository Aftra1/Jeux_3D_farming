# CLAUDE.md — La Société du Lac

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
js/balance.js         BALANCE — TOUTES les valeurs de gameplay (tick, coûts, production,
                      hors ligne)
js/main.js            assemblage, routage des entrées, boucle ; window.__game pour déboguer
js/render/
  renderer.js         PixelRenderer : cible basse résolution + passe contour
  textures.js         textures pixel procédurales (RNG à graine), rampe toon 3 niveaux
  lighting.js         soleil doré rasant + hémisphère bleuté, ombres nettes
  camera.js           IsoCamera : orthographique, bornée, alignée au pixel
  effects.js          Sparks : étincelles ambre de production (pool de sprites)
js/grid/
  grid.js             Grid : données 16x16 + socle 3D ; tileAtWorld, tileCenter
  highlight.js        TileHighlight : cadre (1 case ou emprise w x d), ambre ou rouge refus
js/buildings/
  catalog.js          BUILDING_TYPES : nom, emprise, fabrique du modèle
  models.js           modèles low-poly (buildLibrary), matériaux partagés
  buildings.js        BuildingManager : registre des bâtiments posés + vues 3D
  placement.js        Placement : mode placement, aperçu fantôme, validation
js/input/
  controls.js         Controls : glisser, molette, pincer, survol, tap, visée tactile
js/sim/
  simulation.js       Simulation : pas fixe, ressources, économie (coût, pose), production
js/save/
  save.js             SaveStore (localStorage protégé), parseSave (validation +
                      migrations), SaveManager (load / save / wipe)
js/ui/
  ui.js               UI : compteur, barre d'outils, Annuler, bulle d'aide,
                      panneau « pendant votre absence », confirmation de nouvelle partie
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

### Données des bâtiments (buildings.js)
- `buildings.records` : tableau, dans l'ordre de pose, d'enregistrements
  **purs et sérialisables** : `{ uid, type, x, z, rotation }`. `(x, z)` = coin
  −x/−z de l'emprise ; `rotation` en quarts de tour (toujours 0 pour l'instant).
- `buildings.byUid` : index uid → enregistrement ; `buildings.at(x, z)` via la grille.
- Occupation : chaque case couverte porte `tile.occupant = uid` (sinon `null`).
- Champ ajouté par la simulation sur les producteurs : `prodTicks` (ticks écoulés
  depuis la dernière production), sérialisable avec le reste.
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
- Ressource **Savoirs** (`knowledge`), départ 0. Bibliothèque : +1 toutes les 2 s,
  coût 10, la toute première gratuite (`firstFree`) — tout est dans `balance.js`.
- `costOf(type)` tient compte de la gratuité ; `canPlace` renvoie `reason: 'cost'`
  avec le coût si les moyens manquent (priorité : terrain/occupation d'abord).
- `sim.toJSON()` → `{ version: 1, tick, resources }` (avec `buildings.toJSON()`,
  tout l'état de partie est sérialisable).

## Sauvegarde et hors ligne (save/save.js, main.js)
- Clé `localStorage` : `SAVE.storageKey` (`societe-du-lac:save`). Format version 1 :
  `{ version, savedAt, sim: { tick, resources }, buildings: { nextUid, buildings } }`.
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

## Bâtiments
- **Bibliothèque** (`library`) : emprise **2x2**. Socle de pierre ardoise, murs de
  planches, poteaux d'angle sombres, toit à deux pans en bardeaux d'ardoise,
  cheminée, porte face +z, **fenêtre éclairée ambre** face +x (les faces +x et +z
  sont celles que voit la caméra).
- Modèles : primitives uniquement ; UV recalées en unités monde (`boxWorldUV`)
  pour garder 8 texels par unité partout ; matériaux partagés entre instances.
- Emprise paire : centrée sur le sommet de grille le plus proche du pointeur
  (`grid.footprintOrigin`), impaire : sur la case sous le pointeur.
- Production : une étincelle ambre (sprite 7x7 px) monte de 0,9 unité au-dessus du
  faîte (`height` dans le catalogue) et s'efface en 1,4 s, avec une légère dérive.
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
- **Compteur de Savoirs** en haut à gauche : panneau parchemin, petit grimoire en
  SVG pixel, valeur en gras ; léger sursaut vertical (0,4 s) à chaque gain.
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
- **Seuil d'affichage du panneau hors ligne (30 s)** : sans lui, un simple changement
  d'onglet afficherait « 2 Savoirs ». Mettre `noticeMinSeconds: 0` pour l'afficher
  dès le moindre gain.
- **Réinitialisation par rechargement de page** plutôt que remise à zéro en place :
  garantit un état initial identique à une vraie nouvelle partie.
- **Sauvegarde illisible conservée en copie** (`:illisible`) avant d'être remplacée.
- **Police auto-hébergée** plutôt que Google Fonts : fonctionne hors ligne et sans
  dépendance externe supplémentaire.

## Tests
Pas de suite automatisée versionnée pour l'instant. Pour la sauvegarde, tester dans
le navigateur ; penser à `__game.saver.enabled = false` avant de modifier la
sauvegarde à la main, sinon `pagehide` la réécrit au rechargement. La simulation étant sans
dépendance à Three.js, elle peut être testée directement avec Node
(`import { Simulation } from './js/sim/simulation.js'` + un faux registre). Vérification manuelle (voir « Lancer en local »)
et captures headless via Playwright/Chromium (le CDN étant parfois inaccessible en CI,
on peut rediriger l'URL Three.js vers une copie locale avec `page.route`).

## Journal des étapes
- **Étape 1 — Prototype minimal** : grille iso 16x16, rendu pixel art (basse résolution,
  toon 3 niveaux, contour), palette et éclairage de fin de journée, caméra ortho
  bornée (souris + tactile), surbrillance ambre de la case survolée/touchée.
- **Étape 2 — Premier bâtiment** : Bibliothèque 2x2 (modèle low-poly, fenêtre ambre),
  barre d'outils parchemin avec police pixel, aperçu fantôme qui suit souris/doigt,
  refus teinté rouge discret (case occupée / hors terrain), annulation (clic droit,
  Échap, bouton Annuler), registre `BuildingManager` sérialisable (`toJSON`).
- **Étape 3 — Ressource et simulation** : Savoirs (compteur grimoire), production des
  Bibliothèques (1 / 2 s) avec étincelle ambre, coût 10 (première gratuite), bouton
  grisé et aperçu refusé si moyens insuffisants, simulation à pas fixe (10 ticks/s)
  indépendante du rendu, équilibrage centralisé dans `balance.js`.
- **Étape 4 — Sauvegarde et hors ligne** : sauvegarde versionnée dans localStorage
  (10 s, pose, masquage, fermeture), chargement validé avec repli sur nouvelle partie,
  progression hors ligne plafonnée (2 h, 100 %) avec panneau « Retour au domaine »,
  bouton « Nouvelle partie » avec confirmation.
