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

    // Empty is valid — this rule constrains the VALUE, not whether one is present.
    // Pair it with `required` when a value is mandatory, exactly as `email` /
    // `minLength` / `url` / `uuid` above already behave.
    //
    // Without the empty guard, `null > 0` is false, so any form binding this to an
    // OPTIONAL field could never become valid. That is P-30: every newly created
    // season has `max_teams = null`, so LeagueSeasonEditModal's Save button was
    // permanently disabled and NO setting of a fresh season could be edited.
    //
    // Note `!v ||` (the idiom used by the string rules above) would be wrong here:
    // it treats 0 as empty, and 0 is not a positive number.
    positiveNumber: (v: number | string | null | undefined) =>
      v === null || v === undefined || v === '' || Number(v) > 0 || 'Must be a positive number',

    uuid: (v: string) => {
      if (!v) return true
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) || 'Must be a valid UUID'
    },
  }
}
