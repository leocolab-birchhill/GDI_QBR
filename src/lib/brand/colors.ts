/**
 * GDI corporate palette — sampled from the logo (assets/GDI.TO-23b07516.png).
 * Blue matches deckTheme BRAND.primary (#00467F).
 */
export const GDI_COLORS = {
  blue: "#00467F",
  green: "#00853F",
  red: "#9F0B10",
  navy: "#002060",
  blueMid: "#156C9C",
  text: "#1A1A1A",
  textMuted: "#646464",
  border: "#DEE0E3",
  /** Light blue tint for accents / email context boxes */
  blueTint: "#E8F1F8",
  white: "#FFFFFF",
} as const;

/** HSL tuples for Tailwind CSS variables (hue saturation% lightness%). */
export const GDI_CSS = {
  primary: "207 100% 25%",
  primaryForeground: "0 0% 100%",
  accent: "207 45% 94%",
  accentForeground: "207 100% 22%",
  ring: "207 100% 25%",
  destructive: "358 87% 38%",
  mutedForeground: "207 12% 42%",
} as const;
