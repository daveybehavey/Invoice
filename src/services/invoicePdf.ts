import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { FinishedInvoice, InvoiceLineItem } from "../models/invoice.js";
import { buildPaymentMethodPdfLabel } from "./paymentMethods.js";

type InvoicePdfInput = {
  invoice: FinishedInvoice;
  fromDetails?: string;
  businessRegistrations?: Array<{
    label?: string;
    value?: string;
    visible?: boolean;
  }>;
  registrationBlockVisible?: boolean;
  billToDetails?: string;
  accentColor?: string;
  stylePreset?: string;
  logoUrl?: string;
  logoVisible?: boolean;
  notesVisible?: boolean;
  headerLayout?: "split" | "centered";
  spacingDensity?: "tight" | "balanced" | "airy";
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
  styleProfile: PdfStyleProfile;
  cursorY: number;
  invoiceNumberLabel: string;
  documentTitle: string;
  documentNumberLabel: string;
  spacingScale: number;
};

type PdfStyleProfile = {
  documentTitleSize: number;
  documentTitleCenteredSize: number;
  businessNameSize: number;
  businessSupportingColor: ReturnType<typeof rgb>;
  dividerColor: ReturnType<typeof rgb>;
  dividerThickness: number;
  metaFill: ReturnType<typeof rgb>;
  metaBorder: ReturnType<typeof rgb>;
  metaLabelColor: ReturnType<typeof rgb>;
  addressFill: ReturnType<typeof rgb>;
  addressBorder: ReturnType<typeof rgb>;
  addressTitleFill: ReturnType<typeof rgb> | null;
  addressTitleColor: ReturnType<typeof rgb>;
  tableHeaderFill: ReturnType<typeof rgb>;
  tableHeaderBorder: ReturnType<typeof rgb>;
  tableHeaderText: ReturnType<typeof rgb>;
  groupFill: ReturnType<typeof rgb>;
  groupBorder: ReturnType<typeof rgb>;
  groupText: ReturnType<typeof rgb>;
  rowDividerColor: ReturnType<typeof rgb>;
  totalsFill: ReturnType<typeof rgb>;
  totalsBorder: ReturnType<typeof rgb>;
  totalsRule: ReturnType<typeof rgb>;
  totalHighlightFill: ReturnType<typeof rgb> | null;
  totalHighlightBorder: ReturnType<typeof rgb> | null;
  notesFill: ReturnType<typeof rgb>;
  notesBorder: ReturnType<typeof rgb>;
  paymentFill: ReturnType<typeof rgb>;
  paymentBorder: ReturnType<typeof rgb>;
  registrationFill: ReturnType<typeof rgb>;
  registrationBorder: ReturnType<typeof rgb>;
  sectionTitleColor: ReturnType<typeof rgb>;
  footerRuleColor: ReturnType<typeof rgb>;
  footerTextColor: ReturnType<typeof rgb>;
};

function resolveDocumentTypeLabels(documentType?: string) {
  const normalized = documentType === "estimate" ? "estimate" : "invoice";
  return {
    title: normalized === "estimate" ? "ESTIMATE" : "INVOICE",
    numberLabel: normalized === "estimate" ? "Estimate #" : "Invoice #",
    filenamePrefix: normalized === "estimate" ? "Estimate" : "Invoice"
  };
}

export async function createInvoicePdfBuffer(input: InvoicePdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = resolveAccentPalette(input.accentColor);
  const styleProfile = resolveStyleProfile(input.stylePreset, accent);
  const styleScale = resolveStyleScale(input.stylePreset);
  const spacingScale = resolveSpacingScale(input.spacingDensity);

  const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const state: PdfRenderState = {
    doc,
    page: firstPage,
    regularFont,
    boldFont,
    accent,
    styleProfile,
    cursorY: PAGE_TOP,
    invoiceNumberLabel: input.invoice.invoiceNumber?.trim() || "Draft",
    documentTitle: resolveDocumentTypeLabels(input.invoice.documentType).title,
    documentNumberLabel: resolveDocumentTypeLabels(input.invoice.documentType).numberLabel,
    spacingScale
  };

  const fromLines = splitMultilineText(input.fromDetails ?? "");
  const billToLines = splitMultilineText(input.billToDetails ?? input.invoice.customerName ?? "");
  const logo = input.logoVisible === false ? null : await tryEmbedLogoImage(doc, input.logoUrl);

  renderHeader(state, {
    fromLines,
    issueDate: input.invoice.issueDate?.trim() || "Not set",
    dueDate: input.invoice.dueDate?.trim() || "",
    logo,
    styleScale,
    headerLayout: input.headerLayout
  });
  renderPartyBlocks(state, { fromLines, billToLines, styleScale });
  renderLineItemsSection(state, { invoice: input.invoice, styleScale });
  renderTotalsPanel(state, { invoice: input.invoice, styleScale });
  renderBusinessRegistrations(state, {
    registrations: input.businessRegistrations ?? [],
    registrationBlockVisible: input.registrationBlockVisible
  });
  if (input.notesVisible !== false) {
    renderNotes(state, { notes: input.invoice.notes ?? "", styleScale });
  }
  renderPaymentMethods(state, {
    paymentMethods: Array.isArray(input.invoice.paymentMethods) ? input.invoice.paymentMethods : []
  });
  renderPaymentLink(state, { paymentLinkUrl: input.invoice.paymentLinkUrl ?? "", styleScale });
  renderFooter(state, { fromLines });

  const pdfBytes = await doc.save({ useObjectStreams: false });
  return Buffer.from(pdfBytes);
}

