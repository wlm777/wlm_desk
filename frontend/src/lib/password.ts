export interface PasswordCheck {
  label: string;
  valid: boolean;
}

const WEAK_PASSWORDS = [
  "password123", "qwerty123!", "admin123!", "password1!", "123456789a!",
  "letmein123!", "welcome123!", "changeme12!", "password12!", "iloveyou12!",
];

export function validatePassword(password: string): PasswordCheck[] {
  const lower = password.toLowerCase();
  return [
    { label: "At least 12 characters", valid: password.length >= 12 },
    { label: "At least 1 uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "At least 1 lowercase letter", valid: /[a-z]/.test(password) },
    { label: "At least 1 number", valid: /[0-9]/.test(password) },
    { label: "At least 1 special character", valid: /[^A-Za-z0-9]/.test(password) },
    { label: "Not a common weak password", valid: !WEAK_PASSWORDS.includes(lower) },
  ];
}

export function isPasswordStrong(password: string): boolean {
  return validatePassword(password).every((c) => c.valid);
}
