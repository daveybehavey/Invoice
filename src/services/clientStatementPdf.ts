import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ClientStatementPdfInvoice = {
  invoiceNumber?: string | null;
  dueDate?: string | null;
  total?: number | null;
  balanceDue?: number | null;
  statusLabel?: string | null;
};

export type ClientStatementPdfInput = {
  clientName: string;
  recipientEmail?: string | null;
  preparedAt: string;
  openBalance: number;
  currency?: string | null;
  invoices: ClientStatementPdfInvoice[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const TOP_Y = PAGE_HEIGHT - 48;
const BOTTOM_Y = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const SLATE_900 = rgb(15 / 255, 23 / 255, 42 / 255);
const SLATE_700 = rgb(51 / 255, 65 / 255, 85 / 255);
const SLATE_500 = rgb(100 / 255, 116 / 255, 139 / 255);
const SLATE_300 = rgb(203 / 255, 213 / 255, 225 / 255);
const SURFACE = rgb(248 / 255, 250 / 255, 252 / 255);
const ACCENT = rgb(23 / 255, 73 / 255, 60 / 255);

type RenderState = {
  doc: PDFDocument;
  page: PDFPage;
  regularFont: PDFFont;
  boldFont: PDFFont;
  cursorY: number;
};

export async function createClientStatementPdfBuffer(input: ClientStatementPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const state: RenderState = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    regularFont,
    boldFont,
    cursorY: TOP_Y
  };

  renderHeader(state, input);
  renderMeta(state, input);
  renderTable(state, input);
  renderTotals(state, input);
  renderFooter(state);

  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export function buildClientStatementPdfFilename(clientName: string): string {
  const normalized = String(clientName ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `Client-Statement-${normalized || "Client"}.pdf`;
}

function renderHeader(state: RenderState, input: ClientStatementPdfInput): void {
  const { page, boldFont, regularFont } = state;
  page.drawText("CLIENT STATEMENT", {
    x: MARGIN_X,
    y: state.cursorY - 14,
    size: 11,
    font: boldFont,
    color: ACCENT
  });
  state.cursorY -= 34;
  page.drawText(input.clientName, {
    x: MARGIN_X,
    y: state.cursorY - 20,
    size: 28,
    font: boldFont,
    color: SLATE_900
  });
  state.cursorY -= 34;
  page.drawText("A clean summary of open invoices and remaining balance from NoteBill.", {
    x: MARGIN_X,
    y: state.cursorY - 12,
    size: 11,
    font: regularFont,
    color: SLATE_700
  });
  state.cursorY -= 26;
  page.drawLine({
    start: { x: MARGIN_X, y: state.cursorY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: state.cursorY },
    thickness: 1.2,
    color: ACCENT
  });
  state.cursorY -= 22;
}

function renderMeta(state: RenderState, input: ClientStatementPdfInput): void {
  const { page, regularFont, boldFont } = state;
  const boxHeight = input.recipientEmail ? 82 : 64;
  const boxY = state.cursorY - boxHeight;
  page.drawRectangle({
    x: MARGIN_X,
    y: boxY,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: SLATE_300,
    borderWidth: 1,
    color: SURFACE
  });

  drawMetaRow(page, boldFont, regularFont, "Prepared", formatCalendarDate(input.preparedAt), boxY + boxHeight - 20);
  if (input.recipientEmail) {
    drawMetaRow(page, boldFont, regularFont, "Recipient", input.recipientEmail, boxY + boxHeight - 40);
  }
  drawMetaRow(
    page,
    boldFont,
    regularFont,
    "Open invoices",
    String(input.invoices.length),
    boxY + 18
  );
  state.cursorY = boxY - 24;
}

function renderTable(state: RenderState, input: ClientStatementPdfInput): void {
  ensurePageSpace(state, 220);
  const { page, regularFont, boldFont } = state;
  const tableTop = state.cursorY;
  const columns = [
    { label: "Invoice", x: MARGIN_X, width: 132, align: "left" as const },
    { label: "Due", x: MARGIN_X + 138, width: 96, align: "left" as const },
    { label: "Status", x: MARGIN_X + 240, width: 120, align: "left" as const },
    { label: "Total", x: MARGIN_X + 366, width: 72, align: "right" as const },
    { label: "Open", x: MARGIN_X + 444, width: 72, align: "right" as const }
  ];

  page.drawRectangle({
    x: MARGIN_X,
    y: tableTop - 20,
    width: CONTENT_WIDTH,
    height: 24,
    color: SURFACE,
    borderColor: SLATE_300,
    borderWidth: 1
  });

  for (const column of columns) {
    drawCellText(page, boldFont, column.label, column.x, tableTop - 12, 9, SLATE_500, column.width, column.align);
  }

  let rowY = tableTop - 28;
  const invoices = input.invoices.length ? input.invoices : [{ invoiceNumber: "No open invoices", dueDate: "", statusLabel: "", total: 0, balanceDue: 0 }];
  for (const invoice of invoices) {
    ensurePageSpace(state, 28);
    page.drawLine({
      start: { x: MARGIN_X, y: rowY },
      end: { x: PAGE_WIDTH - MARGIN_X, y: rowY },
      thickness: 1,
      color: SLATE_300
    });
    rowY -= 16;
    drawCellText(page, regularFont, invoice.invoiceNumber || "Draft", columns[0].x, rowY, 10.5, SLATE_900, columns[0].width);
    drawCellText(
      page,
      regularFont,
      formatCalendarDate(invoice.dueDate ?? undefined),
      columns[1].x,
      rowY,
      10.5,
      SLATE_700,
      columns[1].width
    );
    drawCellText(page, regularFont, invoice.statusLabel || "Open", columns[2].x, rowY, 10.5, SLATE_700, columns[2].width);
    drawCellText(
      page,
      regularFont,
      formatMoney(invoice.total, input.currency ?? undefined),
      columns[3].x,
      rowY,
      10.5,
      SLATE_900,
      columns[3].width,
      "right"
    );
    drawCellText(
      page,
      boldFont,
      formatMoney(invoice.balanceDue, input.currency ?? undefined),
      columns[4].x,
      rowY,
      10.5,
      SLATE_900,
      columns[4].width,
      "right"
    );
    rowY -= 12;
  }

  page.drawLine({
    start: { x: MARGIN_X, y: rowY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: rowY },
    thickness: 1,
    color: SLATE_300
  });
  state.cursorY = rowY - 28;
}

function renderTotals(state: RenderState, input: ClientStatementPdfInput): void {
  ensurePageSpace(state, 64);
  const { page, regularFont, boldFont } = state;
  const boxY = state.cursorY - 44;
  page.drawRectangle({
    x: PAGE_WIDTH - MARGIN_X - 220,
    y: boxY,
    width: 220,
    height: 44,
    borderColor: SLATE_300,
    borderWidth: 1,
    color: SURFACE
  });
  page.drawText("Total open balance", {
    x: PAGE_WIDTH - MARGIN_X - 204,
    y: boxY + 26,
    size: 10,
    font: regularFont,
    color: SLATE_700
  });
  const value = formatMoney(input.openBalance, input.currency ?? undefined);
  page.drawText(value, {
    x: PAGE_WIDTH - MARGIN_X - 16 - boldFont.widthOfTextAtSize(value, 14),
    y: boxY + 24,
    size: 14,
    font: boldFont,
    color: SLATE_900
  });
  state.cursorY = boxY - 18;
}

function renderFooter(state: RenderState): void {
  const { page, regularFont } = state;
  page.drawText("Generated from NoteBill client workspace.", {
    x: MARGIN_X,
    y: BOTTOM_Y - 8,
    size: 9,
    font: regularFont,
    color: SLATE_500
  });
}

function drawMetaRow(
  page: PDFPage,
  boldFont: PDFFont,
  regularFont: PDFFont,
  label: string,
  value: string,
  y: number
): void {
  page.drawText(label, {
    x: MARGIN_X + 16,
    y,
    size: 10,
    font: boldFont,
    color: SLATE_500
  });
  page.drawText(value, {
    x: MARGIN_X + 140,
    y,
    size: 10.5,
    font: regularFont,
    color: SLATE_900
  });
}

function drawCellText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
  width: number,
  align: "left" | "right" = "left"
): void {
  const safeText = String(text ?? "");
  const textX =
    align === "right" ? x + width - font.widthOfTextAtSize(safeText, size) : x;
  page.drawText(safeText, {
    x: textX,
    y,
    size,
    font,
    color
  });
}

function ensurePageSpace(state: RenderState, neededHeight: number): void {
  if (state.cursorY - neededHeight >= BOTTOM_Y) {
    return;
  }
  state.page = state.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  state.cursorY = TOP_Y;
}

function formatCalendarDate(value: string | null | undefined): string {
  const parsed = new Date(value ?? "");
  if (Number.isNaN(parsed.getTime())) {
    return "Not set";
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatMoney(value: number | null | undefined, currency = "USD"): string {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }
}
