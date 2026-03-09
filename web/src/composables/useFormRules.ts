export function useFormRules() {
  return {
    required: (v: unknown) =>
      (v !== '' && v !== null && v !== undefined) || 'Required',

    email: (v: string) =>
      !v || /.+@.+\..+/.test(v) || 'Invalid email',

    minLength: (min: number) => (v: string) =>
      !v || v.length >= min || `Must be at least ${min} characters`,

    maxLength: (max: number) => (v: string) =>
      !v || v.length <= max || `Must be at most ${max} characters`,

    minValue: (min: number) => (v: number) =>
      v >= min || `Minimum value is ${min}`,

    maxValue: (max: number) => (v: number) =>
      v <= max || `Maximum value is ${max}`,

    slug: (v: string) => {
      if (!v) return true
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(v)) {
        return 'Must be lowercase letters, numbers, and hyphens. Must start and end with letter or number.'
      }
      return true
    },

    url: (v: string) => {
      if (!v) return true
      try {
        new URL(v)
        return true
      } catch {
        return 'Must be a valid URL'
      }
    },

    positiveNumber: (v: number) =>
      v > 0 || 'Must be a positive number',

    uuid: (v: string) => {
      if (!v) return true
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) || 'Must be a valid UUID'
    },
  }
}
