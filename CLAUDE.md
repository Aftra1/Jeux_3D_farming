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
index.html            importmap Three.js + conteneur #game
css/style.css         plein écran, canvas pixelated, touch-action: none
js/config.js          PALETTE, GRID, RENDER, CAMERA — toutes les constantes
js/main.js            assemblage + boucle de rendu ; window.__game pour déboguer
js/render/
  renderer.js         PixelRenderer : cible basse résolution + passe contour
  textures.js         textures pixel procédurales (RNG à graine), rampe toon 3 niveaux
  lighting.js         soleil doré rasant + hémisphère bleuté, ombres nettes
  camera.js           IsoCamera : orthographique, bornée, alignée au pixel
js/grid/
  grid.js             Grid : données 16x16 + socle 3D ; tileAtWorld, tileCenter
  highlight.js        TileHighlight : cadre ambre de la case survolée/touchée
js/input/
  controls.js         Controls : glisser, molette, pincer, survol, tap
```
Modules prévus (pas encore créés) : `js/buildings/`, `js/sim/`, `js/ui/`, `js/save/`.

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
    l'utiliser pour du décor.
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
  (soleil 3.4, hémisphère 1.1).

## Tests
Pas de suite automatisée pour l'instant. Vérification manuelle (voir « Lancer en local »)
et captures headless via Playwright/Chromium (le CDN étant parfois inaccessible en CI,
on peut rediriger l'URL Three.js vers une copie locale avec `page.route`).

## Journal des étapes
- **Étape 1 — Prototype minimal** : grille iso 16x16, rendu pixel art (basse résolution,
  toon 3 niveaux, contour), palette et éclairage de fin de journée, caméra ortho
  bornée (souris + tactile), surbrillance ambre de la case survolée/touchée.
