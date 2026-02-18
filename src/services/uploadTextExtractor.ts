import pdfParse from "pdf-parse";
import { runImageOcrTask } from "../ai/openaiClient.js";

export type UploadedFile = {
  mimetype: string;
  buffer: Buffer;
};

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

export type ImageOcrExtraction = {
  text: string;
  warnings: string[];
};

export async function extractUploadedInvoiceText(file: UploadedFile): Promise<string> {
  if (!file.buffer.length) {
    throw new Error("Uploaded file is empty.");
  }

  if (file.mimetype === "application/pdf") {
    const parsed = await pdfParse(file.buffer);
    const text = parsed.text.trim();

    if (!text) {
      throw new Error("Could not extract text from the uploaded PDF.");
    }

    return text;
  }

  if (file.mimetype.startsWith("text/") || file.mimetype === "application/json") {
    const text = file.buffer.toString("utf8").trim();
    if (!text) {
      throw new Error("Uploaded text file is empty.");
    }
    return text;
  }

  throw new Error(`Unsupported file type: ${file.mimetype}. Upload PDF or text.`);
}

export async function extractUploadedImageText(file: UploadedFile): Promise<ImageOcrExtraction> {
  if (!file.buffer.length) {
    throw new Error("Uploaded file is empty.");
  }
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new Error(`Unsupported image type: ${file.mimetype}. Upload PNG, JPG, or WEBP.`);
  }
  const ocrResult = await runImageOcrTask({
    mimeType: file.mimetype,
    base64Data: file.buffer.toString("base64")
  });
  const text = ocrResult.extractedText.trim();
  if (!text) {
    throw new Error("Could not extract readable text from the uploaded image.");
  }
  const warnings = new Set<string>();
  if (text.length < 30) {
    warnings.add("Very little text was detected. Please review carefully.");
  }
  (ocrResult.warnings ?? []).forEach((warning) => {
    if (typeof warning === "string" && warning.trim()) {
      warnings.add(warning.trim());
    }
  });
  return {
    text,
    warnings: Array.from(warnings)
  };
}
