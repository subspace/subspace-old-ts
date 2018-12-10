/**
 * This only covers minimal surface touched by this project, not entire library
 */
declare module 'array-map-set' {
  export function ArrayMap<Key extends Uint8Array, T>(array?: Array<[Key, T]>): Map<Key, T>;
  export function ArraySet(array?: Array<Uint8Array>): Set<Uint8Array>;
}
