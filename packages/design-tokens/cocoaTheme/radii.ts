/**
 * *  @remarks
 * Radii values reminder
 * ```
 * NONE: 0,
 * CHECKBOX: 4,
 * BAR_CHART: 12,
 * INPUT: 12,
 * BANNER: 16,
 * CONTAINER: 16,
 * CARD: 16,
 * MODAL: 28,
 * CHAT_INPUT_FIELD: 32,
 * BUTTON: 1000,
 * PROGRESS_BAR: 1000,
 * ICON: 1000,
 * PILL: 1000,
 * S_CONTAINER: 16,
 * M_CONTAINER: 16,
 * L_CONTAINER: 16,
 * CHAT_CONTAINER: 16,
 * CHAT_BUTTONS: 1000
 * ```
 */

const foundationalRadii = {
  NONE: 0,
  XS: 4,
  S: 12,
  M: 16,
  L: 28,
  XL: 32,
  XXL: 1000,
} as const;

export const Radii = {
  NONE: foundationalRadii.NONE,
  CHECKBOX: foundationalRadii.XS,
  BAR_CHART: foundationalRadii.S,
  INPUT: foundationalRadii.S,
  BANNER: foundationalRadii.M,
  CONTAINER: foundationalRadii.M,
  CARD: foundationalRadii.M,
  MODAL: foundationalRadii.L,
  CHAT_INPUT_FIELD: foundationalRadii.XL,
  BUTTON: foundationalRadii.XXL,
  PROGRESS_BAR: foundationalRadii.XXL,
  ICON: foundationalRadii.XXL,
  TOOLTIP: foundationalRadii.S,
  SNACKBAR: foundationalRadii.S,
  PILL: foundationalRadii.XXL /** @deprecated **/,
  S_CONTAINER: foundationalRadii.M /** @deprecated **/,
  M_CONTAINER: foundationalRadii.M /** @deprecated **/,
  L_CONTAINER: foundationalRadii.M /** @deprecated **/,
  CHAT_CONTAINER: foundationalRadii.M /** @deprecated **/,
  CHAT_BUTTONS: foundationalRadii.XXL /** @deprecated **/,
};
