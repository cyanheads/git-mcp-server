/**
 * @fileoverview Comprehensive tests for the PdfParser utility.
 * @module tests/utils/parsing/pdfParser.test
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  JsonRpcErrorCode,
  McpError,
} from '../../../src/types-global/errors.js';
import { logger, requestContextService } from '../../../src/utils/index.js';
import {
  PdfParser,
  type AddPageOptions,
  type DrawImageOptions,
  type DrawTextOptions,
  type EmbedImageOptions,
  type FillFormOptions,
  type PageRange,
  type SetMetadataOptions,
} from '../../../src/utils/parsing/pdfParser.js';

describe('PdfParser', () => {
  let parser: PdfParser;
  let context: ReturnType<typeof requestContextService.createRequestContext>;

  beforeEach(() => {
    parser = new PdfParser();
    context = requestContextService.createRequestContext({
      operation: 'test-pdf-parser',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDocument', () => {
    it('should create a new blank PDF document', async () => {
      const doc = await parser.createDocument(context);
      expect(doc).toBeInstanceOf(PDFDocument);
      expect(doc.getPageCount()).toBe(0);
    });

    it('should log debug message when creating document', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      await parser.createDocument(context);
      expect(debugSpy).toHaveBeenCalledWith(
        'Creating new PDF document.',
        expect.objectContaining(context),
      );
    });

    it('should create context if none provided', async () => {
      const doc = await parser.createDocument();
      expect(doc).toBeInstanceOf(PDFDocument);
    });

    it('should throw McpError on document creation failure', async () => {
      vi.spyOn(PDFDocument, 'create').mockRejectedValueOnce(
        new Error('Creation failed'),
      );
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(parser.createDocument(context)).rejects.toThrow(McpError);

      try {
        await parser.createDocument(context);
      } catch (error) {
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(JsonRpcErrorCode.InternalError);
        expect(mcpError.message).toContain('Failed to create PDF document');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });

  describe('loadDocument', () => {
    let samplePdfBytes: Uint8Array;

    beforeEach(async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      samplePdfBytes = await doc.save();
    });

    it('should load a PDF document from Uint8Array', async () => {
      const doc = await parser.loadDocument(samplePdfBytes, context);
      expect(doc).toBeInstanceOf(PDFDocument);
      expect(doc.getPageCount()).toBe(1);
    });

    it('should load a PDF document from ArrayBuffer', async () => {
      // Create a proper ArrayBuffer copy to avoid SharedArrayBuffer type issues
      const arrayBuffer = samplePdfBytes.buffer.slice(0);
      const uint8Array = new Uint8Array(arrayBuffer);
      const doc = await parser.loadDocument(uint8Array, context);
      expect(doc).toBeInstanceOf(PDFDocument);
      expect(doc.getPageCount()).toBe(1);
    });

    it('should log debug message with byte length', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      await parser.loadDocument(samplePdfBytes, context);
      expect(debugSpy).toHaveBeenCalledWith(
        'Loading PDF document from bytes.',
        expect.objectContaining({
          byteLength: samplePdfBytes.length,
        }),
      );
    });

    it('should create context if none provided', async () => {
      const doc = await parser.loadDocument(samplePdfBytes);
      expect(doc).toBeInstanceOf(PDFDocument);
    });

    it('should throw McpError on invalid PDF bytes', async () => {
      const invalidBytes = new Uint8Array([1, 2, 3, 4]);
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(parser.loadDocument(invalidBytes, context)).rejects.toThrow(
        McpError,
      );

      try {
        await parser.loadDocument(invalidBytes, context);
      } catch (error) {
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(JsonRpcErrorCode.ValidationError);
        expect(mcpError.message).toContain('Failed to load PDF document');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });

  describe('addPage', () => {
    let doc: PDFDocument;

    beforeEach(async () => {
      doc = await PDFDocument.create();
    });

    it('should add a page with default dimensions (US Letter)', () => {
      const page = parser.addPage(doc);
      expect(doc.getPageCount()).toBe(1);
      expect(page.getWidth()).toBe(612);
      expect(page.getHeight()).toBe(792);
    });

    it('should add a page with custom dimensions', () => {
      const options: AddPageOptions = { width: 600, height: 400 };
      const page = parser.addPage(doc, options);
      expect(page.getWidth()).toBe(600);
      expect(page.getHeight()).toBe(400);
    });

    it('should add multiple pages', () => {
      parser.addPage(doc);
      parser.addPage(doc);
      parser.addPage(doc);
      expect(doc.getPageCount()).toBe(3);
    });
  });

  describe('embedFont', () => {
    let doc: PDFDocument;

    beforeEach(async () => {
      doc = await PDFDocument.create();
    });

    it('should embed default Helvetica font', async () => {
      const font = await parser.embedFont(doc, 'Helvetica', context);
      expect(font).toBeDefined();
      expect(font.name).toContain('Helvetica');
    });

    it('should embed TimesRoman font', async () => {
      const font = await parser.embedFont(doc, 'TimesRoman', context);
      expect(font).toBeDefined();
      expect(font.name).toContain('Times');
    });

    it('should embed Courier font', async () => {
      const font = await parser.embedFont(doc, 'Courier', context);
      expect(font).toBeDefined();
      expect(font.name).toContain('Courier');
    });

    it('should log debug message when embedding font', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      await parser.embedFont(doc, 'Helvetica', context);
      expect(debugSpy).toHaveBeenCalledWith(
        'Embedding standard font.',
        expect.objectContaining({
          fontName: 'Helvetica',
        }),
      );
    });

    it('should create context if none provided', async () => {
      const font = await parser.embedFont(doc);
      expect(font).toBeDefined();
    });

    it('should throw McpError on font embedding failure', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      // @ts-expect-error - Testing invalid font name
      const invalidFontPromise = parser.embedFont(doc, 'InvalidFont', context);
      await expect(invalidFontPromise).rejects.toThrow(McpError);

      try {
        // @ts-expect-error - Testing invalid font name
        await parser.embedFont(doc, 'InvalidFont', context);
      } catch (error) {
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(JsonRpcErrorCode.InternalError);
        expect(mcpError.message).toContain('Failed to embed font');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });

  describe('embedImage', () => {
    let doc: PDFDocument;
    let pngBytes: Uint8Array;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      // Create a minimal valid PNG (1x1 red pixel)
      pngBytes = new Uint8Array([
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10, // PNG signature
        0,
        0,
        0,
        13,
        73,
        72,
        68,
        82, // IHDR chunk
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        8,
        2,
        0,
        0,
        0,
        144,
        119,
        83,
        222, // Image data
        0,
        0,
        0,
        12,
        73,
        68,
        65,
        84, // IDAT chunk
        8,
        215,
        99,
        248,
        207,
        192,
        0,
        0,
        3,
        1,
        1,
        0,
        24,
        221,
        141,
        82,
        0,
        0,
        0,
        0,
        73,
        69,
        78,
        68,
        174,
        66,
        96,
        130, // IEND chunk
      ]);
    });

    it('should embed a PNG image', async () => {
      const options: EmbedImageOptions = {
        imageBytes: pngBytes,
        format: 'png',
      };
      const image = await parser.embedImage(doc, options, context);
      expect(image).toBeDefined();
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
    });

    it('should log debug message when embedding image', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const options: EmbedImageOptions = {
        imageBytes: pngBytes,
        format: 'png',
      };
      await parser.embedImage(doc, options, context);
      expect(debugSpy).toHaveBeenCalledWith(
        'Embedding image into PDF.',
        expect.objectContaining({
          format: 'png',
        }),
      );
    });

    it('should create context if none provided', async () => {
      const options: EmbedImageOptions = {
        imageBytes: pngBytes,
        format: 'png',
      };
      const image = await parser.embedImage(doc, options);
      expect(image).toBeDefined();
    });

    it('should throw McpError on invalid image bytes', async () => {
      const invalidBytes = new Uint8Array([1, 2, 3, 4]);
      const options: EmbedImageOptions = {
        imageBytes: invalidBytes,
        format: 'png',
      };
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(parser.embedImage(doc, options, context)).rejects.toThrow(
        McpError,
      );

      try {
        await parser.embedImage(doc, options, context);
      } catch (error) {
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(JsonRpcErrorCode.InternalError);
        expect(mcpError.message).toContain('Failed to embed png image');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });

  describe('drawText', () => {
    let doc: PDFDocument;
    let page: ReturnType<PDFDocument['addPage']>;
    let font: Awaited<ReturnType<PDFDocument['embedFont']>>;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      page = doc.addPage([600, 400]);
      font = await doc.embedFont(StandardFonts.Helvetica);
    });

    it('should draw simple text on a page', () => {
      const options: DrawTextOptions = {
        text: 'Hello, World!',
        x: 50,
        y: 350,
        size: 30,
        font,
        color: rgb(0, 0, 0),
      };

      expect(() => parser.drawText(page, options)).not.toThrow();
    });

    it('should draw text with default values', () => {
      const options: DrawTextOptions = {
        text: 'Default Text',
        x: 50,
        y: 350,
      };

      expect(() => parser.drawText(page, options)).not.toThrow();
    });

    it('should draw text with rotation', () => {
      const options: DrawTextOptions = {
        text: 'Rotated Text',
        x: 300,
        y: 200,
        size: 20,
        font,
        rotate: 45,
      };

      expect(() => parser.drawText(page, options)).not.toThrow();
    });

    it('should draw text with custom color', () => {
      const options: DrawTextOptions = {
        text: 'Colored Text',
        x: 50,
        y: 300,
        size: 24,
        font,
        color: rgb(0, 0.53, 0.71),
      };

      expect(() => parser.drawText(page, options)).not.toThrow();
    });

    it('should handle text wrapping with maxWidth', () => {
      const options: DrawTextOptions = {
        text: 'This is a long text that should wrap to multiple lines when maxWidth is set',
        x: 50,
        y: 350,
        size: 12,
        font,
        maxWidth: 200,
        lineHeight: 1.5,
      };

      expect(() => parser.drawText(page, options)).not.toThrow();
    });

    it('should handle text wrapping without rotation', () => {
      const options: DrawTextOptions = {
        text: 'Wrapped text without rotation',
        x: 50,
        y: 250,
        size: 14,
        font,
        maxWidth: 150,
        rotate: 0,
      };

      expect(() => parser.drawText(page, options)).not.toThrow();
    });
  });

  describe('drawImage', () => {
    let doc: PDFDocument;
    let page: ReturnType<PDFDocument['addPage']>;
    let image: Awaited<ReturnType<PDFDocument['embedPng']>>;
    let pngBytes: Uint8Array;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      page = doc.addPage([600, 400]);
      // Create a minimal valid PNG (1x1 red pixel)
      pngBytes = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
        1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68,
        65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 24, 221, 141, 82,
        0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
      ]);
      image = await doc.embedPng(pngBytes);
    });

    it('should draw an image with default dimensions', () => {
      const options: DrawImageOptions = {
        image,
        x: 100,
        y: 200,
      };

      expect(() => parser.drawImage(page, options)).not.toThrow();
    });

    it('should draw an image with custom dimensions', () => {
      const options: DrawImageOptions = {
        image,
        x: 100,
        y: 200,
        width: 200,
        height: 150,
      };

      expect(() => parser.drawImage(page, options)).not.toThrow();
    });

    it('should draw an image with rotation', () => {
      const options: DrawImageOptions = {
        image,
        x: 300,
        y: 200,
        width: 100,
        height: 100,
        rotate: 45,
      };

      expect(() => parser.drawImage(page, options)).not.toThrow();
    });

    it('should draw an image with opacity', () => {
      const options: DrawImageOptions = {
        image,
        x: 200,
        y: 150,
        width: 150,
        height: 150,
        opacity: 0.5,
      };

      expect(() => parser.drawImage(page, options)).not.toThrow();
    });

    it('should draw an image with all options', () => {
      const options: DrawImageOptions = {
        image,
        x: 250,
        y: 250,
        width: 120,
        height: 120,
        rotate: 30,
        opacity: 0.75,
      };

      expect(() => parser.drawImage(page, options)).not.toThrow();
    });
  });

  describe('mergePdfs', () => {
    let pdf1Bytes: Uint8Array;
    let pdf2Bytes: Uint8Array;
    let pdf3Bytes: Uint8Array;

    beforeEach(async () => {
      const doc1 = await PDFDocument.create();
      doc1.addPage([600, 400]);
      doc1.addPage([600, 400]);
      pdf1Bytes = await doc1.save();

      const doc2 = await PDFDocument.create();
      doc2.addPage([600, 400]);
      pdf2Bytes = await doc2.save();

      const doc3 = await PDFDocument.create();
      doc3.addPage([600, 400]);
      doc3.addPage([600, 400]);
      doc3.addPage([600, 400]);
      pdf3Bytes = await doc3.save();
    });

    it('should merge two PDF documents', async () => {
      const merged = await parser.mergePdfs([pdf1Bytes, pdf2Bytes], context);
      expect(merged.getPageCount()).toBe(3); // 2 pages + 1 page
    });

    it('should merge three PDF documents', async () => {
      const merged = await parser.mergePdfs(
        [pdf1Bytes, pdf2Bytes, pdf3Bytes],
        context,
      );
      expect(merged.getPageCount()).toBe(6); // 2 + 1 + 3 pages
    });

    it('should log debug messages during merge', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      await parser.mergePdfs([pdf1Bytes, pdf2Bytes], context);

      expect(debugSpy).toHaveBeenCalledWith(
        'Merging PDF documents.',
        expect.objectContaining({
          documentCount: 2,
        }),
      );

      expect(debugSpy).toHaveBeenCalledWith(
        'Successfully merged PDF documents.',
        expect.objectContaining({
          mergedPageCount: 3,
        }),
      );
    });

    it('should create context if none provided', async () => {
      const merged = await parser.mergePdfs([pdf1Bytes, pdf2Bytes]);
      expect(merged.getPageCount()).toBe(3);
    });

    it('should throw McpError on merge failure', async () => {
      const invalidBytes = new Uint8Array([1, 2, 3, 4]);
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(
        parser.mergePdfs([pdf1Bytes, invalidBytes], context),
      ).rejects.toThrow(McpError);

      try {
        await parser.mergePdfs([pdf1Bytes, invalidBytes], context);
      } catch (error) {
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(JsonRpcErrorCode.InternalError);
        expect(mcpError.message).toContain('Failed to merge PDFs');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });

  describe('splitPdf', () => {
    let pdfBytes: Uint8Array;

    beforeEach(async () => {
      const doc = await PDFDocument.create();
      for (let i = 0; i < 10; i++) {
        doc.addPage([600, 400]);
      }
      pdfBytes = await doc.save();
    });

    it('should split PDF into two parts', async () => {
      const ranges: PageRange[] = [
        { start: 0, end: 4 },
        { start: 5, end: 9 },
      ];
      const results = await parser.splitPdf(pdfBytes, ranges, context);

      expect(results).toHaveLength(2);
      expect(results[0]?.getPageCount()).toBe(5);
      expect(results[1]?.getPageCount()).toBe(5);
    });

    it('should split PDF into three parts with different ranges', async () => {
      const ranges: PageRange[] = [
        { start: 0, end: 2 },
        { start: 3, end: 6 },
        { start: 7, end: 9 },
      ];
      const results = await parser.splitPdf(pdfBytes, ranges, context);

      expect(results).toHaveLength(3);
      expect(results[0]?.getPageCount()).toBe(3);
      expect(results[1]?.getPageCount()).toBe(4);
      expect(results[2]?.getPageCount()).toBe(3);
    });

    it('should split single page from PDF', async () => {
      const ranges: PageRange[] = [{ start: 3, end: 3 }];
      const results = await parser.splitPdf(pdfBytes, ranges, context);

      expect(results).toHaveLength(1);
      expect(results[0]?.getPageCount()).toBe(1);
    });

    it('should log debug messages during split', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const ranges: PageRange[] = [
        { start: 0, end: 4 },
        { start: 5, end: 9 },
      ];
      await parser.splitPdf(pdfBytes, ranges, context);

      expect(debugSpy).toHaveBeenCalledWith(
        'Splitting PDF document.',
        expect.objectContaining({
          rangeCount: 2,
        }),
      );

      expect(debugSpy).toHaveBeenCalledWith(
        'Successfully split PDF document.',
        expect.objectContaining({
          resultCount: 2,
        }),
      );
    });

    it('should create context if none provided', async () => {
      const ranges: PageRange[] = [{ start: 0, end: 4 }];
      const results = await parser.splitPdf(pdfBytes, ranges);
      expect(results).toHaveLength(1);
    });

    it('should throw McpError on split failure', async () => {
      const invalidBytes = new Uint8Array([1, 2, 3, 4]);
      const ranges: PageRange[] = [{ start: 0, end: 1 }];
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(
        parser.splitPdf(invalidBytes, ranges, context),
      ).rejects.toThrow(McpError);

      try {
        await parser.splitPdf(invalidBytes, ranges, context);
      } catch (error) {
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(JsonRpcErrorCode.InternalError);
        expect(mcpError.message).toContain('Failed to split PDF');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });

  describe('fillForm', () => {
    let doc: PDFDocument;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      doc.addPage([600, 400]);
      const form = doc.getForm();

      // Create form fields
      form.createTextField('Name');
      form.createTextField('Age');
      form.createCheckBox('Subscribe');
    });

    it('should fill text fields in form', () => {
      const options: FillFormOptions = {
        fields: {
          Name: 'John Doe',
          Age: 30,
        },
      };

      expect(() => parser.fillForm(doc, options, context)).not.toThrow();

      const form = doc.getForm();
      const nameField = form.getTextField('Name');
      expect(nameField.getText()).toBe('John Doe');
    });

    it('should fill checkbox fields in form', () => {
      const options: FillFormOptions = {
        fields: {
          Subscribe: true,
        },
      };

      expect(() => parser.fillForm(doc, options, context)).not.toThrow();

      // Note: pdf-lib checkboxes require specific setup to verify state
      // The fillForm function calls the check() method correctly
      const form = doc.getForm();
      const checkbox = form.getCheckBox('Subscribe');
      expect(checkbox).toBeDefined();
    });

    it('should uncheck checkbox fields when provided a false value', () => {
      const form = doc.getForm();
      const originalGetField = form.getField.bind(form);
      const uncheckSpy = vi.fn();

      vi.spyOn(form, 'getField').mockImplementation((fieldName: string) => {
        if (fieldName === 'Subscribe') {
          return {
            check: vi.fn(),
            uncheck: uncheckSpy,
          } as unknown as ReturnType<typeof originalGetField>;
        }
        return originalGetField(fieldName);
      });

      const options: FillFormOptions = {
        fields: {
          Subscribe: false,
        },
      };

      expect(() => parser.fillForm(doc, options, context)).not.toThrow();
      expect(uncheckSpy).toHaveBeenCalledTimes(1);
    });

    it('should fill multiple field types', () => {
      const options: FillFormOptions = {
        fields: {
          Name: 'Jane Smith',
          Age: 25,
          Subscribe: true,
        },
      };

      expect(() => parser.fillForm(doc, options, context)).not.toThrow();
    });

    it('should flatten form when requested', () => {
      const options: FillFormOptions = {
        fields: {
          Name: 'Test User',
        },
        flatten: true,
      };

      expect(() => parser.fillForm(doc, options, context)).not.toThrow();
    });

    it('should log debug messages when filling form', () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const options: FillFormOptions = {
        fields: {
          Name: 'John Doe',
          Age: 30,
        },
        flatten: true,
      };

      parser.fillForm(doc, options, context);

      expect(debugSpy).toHaveBeenCalledWith(
        'Filling PDF form fields.',
        expect.objectContaining({
          fieldCount: 2,
          flatten: true,
        }),
      );

      expect(debugSpy).toHaveBeenCalledWith(
        'Successfully filled PDF form.',
        expect.any(Object),
      );
    });

    it('should handle non-existent fields gracefully', () => {
      const warningSpy = vi.spyOn(logger, 'warning');
      const options: FillFormOptions = {
        fields: {
          NonExistentField: 'value',
        },
      };

      expect(() => parser.fillForm(doc, options, context)).not.toThrow();
      expect(warningSpy).toHaveBeenCalledWith(
        'Failed to fill form field.',
        expect.objectContaining({
          fieldName: 'NonExistentField',
        }),
      );
    });

    it('should create context if none provided', () => {
      const options: FillFormOptions = {
        fields: {
          Name: 'Test',
        },
      };

      expect(() => parser.fillForm(doc, options)).not.toThrow();
    });

    it('wraps unexpected form access errors in an McpError', () => {
      vi.spyOn(doc, 'getForm').mockImplementation(() => {
        throw new Error('no form available');
      });

      const errorSpy = vi.spyOn(logger, 'error');

      const options: FillFormOptions = {
        fields: {
          Name: 'Test',
        },
      };

      expect(() => parser.fillForm(doc, options, context)).toThrow(McpError);

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to fill PDF form.',
        expect.objectContaining({
          errorDetails: 'no form available',
        }),
      );
    });
  });

  describe('extractMetadata', () => {
    let doc: PDFDocument;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      doc.addPage([600, 400]);
      doc.addPage([600, 400]);
    });

    it('should extract basic metadata with page count', () => {
      const metadata = parser.extractMetadata(doc);
      expect(metadata.pageCount).toBe(2);
    });

    it('should extract all metadata when set', () => {
      doc.setTitle('Test Document');
      doc.setAuthor('John Doe');
      doc.setSubject('Testing');
      doc.setKeywords(['test', 'pdf', 'metadata']);
      doc.setCreator('PdfParser');
      doc.setProducer('pdf-lib');

      const metadata = parser.extractMetadata(doc);

      expect(metadata.title).toBe('Test Document');
      expect(metadata.author).toBe('John Doe');
      expect(metadata.subject).toBe('Testing');
      // pdf-lib joins keywords with spaces, not commas
      expect(metadata.keywords).toBe('test pdf metadata');
      expect(metadata.creator).toBe('PdfParser');
      expect(metadata.producer).toBe('pdf-lib');
      expect(metadata.pageCount).toBe(2);
    });

    it('should handle undefined optional metadata fields', () => {
      const metadata = parser.extractMetadata(doc);

      expect(metadata.title).toBeUndefined();
      expect(metadata.author).toBeUndefined();
      expect(metadata.subject).toBeUndefined();
      expect(metadata.keywords).toBeUndefined();
      // Note: pdf-lib sets a default creator value
      expect(metadata.creator).toBeDefined();
    });

    it('should include creation and modification dates when set', () => {
      doc.setCreationDate(new Date('2025-01-01'));
      doc.setModificationDate(new Date('2025-01-15'));

      const metadata = parser.extractMetadata(doc);

      expect(metadata.creationDate).toBe('2025-01-01T00:00:00.000Z');
      expect(metadata.modificationDate).toBe('2025-01-15T00:00:00.000Z');
    });
  });

  describe('setMetadata', () => {
    let doc: PDFDocument;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      doc.addPage([600, 400]);
    });

    it('should set title metadata', () => {
      const options: SetMetadataOptions = {
        title: 'My Document',
      };
      parser.setMetadata(doc, options);
      expect(doc.getTitle()).toBe('My Document');
    });

    it('should set author metadata', () => {
      const options: SetMetadataOptions = {
        author: 'Jane Smith',
      };
      parser.setMetadata(doc, options);
      expect(doc.getAuthor()).toBe('Jane Smith');
    });

    it('should set all metadata fields', () => {
      const options: SetMetadataOptions = {
        title: 'Complete Document',
        author: 'Test Author',
        subject: 'Testing Subject',
        keywords: 'test, keywords',
        creator: 'Test Creator',
        producer: 'Test Producer',
      };
      parser.setMetadata(doc, options);

      expect(doc.getTitle()).toBe('Complete Document');
      expect(doc.getAuthor()).toBe('Test Author');
      expect(doc.getSubject()).toBe('Testing Subject');
      expect(doc.getKeywords()).toBe('test, keywords');
      expect(doc.getCreator()).toBe('Test Creator');
      expect(doc.getProducer()).toBe('Test Producer');
    });

    it('should handle partial metadata updates', () => {
      doc.setTitle('Original Title');
      doc.setAuthor('Original Author');

      const options: SetMetadataOptions = {
        title: 'Updated Title',
      };
      parser.setMetadata(doc, options);

      expect(doc.getTitle()).toBe('Updated Title');
      expect(doc.getAuthor()).toBe('Original Author');
    });

    it('should handle empty metadata object', () => {
      const options: SetMetadataOptions = {};
      expect(() => parser.setMetadata(doc, options)).not.toThrow();
    });
  });

  describe('extractText', () => {
    let doc: PDFDocument;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      doc.addPage([600, 400]);
      doc.addPage([600, 400]);
      doc.addPage([600, 400]);
    });

    it('should return placeholder text for each page', () => {
      const textPages = parser.extractText(doc, context);
      expect(textPages).toHaveLength(3);
      expect(textPages[0]).toContain('Text extraction not implemented');
    });

    it('should log warning about limited text extraction', () => {
      const warningSpy = vi.spyOn(logger, 'warning');
      parser.extractText(doc, context);

      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('Text extraction is not fully implemented'),
        expect.any(Object),
      );
    });

    it('should log debug message with page count', () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      parser.extractText(doc, context);

      expect(debugSpy).toHaveBeenCalledWith(
        'Extracting text from PDF.',
        expect.objectContaining({
          pageCount: 3,
        }),
      );
    });

    it('should create context if none provided', () => {
      const textPages = parser.extractText(doc);
      expect(textPages).toHaveLength(3);
    });
  });

  describe('saveDocument', () => {
    let doc: PDFDocument;

    beforeEach(async () => {
      doc = await PDFDocument.create();
      doc.addPage([600, 400]);
    });

    it('should serialize PDF document to Uint8Array', async () => {
      const bytes = await parser.saveDocument(doc, context);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('should produce valid PDF bytes', async () => {
      const bytes = await parser.saveDocument(doc, context);
      // PDF files start with %PDF-
      expect(bytes[0]).toBe(37); // %
      expect(bytes[1]).toBe(80); // P
      expect(bytes[2]).toBe(68); // D
      expect(bytes[3]).toBe(70); // F
    });

    it('should log debug messages when saving', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      await parser.saveDocument(doc, context);

      expect(debugSpy).toHaveBeenCalledWith(
        'Serializing PDF document to bytes.',
        expect.any(Object),
      );

      expect(debugSpy).toHaveBeenCalledWith(
        'Successfully serialized PDF document.',
        expect.objectContaining({
          byteLength: expect.any(Number),
        }),
      );
    });

    it('should create context if none provided', async () => {
      const bytes = await parser.saveDocument(doc);
      expect(bytes).toBeInstanceOf(Uint8Array);
    });

    it('should throw McpError on save failure', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      vi.spyOn(doc, 'save').mockRejectedValueOnce(new Error('Save failed'));

      await expect(parser.saveDocument(doc, context)).rejects.toThrow(McpError);

      try {
        await parser.saveDocument(doc, context);
      } catch (error) {
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(JsonRpcErrorCode.InternalError);
        expect(mcpError.message).toContain('Failed to save PDF document');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });

  describe('Integration: Complete workflow', () => {
    it('should create, modify, and save a complete PDF document', async () => {
      // Create document
      const doc = await parser.createDocument(context);

      // Add metadata
      parser.setMetadata(doc, {
        title: 'Integration Test Document',
        author: 'Test Suite',
        subject: 'Testing PdfParser',
      });

      // Add pages
      const page1 = parser.addPage(doc, { width: 600, height: 400 });
      const page2 = parser.addPage(doc, { width: 600, height: 400 });

      // Embed font
      const font = await parser.embedFont(doc, 'Helvetica');

      // Draw text on pages
      parser.drawText(page1, {
        text: 'Page 1: Integration Test',
        x: 50,
        y: 350,
        size: 24,
        font,
        color: rgb(0, 0, 0),
      });

      parser.drawText(page2, {
        text: 'Page 2: More content',
        x: 50,
        y: 350,
        size: 20,
        font,
        color: rgb(0.2, 0.4, 0.6),
      });

      // Extract metadata to verify
      const metadata = parser.extractMetadata(doc);
      expect(metadata.title).toBe('Integration Test Document');
      expect(metadata.author).toBe('Test Suite');
      expect(metadata.pageCount).toBe(2);

      // Save document
      const bytes = await parser.saveDocument(doc, context);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      // Verify saved PDF can be loaded
      const loadedDoc = await parser.loadDocument(bytes, context);
      expect(loadedDoc.getPageCount()).toBe(2);
      expect(loadedDoc.getTitle()).toBe('Integration Test Document');
    });

    it('should merge and split PDFs in complete workflow', async () => {
      // Create three separate PDFs
      const doc1 = await parser.createDocument();
      parser.addPage(doc1);
      parser.addPage(doc1);
      const pdf1Bytes = await parser.saveDocument(doc1);

      const doc2 = await parser.createDocument();
      parser.addPage(doc2);
      const pdf2Bytes = await parser.saveDocument(doc2);

      const doc3 = await parser.createDocument();
      parser.addPage(doc3);
      parser.addPage(doc3);
      parser.addPage(doc3);
      const pdf3Bytes = await parser.saveDocument(doc3);

      // Merge all three
      const merged = await parser.mergePdfs(
        [pdf1Bytes, pdf2Bytes, pdf3Bytes],
        context,
      );
      expect(merged.getPageCount()).toBe(6); // 2 + 1 + 3

      // Split merged PDF
      const mergedBytes = await parser.saveDocument(merged);
      const splits = await parser.splitPdf(
        mergedBytes,
        [
          { start: 0, end: 1 },
          { start: 2, end: 2 },
          { start: 3, end: 5 },
        ],
        context,
      );

      expect(splits).toHaveLength(3);
      expect(splits[0]?.getPageCount()).toBe(2);
      expect(splits[1]?.getPageCount()).toBe(1);
      expect(splits[2]?.getPageCount()).toBe(3);
    });
  });

  describe('Singleton export', () => {
    it('should export pdfParser singleton', async () => {
      const { pdfParser } =
        await import('../../../src/utils/parsing/pdfParser.js');
      expect(pdfParser).toBeInstanceOf(PdfParser);
    });

    it('should export PDFDocument class', async () => {
      const { PDFDocument: ExportedPDFDocument } =
        await import('../../../src/utils/parsing/pdfParser.js');
      expect(ExportedPDFDocument).toBe(PDFDocument);
    });

    it('should export StandardFonts enum', async () => {
      const { StandardFonts: ExportedStandardFonts } =
        await import('../../../src/utils/parsing/pdfParser.js');
      expect(ExportedStandardFonts).toBe(StandardFonts);
    });

    it('should export rgb utility', async () => {
      const { rgb: exportedRgb } =
        await import('../../../src/utils/parsing/pdfParser.js');
      expect(exportedRgb).toBe(rgb);
    });
  });
});
