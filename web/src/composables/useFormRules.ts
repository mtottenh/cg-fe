export function useFormRules() {
  return {
    required: (v: string) => !!v || 'Required',
    email: (v: string) => /.+@.+\..+/.test(v) || 'Invalid email',
    minLength: (min: number) => (v: string) =>
      v.length >= min || `Must be at least ${min} characters`,
    maxLength: (max: number) => (v: string) =>
      v.length <= max || `Must be at most ${max} characters`,
  }
}