export function buildPdfFilename(invoiceNumber?: string, documentType?: string): string {
  const rawValue = typeof invoiceNumber === "string" ? invoiceNumber.trim() : "";
  const normalized = rawValue
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = normalized.length > 0 ? normalized : "Draft";
  return `${resolveDocumentTypeLabels(documentType).filenamePrefix}-${suffix}.pdf`;
}

function renderHeader(
  state: PdfRenderState,
  options: {
    fromLines: string[];
    issueDate: string;
    dueDate: string;
    logo: PDFImage | null;
    styleScale: number;
    headerLayout?: "split" | "centered";
  }
): void {
  const { fromLines, issueDate, dueDate, logo, styleScale, headerLayout } = options;
  if (headerLayout === "centered") {
    renderCenteredHeader(state, { fromLines, issueDate, dueDate, logo, styleScale });
    return;
  }
  const { fromLines: splitFromLines, issueDate: splitIssueDate, dueDate: splitDueDate, logo: splitLogo } = options;
  const { page, regularFont, boldFont, styleProfile } = state;
  const spacingScale = state.spacingScale;
  let leftCursor = PAGE_TOP;
  const rightColumnWidth = 220;
  const rightColumnX = PAGE_WIDTH - PAGE_MARGIN_X - rightColumnWidth;

  if (splitLogo) {
    const scaled = splitLogo.scale(1);
    const maxWidth = 110 * styleScale;
    const maxHeight = 56 * styleScale;
    const widthScale = maxWidth / scaled.width;
    const heightScale = maxHeight / scaled.height;
    const scale = Math.min(widthScale, heightScale, 1);
    const width = scaled.width * scale;
    const height = scaled.height * scale;
    page.drawImage(splitLogo, {
      x: PAGE_MARGIN_X,
      y: leftCursor - height,
      width,
      height
    });
    leftCursor -= height + 10 * spacingScale;
  }

  const businessName = splitFromLines[0] || "Your Business";
  page.drawText(businessName, {
    x: PAGE_MARGIN_X,
    y: leftCursor - 16,
    size: styleProfile.businessNameSize * styleScale,
    font: boldFont,
    color: SLATE_900
  });
  leftCursor -= 24 * spacingScale;

  const supportingLines = splitFromLines.slice(1, 3);
  for (const line of supportingLines) {
    page.drawText(line, {
      x: PAGE_MARGIN_X,
      y: leftCursor - 10,
      size: 9.5 * styleScale,
      font: regularFont,
      color: styleProfile.businessSupportingColor
    });
    leftCursor -= 13 * spacingScale;
  }

  const title = state.documentTitle;
  const titleSize = styleProfile.documentTitleSize * styleScale;
  const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
  const titleX = rightColumnX + Math.max(0, rightColumnWidth - titleWidth);
  const titleBaselineY = PAGE_TOP - titleSize;
  page.drawText(title, {
    x: titleX,
    y: titleBaselineY,
    size: titleSize,
    font: boldFont,
    color: SLATE_900
  });

  const metaBoxWidth = rightColumnWidth;
  const hasDueDate = Boolean(splitDueDate);
  const metaBoxHeight = hasDueDate ? 78 : 56;
  const metaBoxX = rightColumnX;
  const metaBoxTop = titleBaselineY - 36 * spacingScale;
  const metaBoxY = metaBoxTop - metaBoxHeight;
  const metaTextWidth = metaBoxWidth - 28;
  const invoiceNumberSize = fitTextSizeToWidth(regularFont, state.invoiceNumberLabel, metaTextWidth, 10.5, 8.25);
  const issueDateSize = fitTextSizeToWidth(regularFont, splitIssueDate, metaTextWidth, 10.5, 8.25);
  const dueDateSize = fitTextSizeToWidth(regularFont, splitDueDate, metaTextWidth, 10.5, 8.25);

  page.drawRectangle({
    x: metaBoxX,
    y: metaBoxY,
    width: metaBoxWidth,
    height: metaBoxHeight,
    borderColor: styleProfile.metaBorder,
    borderWidth: 1,
    color: styleProfile.metaFill
  });

  page.drawText(state.documentNumberLabel, {
    x: metaBoxX + 12,
    y: metaBoxY + metaBoxHeight - 16,
    size: 9,
    font: boldFont,
    color: styleProfile.metaLabelColor
  });
  page.drawText(state.invoiceNumberLabel, {
    x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(state.invoiceNumberLabel, invoiceNumberSize),
    y: metaBoxY + metaBoxHeight - 17,
    size: invoiceNumberSize,
    font: regularFont,
    color: SLATE_900
  });

  page.drawText("Date", {
    x: metaBoxX + 12,
    y: metaBoxY + (hasDueDate ? 34 : 14),
    size: 9,
    font: boldFont,
    color: styleProfile.metaLabelColor
  });
  page.drawText(splitIssueDate, {
    x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(splitIssueDate, issueDateSize),
    y: metaBoxY + (hasDueDate ? 33 : 13),
    size: issueDateSize,
    font: regularFont,
    color: SLATE_900
  });

  if (hasDueDate) {
    page.drawText("Due", {
      x: metaBoxX + 12,
      y: metaBoxY + 12,
      size: 9,
      font: boldFont,
      color: styleProfile.metaLabelColor
    });
    page.drawText(splitDueDate, {
      x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(splitDueDate, dueDateSize),
      y: metaBoxY + 11,
      size: dueDateSize,
      font: regularFont,
      color: SLATE_900
    });
  }

  const dividerY = Math.min(leftCursor - 10 * spacingScale, metaBoxY - 14 * spacingScale);
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y: dividerY },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: dividerY },
    thickness: styleProfile.dividerThickness,
    color: styleProfile.dividerColor
  });

  state.cursorY = dividerY - 18 * spacingScale;
}

