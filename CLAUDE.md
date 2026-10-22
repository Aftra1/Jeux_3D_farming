# CLAUDE.md — La Société du Lac

## Règles d'économie
- Rapport final de 15 lignes maximum : ce qui est fait, choix à valider, comment tester. Ne pas reformuler ma demande ni détailler chaque fichier.
- Tests : lancer `node tests/run.mjs` à chaque étape. Tests navigateur et captures uniquement pour une nouveauté visuelle de l'étape, pas de rejeu complet des étapes précédentes.
- Pas de test de sabotage sauf si le moteur de simulation change.
- Lire seulement les fichiers nécessaires, modifier par remplacements ciblés plutôt que réécrire des fichiers entiers.
- Ne pas narrer chaque action pendant le travail.
- Garder CLAUDE.md concis : condenser le journal en une ligne par étape.
- Si une étape demande une refonte importante non prévue, me demander avant.
- Après validation d'une étape, fusionner dans main et pousser.

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

## Simulateur d'équilibrage (tools/)
`node tools/playtest.mjs` : 3 profils (prudent, équilibré, optimiseur) jouent avec le moteur réel
(décision chaque seconde, terrain GRID.size sans Three.js, règles `room` et `edge` du jeu) jusqu'au palier 5,
puis la fin vue, jusqu'à la dernière missive du chapitre II (durée depuis la fin, cible 30–45 min au profil équilibré).
Profil « équilibré + visiteurs » (attrape chaque visiteur 5 s après son apparition) : effet sur la
durée totale, limite −10 %. Tableau des jalons, 3 plus longues attentes **sans achat possible** par profil (alerte > 5 min), plus
longue pause volontaire (indicatif), 3 propositions chiffrées si alerte. Ne modifie jamais `balance.js`. Écrit `tools/playtest-report.md`.

## Déploiement (GitHub Pages)
- Branche **`main`** = version publiée. `.github/workflows/pages.yml` : à chaque push sur
  main, job `test` (`node tests/run.mjs`, Node 20) puis job `deploy` (`needs: test`) qui
  publie `index.html`, `manifest.webmanifest`, `.nojekyll`, `css/`, `js/`, `assets/`.
- Réglage du dépôt requis : Settings → Pages → Source = **GitHub Actions** ; branche par
  défaut = `main` (l'environnement `github-pages` n'autorise que la branche par défaut).
- URL : https://aftra1.github.io/Jeux_3D_farming/ (sous-dossier : tout chemin reste relatif ;
  vérifié en servant le site sous `/Jeux_3D_farming/`).
- `<head>` : description, favicon SVG pixel (losange ambre sur ardoise), PNG 180/192/512
  dans `assets/icons/`, manifeste (plein écran) et balises `apple-mobile-web-app-*`.

## Feuille de route
`TODO.md` : une case par étape, cochée une fois l'étape validée.

## Lancer en local
Les modules ES exigent un serveur HTTP (pas `file://`) :
```
npx http-server -p 8080     # ou : python3 -m http.server 8080
```
puis ouvrir http://localhost:8080. Sur téléphone : même réseau, IP de la machine.

