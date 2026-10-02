import { expect, type Locator, type Page } from "@playwright/test";

export async function expectReadableText(locator: Locator) {
  const luminance = (color: string) => {
    const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
    if (!match) throw new Error(`Expected opaque RGB color, received ${color}`);
    const channels = match.slice(1).map(value => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  // Existing control color transitions must settle before assessing the palette.
  await expect.poll(async () => {
    const colors = await locator.evaluate(element => {
      let surface: Element | null = element;
      while (surface && ["rgba(0, 0, 0, 0)", "transparent"].includes(getComputedStyle(surface).backgroundColor)) surface = surface.parentElement;
      if (!surface) throw new Error("Expected an opaque text surface");
      return { foreground: getComputedStyle(element).color, background: getComputedStyle(surface).backgroundColor };
    });
    const foreground = luminance(colors.foreground);
    const background = luminance(colors.background);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  }, { message: "Rendered content must have readable contrast after color transitions" }).toBeGreaterThanOrEqual(4.5);
}

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
      ["control-border", "background"],
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