function renderCenteredHeader(
  state: PdfRenderState,
  options: {
    fromLines: string[];
    issueDate: string;
    dueDate: string;
    logo: PDFImage | null;
    styleScale: number;
  }
): void {
  const { fromLines, issueDate, dueDate, logo, styleScale } = options;
  const { page, regularFont, boldFont, styleProfile } = state;
  const spacingScale = state.spacingScale;
  let cursorY = PAGE_TOP;

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
      x: (PAGE_WIDTH - width) / 2,
      y: cursorY - height,
      width,
      height
    });
    cursorY -= height + 12 * spacingScale;
  }

  const businessName = fromLines[0] || "Your Business";
  const businessNameSize = styleProfile.businessNameSize * styleScale;
  page.drawText(businessName, {
    x: (PAGE_WIDTH - boldFont.widthOfTextAtSize(businessName, businessNameSize)) / 2,
    y: cursorY - businessNameSize,
    size: businessNameSize,
    font: boldFont,
    color: SLATE_900
  });
  cursorY -= 24 * spacingScale;

  for (const line of fromLines.slice(1, 3)) {
    const lineSize = 9.5 * styleScale;
    page.drawText(line, {
      x: (PAGE_WIDTH - regularFont.widthOfTextAtSize(line, lineSize)) / 2,
      y: cursorY - lineSize,
      size: lineSize,
      font: regularFont,
      color: styleProfile.businessSupportingColor
    });
    cursorY -= 13 * spacingScale;
  }

  const title = state.documentTitle;
  const titleSize = styleProfile.documentTitleCenteredSize * styleScale;
  const titleBaselineY = cursorY - titleSize - 4;
  page.drawText(title, {
    x: (PAGE_WIDTH - boldFont.widthOfTextAtSize(title, titleSize)) / 2,
    y: titleBaselineY,
    size: titleSize,
    font: boldFont,
    color: SLATE_900
  });
  cursorY -= titleSize + 22 * spacingScale;

  const metaBoxWidth = 220;
  const hasDueDate = Boolean(dueDate);
  const metaBoxHeight = hasDueDate ? 78 : 56;
  const metaBoxX = (PAGE_WIDTH - metaBoxWidth) / 2;
  const metaBoxTop = titleBaselineY - 28 * spacingScale;
  const metaBoxY = metaBoxTop - metaBoxHeight;
  const metaTextWidth = metaBoxWidth - 28;
  const invoiceNumberSize = fitTextSizeToWidth(regularFont, state.invoiceNumberLabel, metaTextWidth, 10.5, 8.25);
  const issueDateSize = fitTextSizeToWidth(regularFont, issueDate, metaTextWidth, 10.5, 8.25);
  const dueDateSize = fitTextSizeToWidth(regularFont, dueDate, metaTextWidth, 10.5, 8.25);

  page.drawRectangle({
    x: metaBoxX,
    y: metaBoxY,
    width: metaBoxWidth,
    height: metaBoxHeight,
    borderColor: styleProfile.metaBorder,
    borderWidth: 1,
    color: styleProfile.metaFill
  });

  page.drawText(state.documentNumberLabel, {
    x: metaBoxX + 12,
    y: metaBoxY + metaBoxHeight - 16,
    size: 9,
    font: boldFont,
    color: styleProfile.metaLabelColor
  });
  page.drawText(state.invoiceNumberLabel, {
    x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(state.invoiceNumberLabel, invoiceNumberSize),
    y: metaBoxY + metaBoxHeight - 17,
    size: invoiceNumberSize,
    font: regularFont,
    color: SLATE_900
  });

  page.drawText("Date", {
    x: metaBoxX + 12,
    y: metaBoxY + (hasDueDate ? 34 : 14),
    size: 9,
    font: boldFont,
    color: styleProfile.metaLabelColor
  });
  page.drawText(issueDate, {
    x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(issueDate, issueDateSize),
    y: metaBoxY + (hasDueDate ? 33 : 13),
    size: issueDateSize,
    font: regularFont,
    color: SLATE_900
  });

  if (hasDueDate) {
    page.drawText("Due", {
      x: metaBoxX + 12,
      y: metaBoxY + 12,
      size: 9,
      font: boldFont,
      color: styleProfile.metaLabelColor
    });
    page.drawText(dueDate, {
      x: metaBoxX + metaBoxWidth - 12 - regularFont.widthOfTextAtSize(dueDate, dueDateSize),
      y: metaBoxY + 11,
      size: dueDateSize,
      font: regularFont,
      color: SLATE_900
    });
  }

  const dividerY = metaBoxY - 14 * spacingScale;
  page.drawLine({
    start: { x: PAGE_MARGIN_X, y: dividerY },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: dividerY },
    thickness: styleProfile.dividerThickness,
    color: styleProfile.dividerColor
  });

  state.cursorY = dividerY - 18 * spacingScale;
}