## Architecture
```
index.html            importmap Three.js, meta/icônes, conteneur #game, interface #ui
manifest.webmanifest  ajout à l'écran d'accueil (icônes assets/icons/)
.github/workflows/    pages.yml : tests puis déploiement GitHub Pages
css/style.css         plein écran, canvas pixelated, panneaux parchemin, police pixel
assets/fonts/         Pixelify Sans 400/700 (woff2, OFL — hébergée localement)
js/world/islands.js   ISLANDS — 3 îlots du lac (id, nom, identité, position, côté), données pures
js/config.js          PALETTE, GRID, LAKE, QUALITY, RENDER, SAVE, CAMERA, AUDIO, DAYCYCLE — constantes visuelles/techniques/sonores
js/balance.js         BALANCE — TOUTES les valeurs de gameplay (tick, hors ligne,
                      départ des ressources, coûts, déblocages, productions)
js/resources.js       RESOURCE_TYPES — registre des ressources (noms, icône, effet)
tests/run.mjs         tests Node (node:test), sans dépendance au rendu
tools/playtest.mjs    simulateur d'équilibrage (non déployé) → tools/playtest-report.md
js/main.js            assemblage, routage des entrées, boucle ; window.__game pour déboguer
js/render/
  renderer.js         PixelRenderer : cible basse résolution + passe contour
  textures.js         textures pixel procédurales (RNG à graine), rampe toon 3 niveaux
  lighting.js         soleil doré rasant + hémisphère bleuté, ombres nettes ; applyDay (jour/nuit),
                      applyBeacon (lumière ponctuelle du Phare, présente dès le départ à 0)
  camera.js           IsoCamera : orthographique, bornée, alignée au pixel
  effects.js          Sparks : symboles de production (variantes 'star', 'omen')
  visitors.js         Visitors : feu follet des Visiteurs du lac (délai, trajet, zone de toucher)
  beam.js             LighthouseBeam : faisceau tournant du Phare achevé (translucide, sans contour)
  islands.js          IslandViews : îlots (socle, berge, décor fusionné, brume, passerelle instanciée)
  lake.js             Lake : plan d'eau unique (shader pixel), berges, ponton, barque, roseaux
  quality.js          QualityManager : qualité Auto/Basse/Normale/Haute, mesure des i/s (sans Three.js)
  merge.js            mergeGeometries, compactModel (fusion par matériau, géométries partagées en cache)
  sway.js             ReedSway : roseaux instanciés qui ondulent (Haute)
js/grid/
  terrain.js          Terrain (sans Three.js) : zones constructibles (domaine 24x24 + îlots ouverts),
                      occupation, footprintProblem, hasFreeArea, touchesEdge, worldBounds, reach
  grid.js             Grid extends Terrain : + socle 3D du domaine
  highlight.js        TileHighlight : cadre (1 case ou emprise w x d), ambre ou rouge refus
  aura.js             AuraPreview : cases d'aura teintées + cadre des bâtiments renforcés (placement)
js/buildings/
  catalog.js          BUILDING_TYPES / BUILDING_ORDER : registre (noms, emprise, icône, modèle)
  models.js           modèles low-poly (buildLibrary, buildObservatory, buildSanctuary,
                      buildLighthouse(record) par palier, buildBoostMarker), matériaux
                      partagés, ouvertures allumées/éteintes (setLightOn)
  buildings.js        BuildingManager : registre des bâtiments posés + vues 3D
  batches.js          InstanceBatches : un InstancedMesh par pièce partagée (géométrie+matériau) des bâtiments non uniques
  placement.js        Placement : mode placement, aperçu fantôme, validation
js/input/
  controls.js         Controls : glisser, molette, pincer, survol, tap, visée tactile
js/sim/
  simulation.js       Simulation : pas fixe, ressources, total cumulé (`earned`), économie, production
js/story/
  fragments.js        FRAGMENTS — textes et paliers du Carnet (fichier de données à éditer)
  missives.js         MISSIVES — objectifs guidés : textes et conditions (données)
  intro.js            TITLE, LETTER — textes de l'écran titre et de la lettre d'introduction (données)
  ending.js           ENDING — dernière lettre, générique, résumé, mentions (données) ; formatDuration
  progress.js         Progress : durée de jeu active, drapeau de fin (sans DOM)
  journal.js          Journal : fragments débloqués / non lus, missives accomplies,
                      missiveProgress (sans DOM ni Three.js)
js/world/
  daycycle.js         DayCycle, sampleDay : heure du domaine (horloge seule, sans Three.js)
js/audio/
  audio.js            SoundScape (Web Audio, tout synthétisé), RateLimiter, scaleMidi, parseSoundPref
js/save/
  save.js             SaveStore (localStorage protégé), parseSave (validation +
                      migrations), SaveManager (load / save / wipe)
js/ui/
  ui.js               UI : compteurs et outils générés depuis les registres, Annuler,
                      bulle d'aide, panneau de retour, confirmation de nouvelle partie
  icons.js            icônes SVG pixel (ressources, bâtiments, cadenas)
  title.js            TitleScreen : écran titre, lettre, fondu vers le jeu (DOM seul)
  ending.js           EndingScreen : « Passer », dernière lettre, générique + résumé, relecture
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
   verb, height, icon, build) — l'ordre des clés = ordre de la barre d'outils ;
2. `js/balance.js` : `BALANCE.buildings[id]` (footprint, cost, firstFree, unlock,
   production, aura) — l'emprise y vit car la simulation en a besoin (voisinage) ;
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
- `hasFreeArea({ w, d }, except)` : reste-t-il une place w x d libre hors du rectangle `except` (règle `room`), sur toutes les zones ouvertes.
- Terrain en zones (étape 22) : `canPlace`, `hasFreeArea`, `touchesEdge` délèguent à `Terrain` ; une emprise tient sur une
  seule zone (sinon `'bounds'`). Domaine inchangé (mêmes cases, mêmes refus) ; îlots en coordonnées hors 0..23.

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
- **Auras** (`aura: { radius, targets, bonus }`) : un bâtiment de type `targets` dont une
  case est à ≤ `radius` de l'emprise (anneau, 8 cases pour 1x1 rayon 1) reçoit `bonus` en
  plus de ses sorties à chaque cycle. **Sans cumul** (max par ressource). `sim.boosts()`
  (uid → bonus) est recalculé au début de chaque `#run` : les auras ne changent qu'à la
  pose, hors moteur, donc direct et hors ligne restent identiques. `sim.wouldBoost(type,
  x, z)` et `auraTiles()` servent l'aperçu. Les événements `produced` incluent le bonus.
