export type ToolCategory =
  | "power_tools"
  | "garden"
  | "kitchen"
  | "camping"
  | "other";

export type ToolCondition = "new" | "good" | "fair" | "worn";

export const TOOL_CATEGORIES: { value: ToolCategory; label: string }[] = [
  { value: "power_tools", label: "Power Tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "other", label: "Other" },
];

export const TOOL_CONDITIONS: { value: ToolCondition; label: string }[] = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "worn", label: "Worn" },
];

export function formatCategoryLabel(category: string): string {
  const found = TOOL_CATEGORIES.find((c) => c.value === category);
  return found ? found.label : category;
}

export function formatConditionLabel(condition: string): string {
  const found = TOOL_CONDITIONS.find((c) => c.value === condition);
  return found ? found.label : condition;
}

export function formatRelativeTime(timestampMs: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSeconds < 60) {
    return "just now";
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