function renderPartyBlocks(
  state: PdfRenderState,
  options: { fromLines: string[]; billToLines: string[]; styleScale: number }
): void {
  const { fromLines, billToLines, styleScale } = options;
  ensureVerticalSpace(state, 120 * state.spacingScale, false);

  const top = state.cursorY;
  const blockWidth = (CONTENT_WIDTH - 14) / 2;
  const minHeight = 92 * state.spacingScale;
  const contentLines = Math.max(fromLines.length, billToLines.length, 1);
  const blockHeight = Math.max(minHeight, (38 + contentLines * 14) * state.spacingScale);

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

  state.cursorY = top - blockHeight - 20 * styleScale * state.spacingScale;
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
  const { page, regularFont, boldFont, styleProfile } = state;
  const spacingScale = state.spacingScale;
  const bottom = top - height;

  page.drawRectangle({
    x,
    y: bottom,
    width,
    height,
    borderColor: styleProfile.addressBorder,
    borderWidth: 1,
    color: styleProfile.addressFill
  });

  if (styleProfile.addressTitleFill) {
    page.drawRectangle({
      x: x + 10,
      y: top - 23,
      width: Math.min(width - 20, Math.max(56, boldFont.widthOfTextAtSize(title, 9) + 14)),
      height: 14,
      color: styleProfile.addressTitleFill
    });
  }

  page.drawText(title, {
    x: x + 10,
    y: top - 16,
    size: 9,
    font: boldFont,
    color: styleProfile.addressTitleColor
  });

  let lineY = top - 32 * spacingScale;
  for (const line of lines.slice(0, 5)) {
    page.drawText(line, {
      x: x + 10,
      y: lineY,
      size: 10.5,
      font: regularFont,
      color: SLATE_700
    });
    lineY -= 13 * spacingScale;
  }
}

function fitTextSizeToWidth(
  font: PDFFont,
  text: string,
  maxWidth: number,
  baseSize: number,
  minSize: number
): number {
  const safeText = String(text ?? "");
  let size = baseSize;
  while (size > minSize && font.widthOfTextAtSize(safeText, size) > maxWidth) {
    size -= 0.25;
  }
  return Number(size.toFixed(2));
}

