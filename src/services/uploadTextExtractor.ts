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
  confidence: "high" | "medium" | "low";
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
  const externalWarnings = (ocrResult.warnings ?? []).filter(
    (warning): warning is string => typeof warning === "string" && warning.trim().length > 0
  );
  const lowConfidenceSignals: string[] = [];
  const lineCount = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  if (text.length < 30) {
    warnings.add("Very little text was detected. Please review carefully.");
    lowConfidenceSignals.push("short_text");
  }
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 6) {
    warnings.add("Low OCR confidence: only a small amount of readable text was found.");
    lowConfidenceSignals.push("very_low_word_count");
  }
  if (/[�]/.test(text)) {
    warnings.add("Some characters could not be read clearly.");
    lowConfidenceSignals.push("replacement_characters");
  }
  if (lowConfidenceSignals.length === 0 && wordCount >= 6 && wordCount < 20) {
    warnings.add("Only a modest amount of text was detected. Verify key fields carefully.");
  }
  if (lowConfidenceSignals.length === 0 && lineCount === 1 && wordCount >= 8) {
    warnings.add("OCR found one text line. Check that line breaks were not missed.");
  }
  externalWarnings.forEach((warning) => {
    warnings.add(warning.trim());
  });
  const confidence: ImageOcrExtraction["confidence"] =
    lowConfidenceSignals.length > 0 ? "low" : externalWarnings.length > 0 || wordCount < 20 ? "medium" : "high";
  return {
    text,
    warnings: Array.from(warnings),
    confidence
  };
}
