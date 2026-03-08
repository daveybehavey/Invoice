(() => {
  const normalizeSnippet = (text) =>
    String(text ?? "")
      .toLowerCase()
      .replace(/[’‘‛]/g, "'")
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const extractKeywords = (text) =>
    normalizeSnippet(text)
      .split(" ")
      .filter((word) => word.length >= 4);

  window.InvoiceIntakeHelpers = {
    normalizeSnippet,
    extractKeywords
  };
})();