function renderLineItemsSection(
  state: PdfRenderState,
  options: { invoice: FinishedInvoice; styleScale: number }
): void {
  const { invoice } = options;
  const groups = groupLineItems(invoice.lineItems);
  const showGroupHeaders = groups.length > 1;
  const spacingScale = state.spacingScale;

  drawSectionTitle(state, "Line items");
  drawTableHeader(state);

  for (const group of groups) {
    if (showGroupHeaders) {
      ensureVerticalSpace(state, 26 * spacingScale, true);
      state.page.drawRectangle({
        x: PAGE_MARGIN_X,
        y: state.cursorY - 18 * spacingScale,
        width: CONTENT_WIDTH,
        height: 18 * spacingScale,
        color: state.styleProfile.groupFill,
        borderColor: state.styleProfile.groupBorder,
        borderWidth: 0.5
      });
      state.page.drawText(group.label, {
        x: PAGE_MARGIN_X + 8,
        y: state.cursorY - 13.5 * spacingScale,
        size: 9.5,
        font: state.boldFont,
        color: state.styleProfile.groupText
      });
      state.cursorY -= 24 * spacingScale;
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

      const rowHeight = Math.max(
        36 * spacingScale,
        (12 + descriptionLines.length * 12 + secondaryLines.length * 10) * spacingScale
      );
      ensureVerticalSpace(state, rowHeight + 8 * spacingScale, true);

      state.page.drawLine({
        start: { x: PAGE_MARGIN_X, y: state.cursorY + 3 * spacingScale },
        end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: state.cursorY + 3 * spacingScale },
        thickness: 0.7,
        color: state.styleProfile.rowDividerColor
      });

      let textY = state.cursorY - 9 * spacingScale;
      for (const line of descriptionLines) {
        state.page.drawText(line, {
          x: PAGE_MARGIN_X + 10,
          y: textY,
          size: 10.75,
          font: state.boldFont,
          color: SLATE_900
        });
        textY -= 12 * spacingScale;
      }
      for (const detailLine of secondaryLines) {
        state.page.drawText(detailLine, {
          x: PAGE_MARGIN_X + 10,
          y: textY,
          size: 9,
          font: state.regularFont,
          color: SLATE_500
        });
        textY -= 10 * spacingScale;
      }

      state.page.drawText(amountText, {
        x: PAGE_WIDTH - PAGE_MARGIN_X - 10 - state.boldFont.widthOfTextAtSize(amountText, 11),
        y: state.cursorY - 10.5 * spacingScale,
        size: 11,
        font: state.boldFont,
        color: SLATE_900
      });

      state.cursorY -= rowHeight;
    }
  }
}

function drawTableHeader(state: PdfRenderState): void {
  const spacingScale = state.spacingScale;
  ensureVerticalSpace(state, 26 * spacingScale, true);
  state.page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: state.cursorY - 18 * spacingScale,
    width: CONTENT_WIDTH,
    height: 18 * spacingScale,
    color: state.styleProfile.tableHeaderFill,
    borderColor: state.styleProfile.tableHeaderBorder,
    borderWidth: 1
  });
  state.page.drawText("Description", {
    x: PAGE_MARGIN_X + 10,
    y: state.cursorY - 13.5 * spacingScale,
    size: 9,
    font: state.boldFont,
    color: state.styleProfile.tableHeaderText
  });
  state.page.drawText("Amount", {
    x: PAGE_WIDTH - PAGE_MARGIN_X - 10 - state.boldFont.widthOfTextAtSize("Amount", 9),
    y: state.cursorY - 13.5 * spacingScale,
    size: 9,
    font: state.boldFont,
    color: state.styleProfile.tableHeaderText
  });
  state.cursorY -= 24 * spacingScale;
}

function renderTotalsPanel(
  state: PdfRenderState,
  options: { invoice: FinishedInvoice; styleScale: number }
): void {
  const { invoice } = options;
  const spacingScale = state.spacingScale;
  const subtotal = normalizeMoneyValue(
    invoice.subtotal,
    invoice.lineItems.reduce((sum, item) => sum + normalizeMoneyValue(item.amount, 0), 0)
  );
  const discount = normalizeMoneyValue(invoice.discountAmount, 0);
  const total = normalizeMoneyValue(invoice.total, subtotal - discount);
  const tax = normalizeMoneyValue(total - (subtotal - discount), 0);
  const balanceDue = normalizeMoneyValue(invoice.balanceDue, total);

  ensureVerticalSpace(state, 132 * spacingScale, true);
  const panelWidth = 244;
  const panelHeight = discount > 0 ? 118 : 104;
  const panelX = PAGE_WIDTH - PAGE_MARGIN_X - panelWidth;
  const panelY = state.cursorY - panelHeight;

  state.page.drawRectangle({
    x: panelX,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
    color: state.styleProfile.totalsFill,
    borderColor: state.styleProfile.totalsBorder,
    borderWidth: 1
  });

  let lineY = panelY + panelHeight - 20;
  drawTotalsRow(state, panelX, panelWidth, lineY, "Subtotal", formatMoney(subtotal), false);
  lineY -= 18;

  if (discount > 0) {
    drawTotalsRow(state, panelX, panelWidth, lineY, "Discount", `-${formatMoney(discount)}`, false);
    lineY -= 18;
  }

  drawTotalsRow(state, panelX, panelWidth, lineY, "Tax", formatMoney(tax), false);
  lineY -= 22;

  state.page.drawLine({
    start: { x: panelX + 10, y: lineY + 11 },
    end: { x: panelX + panelWidth - 10, y: lineY + 11 },
    thickness: 0.8,
    color: state.styleProfile.totalsRule
  });

  if (state.styleProfile.totalHighlightFill && state.styleProfile.totalHighlightBorder) {
    state.page.drawRectangle({
      x: panelX + 8,
      y: lineY - 13,
      width: panelWidth - 16,
      height: 26,
      color: state.styleProfile.totalHighlightFill,
      borderColor: state.styleProfile.totalHighlightBorder,
      borderWidth: 0.6
    });
  }

  drawTotalsRow(state, panelX, panelWidth, lineY - 5, "Total", formatMoney(total), true);
  lineY -= 26;

  drawTotalsRow(state, panelX, panelWidth, lineY - 2, "Balance due", formatMoney(balanceDue), false);
  state.cursorY = panelY - 18;
}

