import { expect, type Page } from "@playwright/test";

// WCAG relative luminance, independent of the application's token definitions.
export async function expectFinancialTokenContrast(page: Page) {
  const pairs = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return [
      ["foreground", "background"],
      ["muted-foreground", "background"],
      ["destructive", "background"],
      ["warning", "warning-surface"],
      ["success", "success-surface"],
    ].map(([foreground, background]) => ({
      name: `${foreground} on ${background}`,
      foreground: styles.getPropertyValue(`--${foreground}`).trim(),
      background: styles.getPropertyValue(`--${background}`).trim(),
    }));
  });
  const luminance = (hex: string) => {
    expect(hex).toMatch(/^#[\da-f]{6}$/iu);
    const channels = [1, 3, 5].map((offset) => {
      const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const pair of pairs) {
    const foreground = luminance(pair.foreground);
    const background = luminance(pair.background);
    const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    expect(ratio, pair.name).toBeGreaterThanOrEqual(4.5);
  }
}
