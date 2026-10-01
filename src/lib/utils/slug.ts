export function formatDestinationSlug(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .split(",")[0] // Handle "Tokyo, Japan" -> "tokyo"
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Collapse consecutive hyphens
}

export function slugToTitle(slug: string): string {
  if (!slug) return "";
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeDestination(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}