function drawTotalsRow(
  state: PdfRenderState,
  panelX: number,
  panelWidth: number,
  baselineY: number,
  label: string,
  value: string,
  emphasize: boolean
): void {
  const labelSize = emphasize ? 10.5 : 10;
  const valueSize = fitTextSize(
    value,
    state.boldFont,
    emphasize ? 14 : 10.5,
    emphasize ? 12.75 : 10,
    panelWidth * (emphasize ? 0.44 : 0.42)
  );
  const labelColor = emphasize ? SLATE_900 : SLATE_600;
  const valueColor = emphasize ? state.accent.primary : SLATE_900;
  const leftPadding = 12;
  const rightPadding = 16;
  state.page.drawText(label, {
    x: panelX + leftPadding,
    y: baselineY,
    size: labelSize,
    font: emphasize ? state.boldFont : state.regularFont,
    color: labelColor
  });
  state.page.drawText(value, {
    x: panelX + panelWidth - rightPadding - state.boldFont.widthOfTextAtSize(value, valueSize),
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
  const spacingScale = state.spacingScale;
  const trimmedNotes = notes.trim();
  if (!trimmedNotes) {
    return;
  }
  const noteLines = splitMultilineText(trimmedNotes)
    .flatMap((line) => wrapTextToWidth(line, state.regularFont, 10, CONTENT_WIDTH - 20, 8))
    .slice(0, 20);
  const sectionHeight = (30 + noteLines.length * 12) * spacingScale;
  ensureVerticalSpace(state, sectionHeight + 10 * spacingScale, true);

  drawSectionTitle(state, "Notes / Terms");
  state.page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: state.cursorY - (noteLines.length * 12 + 16) * spacingScale,
    width: CONTENT_WIDTH,
    height: (noteLines.length * 12 + 16) * spacingScale,
    borderColor: state.styleProfile.notesBorder,
    borderWidth: 1,
    color: state.styleProfile.notesFill
  });

  let y = state.cursorY - 12 * spacingScale;
  for (const line of noteLines) {
    state.page.drawText(line, {
      x: PAGE_MARGIN_X + 10,
      y,
      size: 10,
      font: state.regularFont,
      color: SLATE_700
    });
    y -= 12 * spacingScale;
  }
  state.cursorY = y - 8 * spacingScale;
}

function renderBusinessRegistrations(
  state: PdfRenderState,
  options: {
    registrations: Array<{ label?: string; value?: string; visible?: boolean }>;
    registrationBlockVisible?: boolean;
  }
): void {
  if (options.registrationBlockVisible === false) {
    return;
  }
  const registrationLines = (Array.isArray(options.registrations) ? options.registrations : [])
    .filter((entry) => entry?.visible !== false)
    .map((entry) => {
      const label = String(entry?.label ?? "").trim();
      const value = String(entry?.value ?? "").trim();
      if (!label && !value) {
        return "";
      }
      return `${label || "Registration"}: ${value}`;
    })
    .filter(Boolean)
    .slice(0, 6);
  if (registrationLines.length === 0) {
    return;
  }

  const sectionHeight = 30 + registrationLines.length * 12;
  ensureVerticalSpace(state, sectionHeight + 10 * state.spacingScale, true);
  drawSectionTitle(state, "Registrations");
  state.page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: state.cursorY - (registrationLines.length * 12 + 16) * state.spacingScale,
    width: CONTENT_WIDTH * 0.56,
    height: (registrationLines.length * 12 + 16) * state.spacingScale,
    borderColor: state.styleProfile.registrationBorder,
    borderWidth: 1,
    color: state.styleProfile.registrationFill
  });

  let y = state.cursorY - 12 * state.spacingScale;
  for (const line of registrationLines) {
    state.page.drawText(line, {
      x: PAGE_MARGIN_X + 10,
      y,
      size: 10,
      font: state.regularFont,
      color: SLATE_700
    });
    y -= 12 * state.spacingScale;
  }
  state.cursorY = y - 8 * state.spacingScale;
}

