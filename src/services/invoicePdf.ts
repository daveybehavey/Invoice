import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { FinishedInvoice, InvoiceLineItem } from "../models/invoice.js";

type InvoicePdfInput = {
  invoice: FinishedInvoice;
  fromDetails?: string;
  billToDetails?: string;
  accentColor?: string;
  stylePreset?: string;
  logoUrl?: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN_X = 48;
const PAGE_TOP = PAGE_HEIGHT - 48;
const PAGE_BOTTOM = 52;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2;

const SLATE_900 = rgb(15 / 255, 23 / 255, 42 / 255);
const SLATE_700 = rgb(51 / 255, 65 / 255, 85 / 255);
const SLATE_600 = rgb(71 / 255, 85 / 255, 105 / 255);
const SLATE_500 = rgb(100 / 255, 116 / 255, 139 / 255);
const SLATE_300 = rgb(203 / 255, 213 / 255, 225 / 255);
const SLATE_200 = rgb(226 / 255, 232 / 255, 240 / 255);
const SURFACE = rgb(248 / 255, 250 / 255, 252 / 255);

const ACCENT_DEFAULT = rgb(15 / 255, 157 / 255, 110 / 255);

type PdfRenderState = {
  doc: PDFDocument;
  page: PDFPage;
  regularFont: PDFFont;
  boldFont: PDFFont;
  accent: ReturnType<typeof resolveAccentPalette>;
  cursorY: number;
  invoiceNumberLabel: string;
};

export async function createInvoicePdfBuffer(input: InvoicePdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = resolveAccentPalette(input.accentColor);
  const styleScale = resolveStyleScale(input.stylePreset);

  const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const state: PdfRenderState = {
    doc,
    page: firstPage,
    regularFont,
    boldFont,
    accent,
    cursorY: PAGE_TOP,
    invoiceNumberLabel: input.invoice.invoiceNumber?.trim() || "Draft"
  };

  const fromLines = splitMultilineText(input.fromDetails ?? "");
  const billToLines = splitMultilineText(input.billToDetails ?? input.invoice.customerName ?? "");
  const logo = await tryEmbedLogoImage(doc, input.logoUrl);

  renderHeader(state, {
    fromLines,
    issueDate: input.invoice.issueDate?.trim() || "Not set",
    logo,
    styleScale
  });
  renderPartyBlocks(state, { fromLines, billToLines, styleScale });
  renderLineItemsSection(state, { invoice: input.invoice, styleScale });
  renderTotalsPanel(state, { invoice: input.invoice, styleScale });
  renderNotes(state, { notes: input.invoice.notes ?? "", styleScale });
  renderFooter(state, { fromLines });

  const pdfBytes = await doc.save({ useObjectStreams: false });
  return Buffer.from(pdfBytes);
}

export function buildPdfFilename(invoiceNumber?: string): string {
  const rawValue = typeof invoiceNumber === "string" ? invoiceNumber.trim() : "";
  const normalized = rawValue
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = normalized.length > 0 ? normalized : "Draft";
  return `Invoice-${suffix}.pdf`;
}

function renderHeader(
  state: PdfRenderState,
  options: {
    fromLines: string[];
    issueDate: string;
    logo: PDFImage | null;
    styleScale: number;
  }
): void {
  const { fromLines, issueDate, logo, styleScale } = options;
  const { page, regularFont, boldFont, accent } = state;
  let leftCursor = PAGE_TOP;

  if (logo) {
    const scaled = logo.scale(1);
    const maxWidth = 110 * styleScale;
    const maxHeight = 56 * styleScale;
    const widthScale = maxWidth / scaled.width;
    const heightScale = maxHeight / scaled.height;
    const scale = Math.min(widthScale, heightScale, 1);
    const width = scaled.width * scale;
    const height = scaled.height * scale;
    page.drawImage(logo, {
      x: PAGE_MARGIN_X,
      y: leftCursor - height,
      width,
      height
    });
    leftCursor -= height + 10;
  }

  const businessName = fromLines[0] || "Your Business";
  page.drawText(businessName, {
    x: PAGE_MARGIN_X,
    y: leftCursor - 16,
    size: 14 * styleScale,
    font: boldFont,
    color: SLATE_900
  });
  leftCursor -= 24;

  const supportingLines = fromLines.slice(1, 3);
  for (const line of supportingLines) {
    page.drawText(line, {
      x: PAGE_MARGIN_X,
      y: leftCursor - 10,
      size: 9.5 * styleScale,
      font: regularFont,
      color: SLATE_600
    });
    leftCursor -= 13;
  }

  const title = "INVOICE";
  const titleSize = 30 * styleScale;
  const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
  const titleX = PAGE_WIDTH - PAGE_MARGIN_X - titleWidth;
  page.drawText(title, {
    x: titleX,
    y: PAGE_TOP - titleSize,
    size: titleSize,
    font: boldFont,
    color: SLATE_900
  });

  const metaBoxWidth = 216;
  const metaBoxHeight = 56;
  const metaBoxX = PAGE_WIDTH - PAGE_MARGIN_X - metaBoxWidth;
  const metaBoxY = PAGE_TOP - titleSize - 72;

  page.drawRectangle({
    x: metaBoxX,
    y: metaBoxY,
    width: metaBoxWidth,
    height: metaBoxHeight,
    borderColor: SLATE_200,
    borderWidth: 1,
    color: SURFACE
  });

  page.drawText("Invoice #", {
    x: metaBoxX + 12,
    y: metaBoxY + metaBoxHeight - 16,
    size: 9,
    font: boldFont,
    color: SLATE_500
  });
  page.drawText(state.invoiceNumberLabel, {
    x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(state.invoiceNumberLabel, 10.5),
    y: metaBoxY + metaBoxHeight - 17,
    size: 10.5,
    font: regularFont,
    color: SLATE_900
  });

  page.drawText("Date", {
    x: metaBoxX + 12,
    y: metaBoxY + 14,
    size: 9,
    font: boldFont,
    color: SLATE_500
  });
  page.drawText(issueDate, {
    x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(issueDate, 10.5),
    y: metaBoxY + 13,
    size: 10.5,
    font: regularFont,
    color: SLATE_900
  });

  const dividerY = Math.min(leftCursor - 10, metaBoxY - 14);
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y: dividerY },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: dividerY },
    thickness: 1.2,
    color: accent.primary
  });

  state.cursorY = dividerY - 18;
}

