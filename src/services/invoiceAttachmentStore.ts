import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

type StoredAttachmentType = "photo" | "document" | "other";

type AttachmentFormat = {
  extension: string;
  type: StoredAttachmentType;
};

type AttachmentUploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type StoredInvoiceAttachment = {
  id: string;
  label: string;
  url: string;
  type: StoredAttachmentType;
  mimeType: string;
  sizeBytes: number;
  ownerKey: string;
  fileName: string;
};

const configuredAttachmentStoreDir = process.env.INVOICE_ATTACHMENT_STORE_DIR;
const attachmentStoreRootDir = configuredAttachmentStoreDir
  ? path.resolve(process.cwd(), configuredAttachmentStoreDir)
  : path.resolve(process.cwd(), "data", "invoice-attachments");

const OWNER_KEY_PATTERN = /^[a-f0-9]{16}$/;
const FILE_NAME_PATTERN = /^[a-f0-9-]{36}\.[a-z0-9]{1,10}$/i;

const formatByMimeType = new Map<string, AttachmentFormat>([
  ["application/pdf", { extension: ".pdf", type: "document" }],
  ["application/msword", { extension: ".doc", type: "document" }],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    { extension: ".docx", type: "document" }
  ],
  ["application/rtf", { extension: ".rtf", type: "document" }],
  ["text/plain", { extension: ".txt", type: "document" }],
  ["text/csv", { extension: ".csv", type: "document" }],
  ["application/vnd.ms-excel", { extension: ".xls", type: "document" }],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    { extension: ".xlsx", type: "document" }
  ],
  ["image/jpeg", { extension: ".jpg", type: "photo" }],
  ["image/jpg", { extension: ".jpg", type: "photo" }],
  ["image/png", { extension: ".png", type: "photo" }],
  ["image/webp", { extension: ".webp", type: "photo" }],
  ["image/gif", { extension: ".gif", type: "photo" }],
  ["image/heic", { extension: ".heic", type: "photo" }],
  ["image/heif", { extension: ".heif", type: "photo" }]
]);

const formatByExtension = new Map<string, AttachmentFormat>([
  [".pdf", { extension: ".pdf", type: "document" }],
  [".doc", { extension: ".doc", type: "document" }],
  [".docx", { extension: ".docx", type: "document" }],
  [".rtf", { extension: ".rtf", type: "document" }],
  [".txt", { extension: ".txt", type: "document" }],
  [".csv", { extension: ".csv", type: "document" }],
  [".xls", { extension: ".xls", type: "document" }],
  [".xlsx", { extension: ".xlsx", type: "document" }],
  [".jpg", { extension: ".jpg", type: "photo" }],
  [".jpeg", { extension: ".jpeg", type: "photo" }],
  [".png", { extension: ".png", type: "photo" }],
  [".webp", { extension: ".webp", type: "photo" }],
  [".gif", { extension: ".gif", type: "photo" }],
  [".heic", { extension: ".heic", type: "photo" }],
  [".heif", { extension: ".heif", type: "photo" }]
]);

export function getInvoiceAttachmentStoreRootDirPath(): string {
  return attachmentStoreRootDir;
}

export function buildInvoiceAttachmentFileUrl(ownerKey: string, fileName: string): string {
  return `/api/invoices/attachments/files/${encodeURIComponent(ownerKey)}/${encodeURIComponent(fileName)}`;
}

export function resolveStoredInvoiceAttachmentPath(ownerKey: string, fileName: string): string | null {
  const normalizedOwnerKey = ownerKey.trim().toLowerCase();
  if (!OWNER_KEY_PATTERN.test(normalizedOwnerKey)) {
    return null;
  }
  const normalizedFileName = fileName.trim().toLowerCase();
  if (!FILE_NAME_PATTERN.test(normalizedFileName)) {
    return null;
  }
  const ownerDir = path.resolve(attachmentStoreRootDir, normalizedOwnerKey);
  const filePath = path.resolve(ownerDir, normalizedFileName);
  if (!filePath.startsWith(`${ownerDir}${path.sep}`)) {
    return null;
  }
  return filePath;
}

export async function storeInvoiceAttachment(input: {
  ownerId: string;
  file: AttachmentUploadFile;
}): Promise<StoredInvoiceAttachment> {
  const ownerId = `${input.ownerId ?? ""}`.trim() || "local-default";
  const file = input.file;
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error("Attachment upload payload is missing file data.");
  }
  if (!file.size || file.size <= 0) {
    throw new Error("Attachment file is empty.");
  }

  const resolvedFormat = resolveAttachmentFormat(file);
  if (!resolvedFormat) {
    throw new Error("Unsupported attachment type. Upload PDF, document, or common image files.");
  }

  const ownerKey = createHash("sha256").update(ownerId).digest("hex").slice(0, 16);
  const attachmentId = randomUUID();
  const fileName = `${attachmentId}${resolvedFormat.extension.toLowerCase()}`;
  const ownerDir = path.resolve(attachmentStoreRootDir, ownerKey);
  const filePath = path.resolve(ownerDir, fileName);
  await fs.mkdir(ownerDir, { recursive: true });
  await fs.writeFile(filePath, file.buffer);

  return {
    id: attachmentId,
    label: deriveAttachmentLabel(file.originalname, resolvedFormat.type),
    url: buildInvoiceAttachmentFileUrl(ownerKey, fileName),
    type: resolvedFormat.type,
    mimeType: normalizeMimeType(file.mimetype),
    sizeBytes: file.size,
    ownerKey,
    fileName
  };
}

function resolveAttachmentFormat(file: AttachmentUploadFile): AttachmentFormat | null {
  const normalizedMimeType = normalizeMimeType(file.mimetype);
  const originalExtension = path.extname(file.originalname ?? "").trim().toLowerCase();
  const mimeFormat = formatByMimeType.get(normalizedMimeType);
  const extensionFormat = formatByExtension.get(originalExtension);

  if (mimeFormat) {
    if (extensionFormat && extensionFormat.type === mimeFormat.type) {
      return {
        extension: originalExtension || mimeFormat.extension,
        type: mimeFormat.type
      };
    }
    return mimeFormat;
  }

  if (extensionFormat) {
    return extensionFormat;
  }

  return null;
}

function deriveAttachmentLabel(originalName: string, type: StoredAttachmentType): string {
  const normalizedName = path.basename(`${originalName ?? ""}`.trim());
  const withoutExtension = normalizedName.replace(/\.[^.]+$/, "");
  const cleaned = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length > 0) {
    return cleaned.slice(0, 100);
  }
  if (type === "photo") {
    return "Job photo";
  }
  if (type === "document") {
    return "Attachment document";
  }
  return "Attachment";
}

function normalizeMimeType(value: string): string {
  return `${value ?? ""}`.trim().toLowerCase();
}
