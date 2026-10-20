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
- Sauvegarde future : `localStorage`.

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
js/config.js          PALETTE, GRID, RENDER, CAMERA — toutes les constantes
js/main.js            assemblage, routage des entrées, boucle ; window.__game pour déboguer
js/render/
  renderer.js         PixelRenderer : cible basse résolution + passe contour
  textures.js         textures pixel procédurales (RNG à graine), rampe toon 3 niveaux
  lighting.js         soleil doré rasant + hémisphère bleuté, ombres nettes
  camera.js           IsoCamera : orthographique, bornée, alignée au pixel
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
js/ui/
  ui.js               UI : barre d'outils, bouton Annuler, bulle d'aide
```
Modules prévus (pas encore créés) : `js/sim/`, `js/save/`.

### Flux des entrées (main.js)
`Controls` ne connaît que des gestes ; `main.js` les route selon le mode :
- **Mode normal** : survol/tap → `highlight.set(case)`.
- **Mode placement** (`placement.active`) : survol souris ou glisser 1 doigt
  (`onAim`) → `placement.aim(point)` ; clic/tap → `placement.tryPlace(point)` ;
  clic droit (tap bouton 2), Échap, bouton « Annuler » ou re-clic sur l'outil →
  `placement.cancel()`.
- `Placement.onChange` → `ui.render(...)` (état des boutons, aide, motif de refus)
  et active `controls.aimWithTouch`.
L'UI n'importe rien de la 3D : elle émet `onSelect(type)` / `onCancel()`.

### Données des bâtiments (buildings.js)
- `buildings.records` : tableau, dans l'ordre de pose, d'enregistrements
  **purs et sérialisables** : `{ uid, type, x, z, rotation }`. `(x, z)` = coin
  −x/−z de l'emprise ; `rotation` en quarts de tour (toujours 0 pour l'instant).
- `buildings.byUid` : index uid → enregistrement ; `buildings.at(x, z)` via la grille.
- Occupation : chaque case couverte porte `tile.occupant = uid` (sinon `null`).
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

## Bâtiments
- **Bibliothèque** (`library`) : emprise **2x2**. Socle de pierre ardoise, murs de
  planches, poteaux d'angle sombres, toit à deux pans en bardeaux d'ardoise,
  cheminée, porte face +z, **fenêtre éclairée ambre** face +x (les faces +x et +z
  sont celles que voit la caméra).
- Modèles : primitives uniquement ; UV recalées en unités monde (`boxWorldUV`)
  pour garder 8 texels par unité partout ; matériaux partagés entre instances.
- Emprise paire : centrée sur le sommet de grille le plus proche du pointeur
  (`grid.footprintOrigin`), impaire : sur la case sous le pointeur.
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
- Barre d'outils en bas (bouton Bibliothèque avec icône SVG pixel, bouton Annuler
  visible seulement en placement), bulle d'aide en haut. Cibles tactiles ≥ 44 px,
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
- **Police auto-hébergée** plutôt que Google Fonts : fonctionne hors ligne et sans
  dépendance externe supplémentaire.

## Tests
Pas de suite automatisée pour l'instant. Vérification manuelle (voir « Lancer en local »)
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