function renderPartyBlocks(
  state: PdfRenderState,
  options: { fromLines: string[]; billToLines: string[]; styleScale: number }
): void {
  const { fromLines, billToLines, styleScale } = options;
  ensureVerticalSpace(state, 120, false);

  const top = state.cursorY;
  const blockWidth = (CONTENT_WIDTH - 14) / 2;
  const minHeight = 92;
  const contentLines = Math.max(fromLines.length, billToLines.length, 1);
  const blockHeight = Math.max(minHeight, 38 + contentLines * 14);

  drawAddressBlock(state, {
    x: PAGE_MARGIN_X,
    top,
    width: blockWidth,
    height: blockHeight,
    title: "From",
    lines: fromLines.length > 0 ? fromLines : ["Add your business details"]
  });
  drawAddressBlock(state, {
    x: PAGE_MARGIN_X + blockWidth + 14,
    top,
    width: blockWidth,
    height: blockHeight,
    title: "Bill To",
    lines: billToLines.length > 0 ? billToLines : ["Add client details"]
  });

  state.cursorY = top - blockHeight - 20 * styleScale;
}

function drawAddressBlock(
  state: PdfRenderState,
  options: {
    x: number;
    top: number;
    width: number;
    height: number;
    title: string;
    lines: string[];
  }
): void {
  const { x, top, width, height, title, lines } = options;
  const { page, regularFont, boldFont, accent } = state;
  const bottom = top - height;

  page.drawRectangle({
    x,
    y: bottom,
    width,
    height,
    borderColor: SLATE_200,
    borderWidth: 1,
    color: rgb(1, 1, 1)
  });

  page.drawText(title, {
    x: x + 10,
    y: top - 16,
    size: 9,
    font: boldFont,
    color: accent.text
  });

  let lineY = top - 32;
  for (const line of lines.slice(0, 5)) {
    page.drawText(line, {
      x: x + 10,
      y: lineY,
      size: 10.5,
      font: regularFont,
      color: SLATE_700
    });
    lineY -= 13;
  }
}

