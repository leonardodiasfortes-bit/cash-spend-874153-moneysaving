const MEMBERS_KEY = "ff_members";
const PERSONS_KEY = "ff_persons";

/** Explicit "Compartilhado" tag — distinct from having no tag at all. */
export const SHARED_PERSON = "__shared__";

export function personLabel(value: string): string {
  return value === SHARED_PERSON ? "Compartilhado" : value;
}

/** Legacy per-browser member list — kept only so InventoryTab can offer a
 * one-time "importar deste navegador" into the synced `members` table. */
export function getMembers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MEMBERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getPersonMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PERSONS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function savePerson(txId: string, person: string | null): void {
  const map = getPersonMap();
  if (person) map[txId] = person;
  else delete map[txId];
  localStorage.setItem(PERSONS_KEY, JSON.stringify(map));
}

export function savePersons(txIds: string[], person: string | null): void {
  const map = getPersonMap();
  for (const id of txIds) {
    if (person) map[id] = person;
    else delete map[id];
  }
  localStorage.setItem(PERSONS_KEY, JSON.stringify(map));
}
