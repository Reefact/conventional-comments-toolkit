// La réponse de `getSubmitControls()` pour un faux adaptateur (§9.2.3, `SubmitControlsLookup`).
//
// Le contrat rend, avec les contrôles, la chaîne qui les a cherchés et le relevé de la page : c'est
// ce que le code partagé journalise quand la liste est vide (§9.4, #168). Un faux n'a ni chaîne ni
// page à relever ; il en déclare une, neutre, ici — à un seul endroit plutôt que dans chaque test.
import type { SelectorChain, SubmitControl, SubmitControlsLookup } from '@cct/adapter-shared';

export const FAKE_SUBMIT_CHAIN: SelectorChain = {
  name: 'submit-buttons',
  problem: 'submit-control',
  candidates: ['button.fake-submit'],
};

export function submitLookup(controls: SubmitControl[]): SubmitControlsLookup {
  return { controls, searched: FAKE_SUBMIT_CHAIN, evidence: () => ({}) };
}
