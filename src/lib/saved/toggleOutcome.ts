export type SavedToggleOutcome = "saved" | "removed" | "rolled-back";

export function resolveSavedToggleOutcome(
  wasSaved: boolean,
  nowSaved: boolean
): SavedToggleOutcome {
  if (wasSaved && !nowSaved) return "removed";
  if (!wasSaved && nowSaved) return "saved";
  return "rolled-back";
}