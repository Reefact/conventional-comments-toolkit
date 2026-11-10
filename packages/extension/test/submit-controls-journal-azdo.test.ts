// @vitest-environment happy-dom
// CA-11 — sur les captures de cette plateforme : une page saine n'écrit rien au journal, la même
// page privée des boutons d'envoi d'un composeur écrit la ligne (§9.4, #168). Un fichier par
// plateforme, donc un worker chacune : voir `helpers/submit-journal.ts`.
import { describeOnCaptures } from './helpers/submit-journal.js';

describeOnCaptures('azdo');
