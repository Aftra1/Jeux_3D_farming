// Séquence de fin (Phare achevé) : dernière lettre, générique, résumé et Carnet.
// Fichier de données à éditer librement.

export const ENDING = {
  letter: {
    title: 'Au gardien du Phare',
    paragraphs: [
      'La lanterne brûle, et le lac, pour la première fois depuis longtemps, a cessé d\'attendre.',
      'Cette nuit, des barques sans rameurs ont glissé jusqu\'à la rive ; nous n\'avons vu personne en descendre, mais les fenêtres du reflet se sont éteintes une à une, comme on souffle les lampes après un long voyage.',
      'Vous vous demandez sans doute qui tenait l\'autre lueur, tout au fond de l\'eau.',
      'Nous nous le demandons aussi, et nous avons appris qu\'il est des questions qu\'on garde allumées plutôt que de les résoudre.',
      'Le domaine est à vous, désormais : veillez-le aussi longtemps qu\'il vous plaira.',
    ],
    signature: '— La Société du Lac',
    next: 'Tourner la page',
  },
  credits: {
    title: 'La Société du Lac',
    lines: ['Un jeu de Aftra', 'Créé avec Claude'],
  },
  summary: {
    title: 'Votre veille',
    // stats = { playSeconds, buildings, knowledge, omens, visitors } (nombres bruts)
    rows: (s) => [
      ['Durée de jeu', formatDuration(s.playSeconds)],
      ['Bâtiments posés', String(s.buildings)],
      ['Savoirs cumulés', String(Math.floor(s.knowledge))],
      ['Présages cumulés', String(Math.floor(s.omens))],
      ['Visiteurs attrapés', String(s.visitors)],
    ],
  },
  skip: 'Passer',
  stay: 'Continuer à veiller',
  close: 'Refermer',
  // Carnet, une fois la partie terminée
  watch: 'Le Phare veille',
  reread: 'Relire la dernière lettre',
  // Écran titre : marque de la lanterne allumée
  titleMark: 'Partie terminée : le Phare veille',
};

// 3725 s → « 1 h 02 min » ; 125 s → « 2 min » ; < 1 min → « moins d'une minute ».
export function formatDuration(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return 'moins d\'une minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
