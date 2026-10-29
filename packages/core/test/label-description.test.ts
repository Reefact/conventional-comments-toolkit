// `labels[].description` (§8.2) : la définition qu'une organisation ou un dépôt écrit pour un
// label — le sien, ou un label livré comme `issue`. L'interface la rend en infobulle (§5.1, §5.5) ;
// ici, ce que `core/` en fait : la lire, la fusionner, et la laisser hors de l'empreinte.
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import { defaultConfig } from '../src/config/defaults.js';
import { fingerprint } from '../src/config/fingerprint.js';
import type { ConfigRead } from '../src/types.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });
const describedAs = (resolved: ReturnType<typeof resolveConfig>, id: string) =>
  resolved.config.labels.find((l) => l.id === id)?.description;

describe('`labels[].description` (§8.2)', () => {
  it('un dépôt la déclare sur son propre label, sans avertissement', () => {
    const r = resolveConfig(null, absent, found({ labels: [{ id: 'risk', description: 'Risque de régression.' }] }));
    expect(describedAs(r, 'risk')).toBe('Risque de régression.');
    expect(r.notices.filter((n) => n.message.includes('description'))).toEqual([]);
  });

  it('écrite sur un label livré, elle le décrit ; absente, le label livré n’en porte aucune', () => {
    const r = resolveConfig(null, absent, found({ labels: [{ id: 'issue', description: 'Un défaut qui casse un contrat.' }] }));
    expect(describedAs(r, 'issue')).toBe('Un défaut qui casse un contrat.');
    expect(describedAs(r, 'todo')).toBeUndefined();
    expect(defaultConfig().labels.every((l) => l.description === undefined)).toBe(true);
  });

  it('vide, elle est gardée telle quelle — `""` est une décision, pas une absence', () => {
    const r = resolveConfig(null, absent, found({ labels: [{ id: 'issue', description: '' }] }));
    expect(describedAs(r, 'issue')).toBe('');
  });

  it('fusion par niveau (§8.1.4) : le dépôt surcharge l’organisation, et la garde s’il ne l’écrit pas', () => {
    const org = found({ labels: [{ id: 'issue', description: 'Version de l’organisation.' }] });
    expect(describedAs(resolveConfig(null, org, found({ labels: [{ id: 'issue', description: 'Version du dépôt.' }] })), 'issue')).toBe(
      'Version du dépôt.'
    );
    expect(describedAs(resolveConfig(null, org, found({ labels: [{ id: 'issue', description: '' }] })), 'issue')).toBe('');
    expect(describedAs(resolveConfig(null, org, found({ labels: [{ id: 'issue', color: '#E04E45' }] })), 'issue')).toBe(
      'Version de l’organisation.'
    );
  });

  it('une valeur qui n’est pas une chaîne est refusée et signalée', () => {
    const r = resolveConfig(null, absent, found({ labels: [{ id: 'issue', description: 42 }] }));
    expect(describedAs(r, 'issue')).toBeUndefined();
    expect(r.notices.some((n) => n.message.includes('"description" of label "issue" must be a string'))).toBe(true);
  });

  it('n’entre pas dans l’empreinte : elle ne change aucun verdict (§9.2.2)', () => {
    const base = fingerprint(resolveConfig(null, absent, found({ labels: [{ id: 'issue' }] })).config);
    expect(fingerprint(resolveConfig(null, absent, found({ labels: [{ id: 'issue', description: 'Autre chose.' }] })).config)).toBe(base);
    expect(fingerprint(resolveConfig(null, absent, found({ labels: [{ id: 'issue', description: '' }] })).config)).toBe(base);
  });
});
