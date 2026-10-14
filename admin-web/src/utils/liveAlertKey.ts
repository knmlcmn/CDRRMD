export function liveAlertKey(id: number, timestamp: string | null | undefined) {
  return `${id}:${timestamp || ''}`;
}

export function removeAlertKeysForId(keys: Set<string>, id: number) {
  const prefix = `${id}:`;
  return new Set([...keys].filter((key) => !key.startsWith(prefix)));
}
