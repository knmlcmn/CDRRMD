export function sameData(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function keepIfEqual<T>(current: T, next: T): T {
  return sameData(current, next) ? current : next;
}
