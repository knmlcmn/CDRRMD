export function retainLastMapLocation<T>(
  retainedLocation: T | null,
  liveLocation: T | null,
) {
  return liveLocation ?? retainedLocation;
}
