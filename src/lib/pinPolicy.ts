/** Pure PIN format policy shared by the UI and automated tests. */
export function isAppPinFormatValid(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