function renderPaymentLink(
  state: PdfRenderState,
  options: { paymentLinkUrl: string; styleScale: number }
): void {
  const { paymentLinkUrl } = options;
  const spacingScale = state.spacingScale;
  const trimmedPaymentLink = paymentLinkUrl.trim();
  if (!trimmedPaymentLink) {
    return;
  }

  const textLines = wrapTextToWidth(trimmedPaymentLink, state.regularFont, 10, CONTENT_WIDTH - 20, 6).slice(0, 4);
  const sectionHeight = (30 + textLines.length * 12) * spacingScale;
  ensureVerticalSpace(state, sectionHeight + 10 * spacingScale, true);

  drawSectionTitle(state, "Pay online");
  state.page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: state.cursorY - (textLines.length * 12 + 16) * spacingScale,
    width: CONTENT_WIDTH,
    height: (textLines.length * 12 + 16) * spacingScale,
    borderColor: state.styleProfile.paymentBorder,
    borderWidth: 1,
    color: state.styleProfile.paymentFill
  });

  let y = state.cursorY - 12 * spacingScale;
  for (const line of textLines) {
    state.page.drawText(line, {
      x: PAGE_MARGIN_X + 10,
      y,
      size: 10,
      font: state.boldFont,
      color: state.accent.text
    });
    y -= 12 * spacingScale;
  }
  state.cursorY = y - 8 * spacingScale;
}

function renderPaymentMethods(
  state: PdfRenderState,
  options: {
    paymentMethods: Array<{
      kind?: string;
      label?: string;
      details?: string;
      enabled?: boolean;
    }>;
  }
): void {
  const methods = (Array.isArray(options.paymentMethods) ? options.paymentMethods : []).filter(
    (method) => method?.enabled !== false && (String(method?.label ?? "").trim() || String(method?.details ?? "").trim())
  );
  if (methods.length === 0) {
    return;
  }

  const spacingScale = state.spacingScale;
  ensureVerticalSpace(state, (28 + methods.length * 54) * spacingScale, true);
  drawSectionTitle(state, "Payment instructions");

  for (const method of methods) {
    const label = String(method.label ?? "").trim() || buildPaymentMethodPdfLabel(method.kind);
    const details = String(method.details ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);
    const detailLines =
      details.length > 0
        ? details.flatMap((line) => wrapTextToWidth(line, state.regularFont, 9.5, CONTENT_WIDTH - 28, 6))
        : ["Manual payment instructions."];
    const cardHeight = (20 + detailLines.length * 11) * spacingScale;
    ensureVerticalSpace(state, cardHeight + 8 * spacingScale, true);
    state.page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: state.cursorY - cardHeight,
      width: CONTENT_WIDTH,
      height: cardHeight,
      borderColor: state.styleProfile.paymentBorder,
      borderWidth: 1,
      color: state.styleProfile.paymentFill
    });
    state.page.drawText(label, {
      x: PAGE_MARGIN_X + 10,
      y: state.cursorY - 14 * spacingScale,
      size: 10.5,
      font: state.boldFont,
      color: state.accent.text
    });
    let y = state.cursorY - 27 * spacingScale;
    for (const line of detailLines) {
      state.page.drawText(line, {
        x: PAGE_MARGIN_X + 10,
        y,
        size: 9.5,
        font: state.regularFont,
        color: SLATE_700
      });
      y -= 11 * spacingScale;
    }
    state.cursorY = state.cursorY - cardHeight - 8 * spacingScale;
  }
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
    color: state.styleProfile.footerRuleColor
  });
  state.page.drawText(footerLine, {
    x: PAGE_MARGIN_X,
    y,
    size: 9,
    font: state.regularFont,
    color: state.styleProfile.footerTextColor
  });
}