- Ressources : **Savoirs** (`knowledge`), **Présages** (`omens`) et **Reliques** (`relics`, chapitre II), départ 0.
- Bibliothèque : +1 Savoir / 2 s, coût 10 (×1,2), la toute première gratuite.
- Observatoire : coût 450 Savoirs (×1,2), requiert 2 Bibliothèques, consomme 2 Savoirs pour
  1 Présage toutes les 4 s. Sanctuaire : 950 Savoirs + 85 Présages (×1,5), requiert 1 Observatoire,
  aura +1 Savoir par cycle aux Bibliothèques voisines. Tout est dans `balance.js`.
- **Coûts croissants** (étape 16) : `costOf(type)` = `cost × costGrowth^(exemplaires payés)` arrondi, après la
  gratuité (Bibliothèque 1,2 ; Observatoire 1,2 ; Sanctuaire 1,5) ; les boutons montrent toujours le prochain.
- **Place du Phare** : `reserveRoom` ⇒ tant qu'il n'est pas posé, `canPlace` refuse (`reason: 'room'`, après
  occupation, avant coût) toute pose qui ne laisserait aucune place 2x2 libre (`sim.leavesRoom`).
- `costOf(type)` tient compte de la gratuité ; `canPlace` renvoie `reason: 'cost'`
  avec le coût si les moyens manquent (priorité : terrain/occupation d'abord).
- **Visiteurs du lac** (`BALANCE.visitors`) : délai 2–4 min compté dans la boucle **seulement si `playing`**
  (jamais au titre, jamais pendant un crédit hors ligne), 20 s de présence, fondus doux. Tap/clic (zone ≥ 56 px
  CSS, prioritaire sur pose et sélection) → `sim.catchVisitor()` : 20 s de production brute actuelle de Savoirs
  (`productionRate`, auras et paliers compris, plancher 5) ou, à 15 % et si des Présages ont déjà été obtenus,
  3–6 Présages ; compte dans `earned` et `sim.visitors`. Arpège cristallin + texte flottant (`ui.floatText`).
  30 s de cadeau faisait −14 % de durée au simulateur ⇒ 20 s (≈ −9 %).
- **Chapitre II** : `unlock.finished` (la Simulation lit `story.finished` = `progress.finished`, objet `story` de
  main.js) ; règle `edge` : emprise au bord du terrain, sinon refus `'edge'` (après occupation, avant `room`).
  Embarcadère : 6000 Savoirs + 600 Présages (×1,5), 3 Présages → 1 Relique / 12 s, pause comme l'Observatoire.
  Simulateur : chapitre II en ≈ 37 min (équilibré), 3 Embarcadères, aucune attente > 5 min.
- **Îlots** (étape 22, `BALANCE.islands`) : visibles après `unlock.missives` (13 = 3e du chapitre II) ; `sim.canRally` /
  `rallyIsland(id)` paient `costs[n]` (40 / 90 / 160 Reliques selon le nombre déjà ralliés, quel que soit l'îlot),
  `sim.islands` (ids) ouvre les zones (`buildings.setOpenIslands`). Écart d'eau ≥ 4 cases : aucune aura ne traverse.
  Simulateur : profil équilibré rallie dès que possible, fin = dernière missive + 3 îlots, ≈ 37 min.
- `sim.toJSON()` → `{ version: 1, tick, resources }` (avec `buildings.toJSON()`,
  tout l'état de partie est sérialisable).

## Sauvegarde et hors ligne (save/save.js, main.js)
- Clé `localStorage` : `SAVE.storageKey` (`societe-du-lac:save`). Format **version 11** :
  `{ version, savedAt, sim: { tick, resources, earned, visitors }, buildings: { nextUid,
  buildings: [{ uid, type, x, z, rotation, prodTicks, paused }] }, sim.islands: [id], journal: { unlocked, unread, missives }, day: { startedAt }, progress: { playSeconds, finished } }`.
- Historique : v1 (étape 4) sans `omens` ni `paused` ; migration 1 → 2 ajoute
  `omens: 0` et `paused: false` ; 2 → 3 : voir Carnet ; 3 → 4 : `missives: 0` ; 4 → 5 : `day.startedAt = savedAt` ; 5 → 6 : rien à convertir, `stage` (1..5) requis pour un Phare, refusé ailleurs, un seul Phare ; 6 → 7 : x, z + 4 (16x16 → 24x24 centré, même place dans le monde) ; 7 → 8 : `visitors: 0` ; 8 → 9 : `progress` (durée estimée = min(tick / 10, savedAt − day.startedAt), `finished: false`) ; 9 → 10 : `relics: 0` (ressources et cumul) ; 10 → 11 : `sim.islands: []` (les zones ralliées s'ouvrent avant `buildings.load`). Testées avec de vraies sauvegardes.
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
- **Nouvelle partie** : bouton du panneau Options → confirmation (choix par défaut
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
- **Missives** (`missives.js`) : une seule à la fois, dans l'ordre ; condition `built` (nombre
  posé) ou `boosted` (nombre renforcé en même temps, `sim.boostedCountOf`), lue sur la
  simulation. `journal.update(earned, sim)` accomplit en boucle toutes celles déjà remplies
  (une partie migrée rattrape la bonne missive). Chacune révèle le fragment qui porte
  `missive: <id>` (fragments.js, intercalés dans l'ordre du Carnet). Sauvegarde : seul le
  nombre accompli (`journal.missives`, borné au nombre de missives existantes).
- **Chapitre II** (`chapter: 2` sur 5 missives et 5 fragments, à la suite) : missive proposée seulement si
  `progress.finished` ; condition `earned` (Reliques cumulées : 5, 100, 360). Carnet : section « Chapitre II »
  (titre `.chapter-title`) visible une fois la fin vue. Outil et compteur des Reliques invisibles avant
  (`offers[type].hidden`, `RESOURCE_TYPES.relics.revealWith`), pour ne rien dévoiler.
- Fragment **caché** (`hidden: true`, condition `visitors: 10`, ou `island: id` pour les 3 fragments des îlots) : absent du Carnet tant qu'il n'est pas révélé.
- Section « Missives » en tête du Carnet (texte + « 1 / 2 ») ; rappel d'une ligne sous les
  compteurs (`short` + compte), clic = replier (préférence `<clé>:missive-repliee`), apparition
  douce à chaque nouvelle missive, masqué quand tout est accompli.

## Son (audio/audio.js, AUDIO dans config.js)
- Tout est synthétisé (aucun fichier). Réglages (volumes, gamme pentatonique de ré, tempo de la
  nappe, plafonds par seconde) dans `AUDIO`. Bus ambiance + effets → réverbération générée → maître.
- Nappe : tonique/quinte graves + voix haute qui glisse dans la gamme toutes les 18 s ; lac : bruit
  brun filtré ondulant + clapotis aléatoires. Effets : pose (toc-toc boisé), Savoirs (tintement,
  ≤ 3/s), Présages (note cristalline, ≤ 1 / 2 s), fragment/missive (phrase de 4 notes), refus (note
  grave qui s'affaisse). Un son par ressource et par image (regroupement), puis `RateLimiter`.
  Hauteur ±6 cents et volume ±25 % aléatoires. Pas de son pour le rattrapage hors ligne.
- Contexte créé au premier geste (pointerdown/up, keydown, touchend) ; coupé ou onglet masqué →
  fondu puis `suspend()`. Préférence `<clé>:son` `{ muted, volume }`, hors sauvegarde de partie
  (non effacée par « Nouvelle partie »). Volume perçu = carré du curseur ; bouger le curseur remet le son.
- UI : bouton son rapide sous le Carnet ; interrupteur + volume dans les Options (synchronisés).

## Cycle jour/nuit (world/daycycle.js, DAYCYCLE dans config.js)
- Purement visuel et sonore. Heure = (Date.now() − `day.startedAt`) modulo 480 s ; ne lit jamais la
  simulation. Phases après-midi (140 s) → crépuscule (30) → nuit (80) → aube (30), chacune suivie de
  50 s de fondu (smoothstep). Chaque phase : ciel, direction/couleur/intensité du soleil (lune la
  nuit), hémisphère, `night` 0..1. Couleurs ajoutées à `PALETTE` (tons ardoise/prune/doré).
- Lisibilité : lumière totale ≥ 2,9 et ciel jamais noir (vérifié par les tests).
- `night` → `setNightGlow` (models.js : fenêtres/meurtrières/braise ×1,35, halo 0,35 → 0,6) et
  `sound.setNight` (nappe plus feutrée, voix haute une octave plus bas, clapotis plus rares/doux).
- « Figer l'heure » : interrupteur des Options, glisse en 3 s vers l'après-midi ; préférence
  `<clé>:heure` hors sauvegarde de partie.

## Bâtiments
- **Embarcadère** (`embarcadere`, étape 21) : 1x1 au bord du terrain, modèle tourné vers l'eau la plus proche
  (`catalog.orient`, rendu seul, `rotation` reste 0) : caisses, ponton de planches sur pieux, lanterne ambre au
  bout (éteinte en pause), barque amarrée. `BuildingManager.update` : la barque s'éloigne puis revient au fil
  du cycle (`sin²(π·prodTicks/intervalle)`, lissé) ; à quai en pause. Son : deux coups de rame + clapotis
  (`AUDIO.sfx.row`, ≤ 1 / 2 s) à chaque Relique ; étincelle coquillage (`relic`).
- **Phare du Lac** (`lighthouse`, étape 13) : unique (`unique`, refus `'unique'`), emprise 2x2,
  débloqué par `unlock.missives: 5` (la Simulation lit `story.missives` = le Journal). 5 paliers
  (`stages[i].cost`, Savoirs + Présages croissants) : la pose paie `stages[0]` → `record.stage = 1` ;
  `sim.elevate(uid)` paie le suivant (`'cost'` / `'complete'`). `stageBoost` : +10 % par palier sur
  toutes les sorties des Bibliothèques (renfort d'aura compris), calculé au début de `#run` comme les
  auras ⇒ continu = hors ligne. Quantités arrondies au millionième (`roundAmount`) contre la dérive.
  Modèle reconstruit à chaque palier (`syncViews` compare `userData.stage`) : fondations, base, fût,
  galerie, lanterne ambre + halo. `PointLight` ambre (`DAYCYCLE.beacon`) = intensité × `night`.
  Panneau parchemin non bloquant au-dessus de la barre (tap sur la case ou la silhouette, ou outil
  « Palier n / 5 ») : palier, effet, coût du suivant, manque, « Élever » (grisé mais cliquable → refus).
  Missives 6–10 (`kind: 'stage'`) et 5 fragments ; le dernier (`finale: true`) joue `playFinale`.
- **Sanctuaire** (`sanctuary`) : emprise 1x1, silhouette basse et large (≈ 0,5 de haut).
  Dalle ronde de pierre claire, six pierres dressées d'ardoise inclinées, vasque, braise
  ambre non éclairée et halo translucide (sans ombre). Ne produit rien (aucun `prodTicks`).
  Placement : 8 cases teintées d'ambre (`AuraPreview`) + grand cadre ambre respirant
  autour des Bibliothèques qui seraient renforcées. Bibliothèque renforcée : liseré
  pointillé ambre pâle au sol autour du socle (`buildBoostMarker`, via
  `buildings.syncViews(sim.boosts())`).
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

## Lac (render/lake.js, LAKE dans config.js)
- Décor seul (ni simulation ni sauvegarde). **Un seul plan d'eau** (320 u de côté, y = −0,3) sous tout le domaine,
  posé dessus comme une presqu'île ; berge de sable 1 u tout autour (même boîte tournée par quarts de tour).
  Rive principale ouest/nord : ponton, barque, roseaux (`InstancedMesh`), galets. Caméra à 150 u (near/far) pour
  que le plan ne soit jamais coupé.
- Shader pixel : motif ancré au monde sur une grille alignée sur l'écran de jeu (texel d'eau = empreinte à l'écran d'un
  texel du sol, 2:1) ⇒ il suit le zoom comme l'île (titre compris), trame de brume dans ces mêmes texels ; animation en marches (5 pas/s) : aplats, tirets de reflet, rangées décalées d'1 px, écume de berge.
  Couleurs jour/nuit (`PALETTE.water*`), reflets = couleur du soleil puis lune. Vers les bords de l'écran : brume
  en 4 paliers tramés (Bayer 4x4) de la couleur de l'heure (ciel × eau profonde), qui est aussi `scene.background`.
- La nuit : reflets ambre brisés des ouvertures à < 6 u d'une berge (8 au plus, hors pause) et de la lanterne,
  perpendiculaires à la rive la plus proche ; faisceau du Phare tracé sur l'eau (`beam.state`).
  Son du lac panoramiqué (`AUDIO.water.pan` −0,25). Visiteurs : la moitié se lève au-dessus de l'eau à l'ouest.

## Îlots du lac (render/islands.js, world/islands.js)
- Aulnes (est, 7x7, bosquet + cabane), Pierres (sud, 8x8, rochers + chapelle en ruine), Roseaux (nord, 6x6, roseaux +
  barque retournée). Décor sur la berge seulement : toutes les cases sont constructibles. Ombres du décor selon la qualité.
- Brume : matériaux translucides (opacité 0,38, sans ombre ni contour) + bancs de brume tramés (sprites, couleur de l'heure).
  Tap/clic sur un îlot visible → panneau parchemin (nom, coût, « Rallier », grisé mais cliquable si trop cher).
- Ralliement : brume levée 4,5 s, passerelle planche par planche (3,5 s), phrase `playRally` (remplace la phrase de fragment).
  Limites caméra = domaine + îlots ralliés (`iso.setBounds`) ; carte d'ombres élargie (`setShadowReach`, soleil reculé).
  Écume du lac autour des îlots visibles ; reflets ambre réservés aux ouvertures du domaine.

## Qualité graphique et performances (render/quality.js, merge.js, buildings/batches.js, QUALITY)
- Options : Auto (défaut) / Basse / Normale / Haute ; compteur d'images masqué / affiché / **détaillé** (appels, triangles,
  géométries, textures, programmes, lumières, matériaux ; `pixel.stats()`, `info.autoReset = false`). Préférence
  `<clé>:qualite` `{ choice, fps: false|true|'detail' }`. La résolution interne ne change jamais.
- Basse : sans ombres (ni passe d'ombre), eau simplifiée (écume fixe, peu de reflets, 2,5 pas/s), brume figée, cadres
  fixes, sans lumière de lanterne, 30 i/s max. Normale : comportement d'origine. Haute : ombres 2048², plus de reflets,
  roseaux qui ondulent (4 pas/s).
- Modèles : pièces fixes fusionnées par matériau (`compactModel`, géométrie en cache par type, `userData.shared` : jamais
  libérée avec un modèle ; le Phare, unique, sans cache). Bâtiments non uniques : maillages cachés, recopiés chaque image
  dans des `InstancedMesh` communs (position, apparition, barque, matériau allumé/éteint). Lac : décor fusionné.
- Cadence : pleine si titre, fin, placement, caméra qui bouge, geste < 1,5 s, apparition, visiteur, faisceau, îlot qui se
  dévoile ; sinon `idleFps` (5/10/15) relevé pour qu'une barque ou un symbole avance d'≤ 1 px par image. La simulation
  tourne à chaque image. L'automatique ne mesure qu'à pleine cadence.
- Auto : en jeu seulement, après 3 s, médiane de 5 tranches d'1 s (≥ 55 → Haute, ≥ 38 → Normale, sinon Basse), puis ne
  fait que descendre d'un cran (< 26 i/s pendant 10 s, au plus une fois par 30 s). Testé sous Node.

## Séquence de fin (main.js, ui/ending.js, story/ending.js, render/beam.js)
- Déclenchée quand le Phare est achevé et `progress.finished` faux : après le fragment final (abonnement
  simulation) ou à « Continuer » (partie migrée, page fermée en cours). Interface de jeu masquée
  (`body.ending-mode`), contrôles coupés (`controls.enabled`), visiteurs suspendus, simulation continue.
- Chronologie (`ENDING_TIMES`) : 0–5 s caméra vers le Phare (smoothstep, zoom ≈ ×1,9) pendant que la nuit
  tombe (`day.holdNight`, 4 s) ; 5,5 s la lanterne s'allume (lumière + faisceau montent en 2 s) ; 12,5 s
  dernière lettre → générique + résumé (durée, bâtiments, Savoirs/Présages cumulés, visiteurs) →
  « Continuer à veiller ». Échap ou « Passer » terminent à tout moment.
- Fin : `progress.finished = true` (sauvé), nuit relâchée en 6 s, cycle repris. Mode libre : faisceau
  chaque nuit. Carnet : « Le Phare veille » + relecture de la lettre. Titre : lanterne près de « Continuer ».
- Pas de lac modélisé : le faisceau balaie au-delà du terrain. Durée de jeu = jeu actif seulement (≤ 1 s/image).

## Écran titre (ui/title.js, story/intro.js)
- Au chargement : titre + sous-titre, « Continuer » (si sauvegarde, résumé : bâtiments, palier du
  Phare), « Nouvelle partie », « Options » (même panneau qu'en jeu, par-dessus). Scène en orbite
  lente (`iso.setOrbit`, 1 tour / 150 s) avec le cycle jour/nuit ; interface de jeu masquée
  (`body.title-mode`). Le premier clic démarre l'audio (écoute globale de SoundScape).
- **Simulation figée et aucune écriture** pendant le titre (`playing = false`, `saver.enabled = false`,
  visibilitychange ignoré). « Continuer » crédite `Date.now() − savedAt` (temps du titre compris),
  sauvegarde, puis affiche le panneau de retour après le fondu.
- « Nouvelle partie » : avec sauvegarde → confirmation existante → effacement + drapeau de session
  `<clé>:intro` → rechargement → lettre directement ; sans sauvegarde → lettre. « Prendre la charge »
  lance le jeu (la lettre annonce la 1re missive).
- Fondu : menu → voile ardoise (0,6 s), vue de jeu remise en place sous le voile, voile levé (0,9 s)
  pendant que l'interface apparaît. Titre en haut, boutons en bas (scène visible au centre), 390 px OK.

## Interface
- **Options** (étape 12) : sous le Carnet, deux boutons carrés discrets (son rapide, engrenage).
  L'engrenage ouvre le panneau parchemin « Options », non bloquant comme le Carnet (l'un ferme
  l'autre ; Échap / Refermer / re-clic) : interrupteur son + volume, interrupteur d'heure,
  « Nouvelle partie » (confirmation inchangée, par-dessus). Préférences : stockage inchangé.
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
- Barre d'outils : les outils (`#tools`) défilent horizontalement sans barre visible quand ils
  dépassent l'écran ; bord estompé (masque) du côté où il reste des boutons ; molette
  verticale → horizontale ; Annuler hors défilement, toujours visible. Vérifié à 390 px avec 5 outils.
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
- Nombres affichés toujours entiers (arrondi inférieur ; manque = arrondi supérieur) ; la simulation garde la valeur exacte. Vérifié avec 9,999999 Savoirs et 1,7 Présage.

## Caméra et contrôles
- Orthographique, azimut 45°, élévation **30°** (losanges 2:1 du pixel art iso).
  Orientation fixe (pas de rotation pour l'instant).
- Échelle : `CAMERA.pixelsPerUnit` (12) px internes par unité à zoom 1 ;
  zoom borné `[0.35, 3]`, zoom initial ajusté pour voir toute la grille.
- Cible bornée à la grille + `panMargin`. Position alignée sur la grille des pixels
  internes (plan écran) pour éviter le scintillement des textures.
- Déplacement par « saisie » : le point du sol attrapé reste sous le pointeur/doigt (`iso.anchor`, recalé à chaque
  mouvement et chaque image). Réglages `CAMERA.inertia`, `zoomSpeed`, `zoomSmoothing`, `zoomStep`, `edge` (config.js).
- Glisse au relâchement (vitesse lissée du geste, friction exponentielle ; rien si immobile > 80 ms ou après un
  pincement) ; un appui arrête la glisse. Zoom (molette, pincement) interpolé vers le point visé, affiché par paliers
  de 0,5 px interne par unité. Limites souples : freinage du geste au-delà (×0,35, butée à +3 u), rappel doux.
  `iso.step(dt)` chaque image (hors séquence de fin) ; `iso.stop()` au départ du jeu et de la fin.
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
- **7** : mise en ligne GitHub Pages (workflow tests → déploiement, branche main), favicon et manifeste.
- **8** : Sanctuaire (aura +1 Savoir aux Bibliothèques voisines, sans cumul, dans le moteur unique), aperçu d'aura, repère des renforcées ; format de sauvegarde inchangé.
- **9** : Missives (5 objectifs guidés, 5 fragments), rappel repliable, rattrapage au chargement, sauvegarde v4 ; barre d'outils défilante (5+ outils à 390 px).
- **10** : ambiance sonore Web Audio (nappe, lac, 5 sons de jeu pentatoniques plafonnés), bouton son + volume, préférence à part.
- **11** : cycle jour/nuit de 8 min (lumière, ciel, lueurs, sons), heure sauvegardée (v5), option « figer l'heure ».
- **12** : panneau Options (engrenage) : son, volume, heure, Nouvelle partie ; seul le bouton son rapide reste en jeu.
- **13** : Phare du Lac (unique, 5 paliers, +10 %/palier aux Bibliothèques, lumière de nuit), 5 missives et 5 fragments, phrase finale, sauvegarde v6.
- **14** : écran titre (orbite lente, Continuer avec résumé, Nouvelle partie, Options), lettre d'introduction, hors ligne crédité à « Continuer », fondu.
- **15** : simulateur d'équilibrage `tools/playtest.mjs` (3 profils, jalons, attentes, propositions) ; jeu inchangé.
- **16** : coûts géométriques (`costGrowth`), paliers du Phare ×8, Phare en ≈ 56 min (équilibré) ; terrain 24x24 (sauvegarde v7, +4), ombres 768² ; refus `room` gardant une place 2x2 au Phare.
- **17** : Visiteurs du lac (feu follet à attraper, cadeau par la simulation, 20 s de Savoirs ou Présages), fragment caché à 10, sauvegarde v8, profil simulateur (≈ −9 %).
- **18** : séquence de fin (caméra, nuit, lanterne, faisceau, lettre, générique, résumé), mode libre, Carnet « Le Phare veille », marque au titre, sauvegarde v9.
- **19** : lac : un plan d'eau pixel sous tout le domaine (presqu'île, berge autour, brume tramée aux bords, jour/nuit, reflets ambre, faisceau sur l'eau), ponton, barque, roseaux, son panoramiqué, visiteurs venus de l'eau ; sauvegarde inchangée.
- **20** : qualité graphique adaptative (Auto/Basse/Normale/Haute : reflets, ondulation, ombres, clapotis, lumières de nuit), compteur d'i/s, préférence à part.
- **21** : chapitre II : Embarcadère (bord de l'eau, barque animée, 3 Présages → 1 Relique), Reliques, 5 missives et 5 fragments « Chapitre II », sauvegarde v10, simulateur étendu (≈ 37 min).
- **22** : îlots du lac (3, en Reliques, brume, passerelle, fragments), terrain en zones (`Terrain`), caméra/ombres élargies, sauvegarde v11, simulateur ≈ 37 min.
- **TODO 1** : caméra (eau au zoom de l'île, glisse avec inertie, zoom doux vers le point visé par paliers, limites souples) ; correctif : brume des îlots visible à tort en nouvelle partie.
- **TODO 2** : performances : fusion + instanciation (1067 → ~215 appels de dessin en partie avancée), rendu à cadence réduite au repos, niveaux Basse/Normale/Haute visiblement différents, compteur détaillé, libérations corrigées.
