// Interface HTML par-dessus le canvas : barre d'outils parchemin et bulle d'aide.
// Le module ne connaît pas la 3D : il émet des intentions (onSelect, onCancel)
// et affiche l'état qu'on lui donne.

const REFUSALS = {
  occupied: 'Cet emplacement est déjà occupé.',
  bounds: 'Le bâtiment dépasse du terrain.',
};

export class UI {
  constructor({ onSelect, onCancel }) {
    this.hint = document.getElementById('hint');
    this.cancelButton = document.getElementById('cancel');
    this.tools = [...document.querySelectorAll('.tool[data-building]')];

    for (const tool of this.tools) {
      tool.addEventListener('click', () => {
        const type = tool.dataset.building;
        if (tool.getAttribute('aria-pressed') === 'true') onCancel();
        else onSelect(type);
      });
    }
    this.cancelButton.addEventListener('click', () => onCancel());
  }

  // État courant du mode placement → boutons et aide.
  render({ placing, name, check, pointerType }) {
    for (const tool of this.tools) {
      tool.setAttribute('aria-pressed', String(tool.dataset.building === placing));
    }
    this.cancelButton.hidden = !placing;

    if (!placing) {
      this.hint.hidden = true;
      return;
    }
    const touch = pointerType === 'touch' || pointerType === 'pen';
    const howTo = touch
      ? 'Touchez une case pour poser · glissez pour viser\n2 doigts pour déplacer la vue'
      : 'Clic : poser · clic droit ou Échap : annuler';
    const refusal = check && !check.ok ? REFUSALS[check.reason] : null;
    this.hint.textContent = `${name}\n${refusal || howTo}`;
    this.hint.hidden = false;
  }
}
