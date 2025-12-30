export type InvoiceLineItem = {
  name: string;
  variantLabel?: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type InvoiceParty = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type InvoiceOrder = {
  id: string;
  displayId?: string;
  currency: string;
  createdAtText?: string;
  status?: string;
  invoicePrefix?: string;
  customer?: InvoiceParty;
  shipping?: InvoiceParty;
  payment?: {
    method?: string;
    reference?: string;
  };
  seller?: InvoiceSellerProfile;
  notes?: string;
  bankDetails?: string;
  taxRatePercent?: number;
  totals: {
    subtotal?: number;
    shipping?: number;
    discount?: number;
    tax?: number;
    total?: number;
  };
  items: InvoiceLineItem[];
  qrValue: string;
};

export type InvoiceSellerProfile = {
  brandName: string;
  companyName?: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  gstin?: string;
  website?: string;
};

const toMoney = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const safe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const wrapText = (text: string, maxWidth: number, measure: (s: string) => number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (measure(next) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const getSellerProfile = (override?: InvoiceSellerProfile): InvoiceSellerProfile => {
  if (override?.brandName) return override;
  const brandName = safe((import.meta as any)?.env?.VITE_INVOICE_SELLER_NAME) || "PEARL BLOOM";
  const address = safe((import.meta as any)?.env?.VITE_INVOICE_SELLER_ADDRESS);
  const phone = safe((import.meta as any)?.env?.VITE_INVOICE_SELLER_PHONE) || undefined;
  const email = safe((import.meta as any)?.env?.VITE_INVOICE_SELLER_EMAIL) || undefined;
  const gstin = safe((import.meta as any)?.env?.VITE_INVOICE_SELLER_GSTIN) || undefined;
  const website = safe((import.meta as any)?.env?.VITE_INVOICE_SELLER_WEBSITE) || undefined;

  const addressLines = address
    ? address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : ["India"];

  return { brandName, addressLines, phone, email, gstin, website };
};

export async function generateInvoicePdf(order: InvoiceOrder) {
  const [{ PDFDocument, StandardFonts, rgb }, QRCode] = await Promise.all([
    import("pdf-lib"),
    import("qrcode"),
  ]);

  const doc = await PDFDocument.create();
  const pageSize: [number, number] = [595.28, 841.89]; // A4
  let page = doc.addPage(pageSize);
  let pageIndex = 1;

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const seller = getSellerProfile(order.seller);
  const margin = 40;
  const contentWidth = page.getWidth() - margin * 2;
  const topY = page.getHeight() - margin;

  const textColor = rgb(0.12, 0.12, 0.12);
  const subtle = rgb(0.45, 0.45, 0.45);
  const border = rgb(0.86, 0.86, 0.86);
  const brand = rgb(0.98, 0.76, 0.1);

  const drawText = (txt: string, x: number, y: number, size = 10, bold = false, color = textColor) => {
    page.drawText(txt, { x, y, size, font: bold ? fontBold : fontRegular, color });
  };

  const measure = (txt: string, size: number, bold = false) =>
    (bold ? fontBold : fontRegular).widthOfTextAtSize(txt, size);

  const ensureSpace = (needed: number) => {
    if (cursorY - needed >= margin) return;
    page = doc.addPage(pageSize);
    pageIndex += 1;
    cursorY = topY;
    drawPageHeader(true);
  };

  const formatDate = () => new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
  const prefix = safe(order.invoicePrefix) || "INV";
  const invoiceNo = `${prefix}-${safe(order.displayId) || order.id.slice(0, 8).toUpperCase()}`;
  const orderNo = safe(order.displayId) || order.id;

  const qrPngDataUrl = await QRCode.toDataURL(order.qrValue, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#111111", light: "#FFFFFF" },
  });
  const qrBytes = Uint8Array.from(atob(qrPngDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  const qrImage = await doc.embedPng(qrBytes);

  const headerHeight = 96;
  const boxRadius = 8;
  const qrBox = 74;

  const drawRoundedRect = (x: number, y: number, w: number, h: number, fill?: any) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: border,
      borderWidth: 1,
      color: fill,
      opacity: fill ? 1 : 0,
      borderOpacity: 1,
    });
    if (boxRadius) {
      page.drawRectangle({
        x: x + 1,
        y: y + 1,
        width: w - 2,
        height: h - 2,
        borderColor: border,
        borderWidth: 0,
      });
    }
  };

  const drawKeyValue = (label: string, value: string, x: number, y: number) => {
    drawText(label, x, y, 9, false, subtle);
    drawText(value || "—", x, y - 14, 11, true, textColor);
  };

  const drawPartyBlock = (title: string, party: InvoiceParty | undefined, x: number, y: number, w: number) => {
    drawText(title, x, y, 10, true, textColor);
    const lines: string[] = [];
    const name = safe(party?.name);
    const addr = safe(party?.address);
    const phone = safe(party?.phone);
    const email = safe(party?.email);
    if (name) lines.push(name);
    if (addr) lines.push(...addr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    if (phone) lines.push(`Phone: ${phone}`);
    if (email) lines.push(`Email: ${email}`);
    if (!lines.length) lines.push("—");

    let yy = y - 16;
    for (const line of lines) {
      const wrapped = wrapText(line, w, (s) => measure(s, 9));
      for (const wl of wrapped) {
        drawText(wl, x, yy, 9, false, textColor);
        yy -= 12;
      }
    }
    return y - 16 - lines.length * 12;
  };

  const drawTotals = (x: number, y: number, w: number) => {
    const taxLabel =
      typeof order.taxRatePercent === "number" && Number.isFinite(order.taxRatePercent) && order.taxRatePercent > 0
        ? `Tax (GST @ ${order.taxRatePercent.toLocaleString("en-IN")}% )`
        : "Tax";
    const rows: Array<{ k: string; v?: number; strong?: boolean }> = [
      { k: "Subtotal", v: order.totals.subtotal },
      { k: "Shipping", v: order.totals.shipping },
      { k: "Coupon", v: typeof order.totals.discount === "number" ? -Math.abs(order.totals.discount) : undefined },
      { k: taxLabel, v: order.totals.tax },
      { k: "Total", v: order.totals.total, strong: true },
    ].filter((r) => typeof r.v === "number" && Number.isFinite(r.v));

    const lineH = 16;
    const labelW = w * 0.55;
    const valueX = x + labelW;
    let yy = y;
    for (const r of rows) {
      drawText(r.k, x, yy, 10, r.strong, r.strong ? textColor : subtle);
      const val = `${order.currency} ${toMoney(r.v as number)}`;
      const valW = measure(val, 10, true);
      drawText(val, valueX + (w - labelW) - valW, yy, 10, true, textColor);
      yy -= lineH;
    }
    return y - rows.length * lineH;
  };

  const drawPageHeader = (isContinuation: boolean) => {
    const headerY = topY - headerHeight;
    drawRoundedRect(margin, headerY, contentWidth, headerHeight, rgb(0.98, 0.98, 0.98));

    const leftX = margin + 16;
    const baseY = topY - 26;
    drawText(seller.brandName, leftX, baseY, 18, true, textColor);
    page.drawRectangle({ x: leftX, y: baseY - 10, width: 120, height: 3, color: brand });

    let sy = baseY - 28;
    for (const line of seller.addressLines.slice(0, 3)) {
      drawText(line, leftX, sy, 9, false, subtle);
      sy -= 12;
    }
    const meta: string[] = [];
    if (seller.phone) meta.push(seller.phone);
    if (seller.email) meta.push(seller.email);
    if (seller.website) meta.push(seller.website);
    if (meta.length) drawText(meta.join(" • "), leftX, sy, 9, false, subtle);

    const rightX = margin + contentWidth - 16;
    const qrY = headerY + headerHeight - 16 - qrBox;
    page.drawRectangle({
      x: rightX - qrBox,
      y: qrY,
      width: qrBox,
      height: qrBox,
      borderColor: border,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    page.drawImage(qrImage, { x: rightX - qrBox + 5, y: qrY + 5, width: qrBox - 10, height: qrBox - 10 });
    drawText("Scan", rightX - qrBox, qrY - 11, 8, false, subtle);

    const labelX = rightX - qrBox - 168;
    drawKeyValue("Invoice No.", invoiceNo, labelX, headerY + headerHeight - 26);
    drawKeyValue("Invoice Date", formatDate(), labelX, headerY + headerHeight - 66);
    if (isContinuation) {
      const text = `Page ${pageIndex}`;
      const w = measure(text, 9, false);
      drawText(text, margin + contentWidth - w, headerY + 12, 9, false, subtle);
    }
  };

  let cursorY = topY;
  drawPageHeader(false);
  cursorY = topY - headerHeight - 18;

  ensureSpace(84);
  const infoBoxH = 72;
  const infoY = cursorY - infoBoxH;
  drawRoundedRect(margin, infoY, contentWidth, infoBoxH, rgb(1, 1, 1));

  const c1 = margin + 16;
  const c2 = margin + contentWidth * 0.52;
  drawKeyValue("Order No.", `#${orderNo}`, c1, cursorY - 18);
  drawKeyValue("Order Date", order.createdAtText || "—", c1, cursorY - 52);
  drawKeyValue("Razorpay Payment ID", safe(order.payment?.reference) || "—", c2, cursorY - 18);
  cursorY = infoY - 18;

  ensureSpace(124);
  const partyBoxH = 104;
  const partyY = cursorY - partyBoxH;
  drawRoundedRect(margin, partyY, contentWidth, partyBoxH, rgb(1, 1, 1));
  const midX = margin + contentWidth / 2;
  page.drawLine({ start: { x: midX, y: partyY + 12 }, end: { x: midX, y: partyY + partyBoxH - 12 }, thickness: 1, color: border });
  drawPartyBlock("Bill To", order.customer, margin + 16, cursorY - 18, contentWidth / 2 - 32);
  drawPartyBlock("Ship To", order.shipping, midX + 16, cursorY - 18, contentWidth / 2 - 32);
  cursorY = partyY - 20;

  const tableX = margin;
  const tableW = contentWidth;
  const col = {
    sn: 32,
    desc: Math.floor(tableW * 0.52),
    qty: 50,
    rate: 76,
  };
  col.desc = tableW - col.sn - col.qty - col.rate - 90;
  const colX = {
    sn: tableX,
    desc: tableX + col.sn,
    qty: tableX + col.sn + col.desc,
    rate: tableX + col.sn + col.desc + col.qty,
    amt: tableX + col.sn + col.desc + col.qty + col.rate,
  };

  const drawTableHeader = () => {
    ensureSpace(34);
    const headerH = 26;
    const y = cursorY - headerH;
    page.drawRectangle({ x: tableX, y, width: tableW, height: headerH, color: rgb(0.97, 0.97, 0.97), borderColor: border, borderWidth: 1 });
    drawText("#", colX.sn + 10, y + 8, 9, true, subtle);
    drawText("Description", colX.desc + 10, y + 8, 9, true, subtle);
    drawText("Qty", colX.qty + 10, y + 8, 9, true, subtle);
    drawText("Rate", colX.rate + 10, y + 8, 9, true, subtle);
    drawText("Amount", colX.amt + 10, y + 8, 9, true, subtle);
    cursorY = y;
  };

  const drawRow = (idx: number, it: InvoiceLineItem) => {
    const baseSize = 9;
    const desc = [it.name, it.variantLabel, it.sku ? `SKU: ${it.sku}` : ""].filter(Boolean).join(" · ");
    const descLines = wrapText(desc, col.desc - 20, (s) => measure(s, baseSize));
    const rowH = Math.max(22, 10 + descLines.length * 11);
    ensureSpace(rowH + 8);

    const y = cursorY - rowH;
    page.drawRectangle({ x: tableX, y, width: tableW, height: rowH, borderColor: border, borderWidth: 1, color: rgb(1, 1, 1) });

    const yText = y + rowH - 14;
    drawText(String(idx + 1), colX.sn + 10, yText, baseSize, false, textColor);
    let dy = yText;
    for (const line of descLines) {
      drawText(line, colX.desc + 10, dy, baseSize, false, textColor);
      dy -= 11;
    }
    drawText(String(it.quantity), colX.qty + 10, yText, baseSize, false, textColor);

    const rate = `${order.currency} ${toMoney(it.unitPrice)}`;
    const rateW = measure(rate, baseSize);
    drawText(rate, colX.rate + col.rate - 10 - rateW, yText, baseSize, false, textColor);

    const amt = `${order.currency} ${toMoney(it.lineTotal)}`;
    const amtW = measure(amt, baseSize);
    drawText(amt, colX.amt + (tableX + tableW - colX.amt) - 10 - amtW, yText, baseSize, false, textColor);

    cursorY = y;
  };

  drawTableHeader();
  if (!order.items.length) {
    ensureSpace(36);
    const y = cursorY - 26;
    page.drawRectangle({ x: tableX, y, width: tableW, height: 26, borderColor: border, borderWidth: 1, color: rgb(1, 1, 1) });
    drawText("No items", tableX + 12, y + 8, 9, false, subtle);
    cursorY = y;
  } else {
    order.items.forEach((it, idx) => drawRow(idx, it));
  }

  cursorY -= 18;
  ensureSpace(140);

  const footerBoxH = 112;
  const footerY = cursorY - footerBoxH;
  drawRoundedRect(margin, footerY, contentWidth, footerBoxH, rgb(1, 1, 1));
  page.drawLine({ start: { x: margin + contentWidth * 0.62, y: footerY + 16 }, end: { x: margin + contentWidth * 0.62, y: footerY + footerBoxH - 16 }, thickness: 1, color: border });

  const left = margin + 16;
  drawText("Notes", left, cursorY - 18, 10, true, textColor);
  const notes = safe(order.notes)
    ? safe(order.notes).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : ["Thank you for shopping with us.", "This is a computer-generated invoice."];
  let ny = cursorY - 36;
  for (const n of notes) {
    drawText(n, left, ny, 9, false, subtle);
    ny -= 12;
  }
  const bank = safe(order.bankDetails);
  if (bank) {
    const lines = bank.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length) {
      ny -= 6;
      drawText("Bank details", left, ny, 9, true, subtle);
      ny -= 12;
      for (const l of lines.slice(0, 5)) {
        drawText(l, left, ny, 9, false, subtle);
        ny -= 12;
      }
    }
  }
  const gstin = safe(seller.gstin);
  const companyName = safe(seller.companyName);
  if (gstin) {
    drawText(`GSTIN: ${gstin}`, left, ny - 6, 9, false, subtle);
    if (companyName) {
      drawText(`Sold by: ${companyName}`, left, ny - 18, 9, false, subtle);
    }
  } else if (companyName) {
    drawText(`Sold by: ${companyName}`, left, ny - 6, 9, false, subtle);
  }

  drawText("Amount Summary", margin + contentWidth * 0.62 + 16, cursorY - 18, 10, true, textColor);
  drawTotals(margin + contentWidth * 0.62 + 16, cursorY - 38, contentWidth * 0.38 - 32);

  cursorY = footerY - 18;

  const bytes = await doc.save();
  return bytes;
}
