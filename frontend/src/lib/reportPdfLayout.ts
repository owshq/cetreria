import type { jsPDF } from 'jspdf';

export type ReportPdfLayoutConfig = {
  pageMargin: number;
  lineHeight: number;
  contentTop: number;
  footerReserve?: number;
};

export function createReportPdfLayout(config: ReportPdfLayoutConfig) {
  const footerReserve = config.footerReserve ?? 20;

  function footerLimit(pdf: jsPDF): number {
    return pdf.internal.pageSize.getHeight() - footerReserve;
  }

  function usablePageContentHeight(pdf: jsPDF): number {
    return footerLimit(pdf) - config.contentTop;
  }

  function ensureSpace(pdf: jsPDF, y: number, needed: number): number {
    if (y + needed > footerLimit(pdf)) {
      pdf.addPage();
      return config.contentTop;
    }
    return y;
  }

  function ensureSectionStart(pdf: jsPDF, y: number, blockHeight: number): number {
    const required = Math.min(blockHeight, usablePageContentHeight(pdf));
    if (y + required > footerLimit(pdf)) {
      pdf.addPage();
      return config.contentTop;
    }
    return y;
  }

  function estimateWrappedTextHeight(
    pdf: jsPDF,
    text: string,
    width: number,
    fontSize: number,
  ): number {
    pdf.setFontSize(fontSize);
    const lines = pdf.splitTextToSize(text, width);
    return Math.max(config.lineHeight, lines.length * config.lineHeight) + 2;
  }

  function estimateSectionTitleHeight(pdf: jsPDF, title: string, contentWidth: number): number {
    return (
      config.lineHeight +
      4 +
      6 +
      estimateWrappedTextHeight(pdf, title, contentWidth, 12)
    );
  }

  function estimateBulletListHeight(pdf: jsPDF, bullets: string[], contentWidth: number): number {
    if (bullets.length === 0) return config.lineHeight;
    return bullets.reduce(
      (sum, bullet) =>
        sum +
        estimateWrappedTextHeight(pdf, `\u2022 ${bullet}`, contentWidth, 10),
      0,
    );
  }

  return {
    footerLimit,
    usablePageContentHeight,
    ensureSpace,
    ensureSectionStart,
    estimateWrappedTextHeight,
    estimateSectionTitleHeight,
    estimateBulletListHeight,
  };
}

export type ReportPdfLayout = ReturnType<typeof createReportPdfLayout>;
