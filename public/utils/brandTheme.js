(() => {
  const DEFAULT_ACCENT_COLOR = "#5a9c69";

  const normalizeAccentColor = (value) => {
    const raw = typeof value === "string" ? value.trim() : "";
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const expanded = hex
        .split("")
        .map((char) => `${char}${char}`)
        .join("");
      return `#${expanded.toLowerCase()}`;
    }
    return DEFAULT_ACCENT_COLOR;
  };

  const hexToRgb = (hexColor) => {
    const normalized = normalizeAccentColor(hexColor).slice(1);
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16)
    };
  };

  const relativeLuminance = ({ r, g, b }) => {
    const normalizeChannel = (channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * normalizeChannel(r) +
      0.7152 * normalizeChannel(g) +
      0.0722 * normalizeChannel(b)
    );
  };

  const buildAccentPalette = (hexColor) => {
    const normalized = normalizeAccentColor(hexColor);
    const { r, g, b } = hexToRgb(normalized);
    const isLightAccent = relativeLuminance({ r, g, b }) > 0.34;
    return {
      primary: normalized,
      soft: `rgba(${r}, ${g}, ${b}, 0.12)`,
      border: `rgba(${r}, ${g}, ${b}, 0.35)`,
      muted: `rgba(${r}, ${g}, ${b}, 0.18)`,
      text: isLightAccent ? "#14532d" : `rgba(${r}, ${g}, ${b}, 0.92)`,
      buttonText: isLightAccent ? "#14532d" : "#ffffff"
    };
  };

  window.InvoiceBrandTheme = {
    DEFAULT_ACCENT_COLOR,
    normalizeAccentColor,
    hexToRgb,
    buildAccentPalette
  };
})();
