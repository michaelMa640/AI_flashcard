export const desktopAppInfo = {
  name: "AI Flashcard",
  phase: "V1 Step 6",
  targetPlatforms: ["macOS", "Windows"],
  stack: ["Electron", "TypeScript", "Vite"],
} as const;

export type DesktopAppInfo = typeof desktopAppInfo;
