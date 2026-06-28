const MEMBERS_KEY = "ff_members";
const PERSONS_KEY = "ff_persons";

export function getMembers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MEMBERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function setMembers(members: string[]): void {
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
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
