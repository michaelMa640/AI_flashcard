export const desktopAppInfo = {
  name: "AI Flashcard",
  phase: "V2 Step 4",
  targetPlatforms: ["macOS", "Windows"],
  stack: ["Electron", "TypeScript", "Vite"],
} as const;

export type DesktopAppInfo = typeof desktopAppInfo;
