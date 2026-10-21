/** A bound key as the key's own plates print it: "SPACE", "CTRL", "K", "[". */
export function keyName(key: string): string {
  if (key === ' ') return 'SPACE'
  if (key === 'Control') return 'CTRL'
  if (key === 'ControlLeft') return 'LEFT CTRL'
  if (key === 'ControlRight') return 'RIGHT CTRL'
  return key.toUpperCase()
}