function renderLineItemsSection(
  state: PdfRenderState,
  options: { invoice: FinishedInvoice; styleScale: number }
): void {
  const { invoice } = options;
  const groups = groupLineItems(invoice.lineItems);
  const showGroupHeaders = groups.length > 1;

  drawSectionTitle(state, "Line items");
  drawTableHeader(state);

  for (const group of groups) {
    if (showGroupHeaders) {
      ensureVerticalSpace(state, 26, true);
      state.page.drawRectangle({
        x: PAGE_MARGIN_X,
        y: state.cursorY - 18,
        width: CONTENT_WIDTH,
        height: 18,
        color: state.accent.soft,
        borderColor: state.accent.border,
        borderWidth: 0.5
      });
      state.page.drawText(group.label, {
        x: PAGE_MARGIN_X + 8,
        y: state.cursorY - 13.5,
        size: 9.5,
        font: state.boldFont,
        color: state.accent.text
      });
      state.cursorY -= 24;
    }

    for (const item of group.items) {
      const description = item.description.trim() || "Line item";
      const descriptionLines = wrapTextToWidth(description, state.boldFont, 10.75, 304, 3);
      const qtyText = formatQuantity(item.quantity);
      const rateText = formatRate(item.unitPrice);
      const detailsText = `Qty ${qtyText} x Rate ${rateText}`;
      const secondaryLines = wrapTextToWidth(detailsText, state.regularFont, 9, 304, 2);
      const amountValue = normalizeMoneyValue(
        item.amount,
        normalizeMoneyValue(item.quantity, 0) * normalizeMoneyValue(item.unitPrice, 0)
      );
      const amountText = formatMoney(amountValue);

      const rowHeight = Math.max(36, 12 + descriptionLines.length * 12 + secondaryLines.length * 10);
      ensureVerticalSpace(state, rowHeight + 8, true);

      state.page.drawLine({
        start: { x: PAGE_MARGIN_X, y: state.cursorY + 3 },
        end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: state.cursorY + 3 },
        thickness: 0.7,
        color: SLATE_200
      });

      let textY = state.cursorY - 9;
      for (const line of descriptionLines) {
        state.page.drawText(line, {
          x: PAGE_MARGIN_X + 10,
          y: textY,
          size: 10.75,
          font: state.boldFont,
          color: SLATE_900
        });
        textY -= 12;
      }
      for (const detailLine of secondaryLines) {
        state.page.drawText(detailLine, {
          x: PAGE_MARGIN_X + 10,
          y: textY,
          size: 9,
          font: state.regularFont,
          color: SLATE_500
        });
        textY -= 10;
      }

      state.page.drawText(amountText, {
        x: PAGE_WIDTH - PAGE_MARGIN_X - 10 - state.boldFont.widthOfTextAtSize(amountText, 11),
        y: state.cursorY - 10.5,
        size: 11,
        font: state.boldFont,
        color: SLATE_900
      });

      state.cursorY -= rowHeight;
    }
  }
}

function drawTableHeader(state: PdfRenderState): void {
  ensureVerticalSpace(state, 26, true);
  state.page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: state.cursorY - 18,
    width: CONTENT_WIDTH,
    height: 18,
    color: SURFACE,
    borderColor: SLATE_200,
    borderWidth: 1
  });
  state.page.drawText("Description", {
    x: PAGE_MARGIN_X + 10,
    y: state.cursorY - 13.5,
    size: 9,
    font: state.boldFont,
    color: SLATE_500
  });
  state.page.drawText("Amount", {
    x: PAGE_WIDTH - PAGE_MARGIN_X - 10 - state.boldFont.widthOfTextAtSize("Amount", 9),
    y: state.cursorY - 13.5,
    size: 9,
    font: state.boldFont,
    color: SLATE_500
  });
  state.cursorY -= 24;
}

