export const PASSWORD_POLICY_HINT =
  "Use at least 8 characters with 1 uppercase letter, 1 number, and 1 symbol.";

export const PASSWORD_POLICY_ERROR =
  "Password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol.";

const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function isStrongPassword(value: string): boolean {
  return STRONG_PASSWORD_REGEX.test(value);
}
