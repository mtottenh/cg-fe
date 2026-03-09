export function updateById<T extends { id: string }>(
  array: T[],
  id: string,
  updates: Partial<T>,
): void {
  const idx = array.findIndex((x) => x.id === id)
  if (idx !== -1) array[idx] = { ...array[idx], ...updates } as T
}

export function replaceById<T extends { id: string }>(array: T[], item: T): void {
  const idx = array.findIndex((x) => x.id === item.id)
  if (idx !== -1) array[idx] = item
}

export function removeById<T extends { id: string }>(array: T[], id: string): void {
  const idx = array.findIndex((x) => x.id === id)
  if (idx !== -1) array.splice(idx, 1)
}

export function upsertById<T extends { id: string }>(array: T[], item: T): void {
  const idx = array.findIndex((x) => x.id === item.id)
  if (idx !== -1) array[idx] = item
  else array.push(item)
}