function renderTotalsPanel(
  state: PdfRenderState,
  options: { invoice: FinishedInvoice; styleScale: number }
): void {
  const { invoice } = options;
  const subtotal = normalizeMoneyValue(
    invoice.subtotal,
    invoice.lineItems.reduce((sum, item) => sum + normalizeMoneyValue(item.amount, 0), 0)
  );
  const discount = normalizeMoneyValue(invoice.discountAmount, 0);
  const total = normalizeMoneyValue(invoice.total, subtotal - discount);
  const tax = normalizeMoneyValue(total - (subtotal - discount), 0);
  const balanceDue = normalizeMoneyValue(invoice.balanceDue, total);

  ensureVerticalSpace(state, 132, true);
  const panelWidth = 216;
  const panelHeight = discount > 0 ? 112 : 96;
  const panelX = PAGE_WIDTH - PAGE_MARGIN_X - panelWidth;
  const panelY = state.cursorY - panelHeight;

  state.page.drawRectangle({
    x: panelX,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
    color: SURFACE,
    borderColor: state.accent.border,
    borderWidth: 1
  });

  let lineY = panelY + panelHeight - 18;
  drawTotalsRow(state, panelX, lineY, "Subtotal", formatMoney(subtotal), false);
  lineY -= 16;

  if (discount > 0) {
    drawTotalsRow(state, panelX, lineY, "Discount", `-${formatMoney(discount)}`, false);
    lineY -= 16;
  }

  drawTotalsRow(state, panelX, lineY, "Tax", formatMoney(tax), false);
  lineY -= 20;

  state.page.drawLine({
    start: { x: panelX + 10, y: lineY + 8 },
    end: { x: panelX + panelWidth - 10, y: lineY + 8 },
    thickness: 0.8,
    color: SLATE_300
  });

  drawTotalsRow(state, panelX, lineY - 4, "Total", formatMoney(total), true);
  lineY -= 22;

  drawTotalsRow(state, panelX, lineY - 2, "Balance due", formatMoney(balanceDue), false);
  state.cursorY = panelY - 18;
}

function drawTotalsRow(
  state: PdfRenderState,
  panelX: number,
  baselineY: number,
  label: string,
  value: string,
  emphasize: boolean
): void {
  const labelSize = emphasize ? 10.5 : 10;
  const valueSize = emphasize ? 15 : 10.5;
  const labelColor = emphasize ? SLATE_900 : SLATE_600;
  const valueColor = emphasize ? state.accent.primary : SLATE_900;
  state.page.drawText(label, {
    x: panelX + 12,
    y: baselineY,
    size: labelSize,
    font: emphasize ? state.boldFont : state.regularFont,
    color: labelColor
  });
  state.page.drawText(value, {
    x: panelX + 204 - state.boldFont.widthOfTextAtSize(value, valueSize),
    y: baselineY - (emphasize ? 1 : 0),
    size: valueSize,
    font: state.boldFont,
    color: valueColor
  });
}

function renderNotes(
  state: PdfRenderState,
  options: { notes: string; styleScale: number }
): void {
  const { notes } = options;
  const trimmedNotes = notes.trim();
  if (!trimmedNotes) {
    return;
  }
  const noteLines = splitMultilineText(trimmedNotes)
    .flatMap((line) => wrapTextToWidth(line, state.regularFont, 10, CONTENT_WIDTH - 20, 8))
    .slice(0, 20);
  const sectionHeight = 30 + noteLines.length * 12;
  ensureVerticalSpace(state, sectionHeight + 10, true);

  drawSectionTitle(state, "Notes / Terms");
  state.page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: state.cursorY - (noteLines.length * 12 + 16),
    width: CONTENT_WIDTH,
    height: noteLines.length * 12 + 16,
    borderColor: SLATE_200,
    borderWidth: 1,
    color: rgb(1, 1, 1)
  });

  let y = state.cursorY - 12;
  for (const line of noteLines) {
    state.page.drawText(line, {
      x: PAGE_MARGIN_X + 10,
      y,
      size: 10,
      font: state.regularFont,
      color: SLATE_700
    });
    y -= 12;
  }
  state.cursorY = y - 8;
}

function renderFooter(state: PdfRenderState, options: { fromLines: string[] }): void {
  const footerLine = options.fromLines
    .slice(1)
    .filter((line) => line.length > 0)
    .slice(0, 3)
    .join("   ");
  if (!footerLine) {
    return;
  }

  const y = 30;
  state.page.drawLine({
    start: { x: PAGE_MARGIN_X, y: y + 14 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: y + 14 },
    thickness: 0.8,
    color: SLATE_200
  });
  state.page.drawText(footerLine, {
    x: PAGE_MARGIN_X,
    y,
    size: 9,
    font: state.regularFont,
    color: SLATE_500
  });
}

function drawSectionTitle(state: PdfRenderState, title: string): void {
  ensureVerticalSpace(state, 20, true);
  state.page.drawText(title, {
    x: PAGE_MARGIN_X,
    y: state.cursorY - 2,
    size: 10,
    font: state.boldFont,
    color: state.accent.text
  });
  state.cursorY -= 16;
}

