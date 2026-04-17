export type PasswordStrength = 0 | 1 | 2 | 3;

export function passwordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 12) score = Math.min(3, score + 1) as PasswordStrength;
  return Math.min(3, score) as PasswordStrength;
}

export function passwordStrengthLabel(s: PasswordStrength): string {
  return ["Muito fraca", "Fraca", "Média", "Forte"][s];
}