function drawSectionTitle(state: PdfRenderState, title: string): void {
  ensureVerticalSpace(state, 20 * state.spacingScale, true);
  state.page.drawText(title, {
    x: PAGE_MARGIN_X,
    y: state.cursorY - 2 * state.spacingScale,
    size: 10,
    font: state.boldFont,
    color: state.styleProfile.sectionTitleColor
  });
  state.cursorY -= 16 * state.spacingScale;
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
  state.cursorY -= 22 * state.spacingScale;
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

function fitTextSize(
  value: string,
  font: PDFFont,
  preferredSize: number,
  minimumSize: number,
  maxWidth: number
): number {
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(value, size) > maxWidth) {
    size -= 0.25;
  }
  return size;
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

function resolveStyleProfile(
  stylePreset: string | undefined,
  accent: ReturnType<typeof resolveAccentPalette>
): PdfStyleProfile {
  if (stylePreset === "compact") {
    return {
      documentTitleSize: 22,
      documentTitleCenteredSize: 22,
      businessNameSize: 13,
      businessSupportingColor: SLATE_500,
      dividerColor: SLATE_300,
      dividerThickness: 0.8,
      metaFill: SURFACE,
      metaBorder: SLATE_200,
      metaLabelColor: SLATE_500,
      addressFill: rgb(1, 1, 1),
      addressBorder: SLATE_200,
      addressTitleFill: SURFACE,
      addressTitleColor: SLATE_700,
      tableHeaderFill: SURFACE,
      tableHeaderBorder: SLATE_200,
      tableHeaderText: SLATE_600,
      groupFill: SURFACE,
      groupBorder: SLATE_200,
      groupText: SLATE_700,
      rowDividerColor: SLATE_200,
      totalsFill: SURFACE,
      totalsBorder: SLATE_200,
      totalsRule: SLATE_300,
      totalHighlightFill: rgb(248 / 255, 250 / 255, 252 / 255),
      totalHighlightBorder: SLATE_200,
      notesFill: rgb(1, 1, 1),
      notesBorder: SLATE_200,
      paymentFill: SURFACE,
      paymentBorder: SLATE_200,
      registrationFill: SURFACE,
      registrationBorder: SLATE_200,
      sectionTitleColor: SLATE_700,
      footerRuleColor: SLATE_200,
      footerTextColor: SLATE_500
    };
  }

  if (stylePreset === "spacious") {
    return {
      documentTitleSize: 34,
      documentTitleCenteredSize: 36,
      businessNameSize: 15.5,
      businessSupportingColor: SLATE_700,
      dividerColor: accent.primary,
      dividerThickness: 1.8,
      metaFill: accent.soft,
      metaBorder: accent.border,
      metaLabelColor: accent.text,
      addressFill: rgb(252 / 255, 252 / 255, 252 / 255),
      addressBorder: accent.border,
      addressTitleFill: accent.soft,
      addressTitleColor: accent.text,
      tableHeaderFill: accent.soft,
      tableHeaderBorder: accent.border,
      tableHeaderText: accent.text,
      groupFill: accent.soft,
      groupBorder: accent.border,
      groupText: accent.text,
      rowDividerColor: accent.border,
      totalsFill: accent.soft,
      totalsBorder: accent.border,
      totalsRule: accent.border,
      totalHighlightFill: rgb(
        Math.min(1, accent.soft.red + 0.03),
        Math.min(1, accent.soft.green + 0.03),
        Math.min(1, accent.soft.blue + 0.03)
      ),
      totalHighlightBorder: accent.border,
      notesFill: rgb(252 / 255, 252 / 255, 252 / 255),
      notesBorder: accent.border,
      paymentFill: accent.soft,
      paymentBorder: accent.border,
      registrationFill: rgb(252 / 255, 252 / 255, 252 / 255),
      registrationBorder: accent.border,
      sectionTitleColor: accent.text,
      footerRuleColor: accent.border,
      footerTextColor: SLATE_600
    };
  }

  return {
    documentTitleSize: 30,
    documentTitleCenteredSize: 30,
    businessNameSize: 14,
    businessSupportingColor: SLATE_600,
    dividerColor: accent.primary,
    dividerThickness: 1.2,
    metaFill: SURFACE,
    metaBorder: SLATE_200,
    metaLabelColor: SLATE_500,
    addressFill: rgb(1, 1, 1),
    addressBorder: SLATE_200,
    addressTitleFill: accent.soft,
    addressTitleColor: accent.text,
    tableHeaderFill: SURFACE,
    tableHeaderBorder: SLATE_200,
    tableHeaderText: SLATE_500,
    groupFill: accent.soft,
    groupBorder: accent.border,
    groupText: accent.text,
    rowDividerColor: SLATE_200,
    totalsFill: SURFACE,
    totalsBorder: accent.border,
    totalsRule: SLATE_300,
    totalHighlightFill: null,
    totalHighlightBorder: null,
    notesFill: rgb(1, 1, 1),
    notesBorder: SLATE_200,
    paymentFill: SURFACE,
    paymentBorder: accent.border,
    registrationFill: SURFACE,
    registrationBorder: SLATE_200,
    sectionTitleColor: accent.text,
    footerRuleColor: SLATE_200,
    footerTextColor: SLATE_500
  };
}

function resolveSpacingScale(spacingDensity?: string): number {
  if (spacingDensity === "tight") {
    return 0.88;
  }
  if (spacingDensity === "airy") {
    return 1.12;
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