function ensureVerticalSpace(state: PdfRenderState, height: number, tableContinuation: boolean): void {
  if (state.cursorY - height >= PAGE_BOTTOM) {
    return;
  }
  state.page = state.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  state.cursorY = PAGE_TOP - 8;
  state.page.drawText(
    `Invoice ${state.invoiceNumberLabel}${tableContinuation ? " (continued)" : ""}`,
    {
      x: PAGE_MARGIN_X,
      y: state.cursorY,
      size: 10,
      font: state.boldFont,
      color: SLATE_600
    }
  );
  state.page.drawLine({
    start: { x: PAGE_MARGIN_X, y: state.cursorY - 6 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: state.cursorY - 6 },
    thickness: 0.8,
    color: SLATE_300
  });
  state.cursorY -= 22;
  if (tableContinuation) {
    drawTableHeader(state);
  }
}

function groupLineItems(
  lineItems: InvoiceLineItem[]
): Array<{ label: string; items: InvoiceLineItem[] }> {
  const labor = lineItems.filter((item) => item.type === "labor");
  const materials = lineItems.filter((item) => item.type === "material");
  const other = lineItems.filter((item) => item.type === "other");
  const groups: Array<{ label: string; items: InvoiceLineItem[] }> = [];

  const hasLaborAndMaterials = labor.length > 0 && materials.length > 0;
  if (hasLaborAndMaterials) {
    if (labor.length > 0) {
      groups.push({ label: "Labor", items: labor });
    }
    if (materials.length > 0) {
      groups.push({ label: "Materials", items: materials });
    }
    if (other.length > 0) {
      groups.push({ label: "Other", items: other });
    }
    return groups;
  }

  groups.push({ label: "Items", items: lineItems });
  return groups;
}

function splitMultilineText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function wrapTextToWidth(
  value: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [value];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (!current) {
      lines.push(truncateText(word, font, fontSize, maxWidth));
      if (lines.length >= maxLines) {
        return lines;
      }
      continue;
    }
    lines.push(current);
    if (lines.length >= maxLines) {
      return lines;
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  return lines;
}

function truncateText(value: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, fontSize) <= maxWidth) {
    return value;
  }
  let output = value;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, fontSize) > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}...`;
}

function resolveAccentPalette(value?: string): {
  primary: ReturnType<typeof rgb>;
  soft: ReturnType<typeof rgb>;
  border: ReturnType<typeof rgb>;
  text: ReturnType<typeof rgb>;
} {
  const base = parseHexColor(value) ?? ACCENT_DEFAULT;
  const tint = (component: number, amount: number) => component + (1 - component) * amount;
  const soften = (component: number, amount: number) => component * (1 - amount) + amount;
  return {
    primary: base,
    soft: rgb(soften(base.red, 0.9), soften(base.green, 0.9), soften(base.blue, 0.9)),
    border: rgb(tint(base.red, 0.35), tint(base.green, 0.35), tint(base.blue, 0.35)),
    text: rgb(base.red * 0.9, base.green * 0.9, base.blue * 0.9)
  };
}

function parseHexColor(value?: string): ReturnType<typeof rgb> | null {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!match) {
    return null;
  }
  const hex = match[1].length === 3 ? match[1].replace(/./g, (char) => `${char}${char}`) : match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

function resolveStyleScale(stylePreset?: string): number {
  if (stylePreset === "compact") {
    return 0.96;
  }
  if (stylePreset === "spacious") {
    return 1.03;
  }
  return 1;
}

async function tryEmbedLogoImage(doc: PDFDocument, logoUrl?: string): Promise<PDFImage | null> {
  if (!logoUrl || typeof logoUrl !== "string") {
    return null;
  }
  const dataMatch = logoUrl.match(/^data:(image\/(?:png|jpe?g));base64,([a-zA-Z0-9+/=]+)$/i);
  if (!dataMatch) {
    return null;
  }
  const mimeType = dataMatch[1].toLowerCase();
  const bytes = Buffer.from(dataMatch[2], "base64");
  if (mimeType === "image/png") {
    return doc.embedPng(bytes);
  }
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return doc.embedJpg(bytes);
  }
  return null;
}

function normalizeMoneyValue(value: unknown, fallback: number): number {
  if (isFiniteNumber(value)) {
    return roundToCents(value);
  }
  return roundToCents(fallback);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMoney(value: number): string {
  return `$${roundToCents(value).toFixed(2)}`;
}

function formatQuantity(value: unknown): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(roundToCents(value));
}

function formatRate(value: unknown): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return formatMoney(value);
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
