/**
 * The three states a piece of evidence can be in, and how each one looks.
 *
 * P-138. `validated` is a boolean, so every evidence surface rendered exactly
 * two states and a demo whose validation FAILED was displayed identically to
 * one nobody had checked yet. On the dispute-resolution surface those are
 * opposite facts: "we looked, and this demo contradicts the reported score" is
 * the finding the whole feature exists to produce, and it was being shown as
 * "nothing has happened".
 *
 * (The backend half was worse still: `mark_validated` wrote `validated = true`
 * unconditionally, so a failed validation lit the green chip. Fixed in
 * `portal-db/src/adapters/evidence.rs`.)
 *
 * The state is the PAIR — the verdict plus whether a check ran at all:
 *
 *   validated  validatedAt   state
 *   ─────────  ───────────   ─────────────────
 *   true       any           validated
 *   false      set           validation failed
 *   false      null          not yet validated
 */
export type EvidenceValidationState = 'validated' | 'failed' | 'unvalidated'

export interface ValidationDisplay {
  state: EvidenceValidationState
  label: string
  icon: string
  color: string
}

const DISPLAY: Record<EvidenceValidationState, ValidationDisplay> = {
  validated: {
    state: 'validated',
    label: 'Validated',
    icon: 'mdi-check-circle',
    color: 'success',
  },
  failed: {
    state: 'failed',
    label: 'Validation failed',
    icon: 'mdi-alert-circle',
    color: 'error',
  },
  unvalidated: {
    state: 'unvalidated',
    label: 'Not validated',
    icon: 'mdi-circle-outline',
    color: 'grey',
  },
}

/**
 * Resolve the display for a validated/validated_at pair.
 *
 * Both `EvidenceSummaryResponse` and `DemoMatchLinkResponse` carry this pair,
 * and both are rendered side by side in `EvidenceDisplay` — they must not
 * disagree about what a failed validation looks like.
 */
export function validationDisplay(
  validated: boolean,
  validatedAt: string | null | undefined,
): ValidationDisplay {
  if (validated) return DISPLAY.validated
  return validatedAt ? DISPLAY.failed : DISPLAY.unvalidated
}

/**
 * The reasons a validation failed, read off a stored verdict blob.
 *
 * `DemoMatchLinkResponse.validation_result` is the serialized
 * `EvidenceValidation`, typed on the wire as an opaque JSON value.
 * `EvidenceSummaryResponse` publishes `validation_errors` directly, so this is
 * only needed for the link row.
 */
export function validationErrorsOf(result: unknown): string[] {
  if (!result || typeof result !== 'object') return []
  const errors = (result as { errors?: unknown }).errors
  if (!Array.isArray(errors)) return []
  return errors.filter((e): e is string => typeof e === 'string')
}
