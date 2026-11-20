// Generates a PDF invoice and emails it to the customer after a successful order.
// SMTP is optional: if SMTP_HOST is not set the email step is skipped silently.
const path = require('path');
const fs   = require('fs');

function createInvoiceService({ prisma }) {
  async function generateAndSend(order) {
    const dateStr      = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const invoiceNumber = `INV-${dateStr}-${String(order.id).padStart(6, '0')}`;

    const pdfBuffer = await buildPdf(order, invoiceNumber);

    const invoicesDir = path.join(__dirname, '..', '..', 'public', 'invoices');
    fs.mkdirSync(invoicesDir, { recursive: true });
    const pdfFilename = `${invoiceNumber}.pdf`;
    fs.writeFileSync(path.join(invoicesDir, pdfFilename), pdfBuffer);

    const invoice = await prisma.invoice.create({
      data: {
        orderId:       order.id,
        invoiceNumber,
        totalPrice:    order.totalPrice,
        pdfPath:       `/invoices/${pdfFilename}`,
      },
    });

    const user = await prisma.user.findUnique({
      where:  { id: order.userId },
      select: { email: true, name: true },
    });

    if (user?.email) {
      await sendEmail({ user, order, invoice, pdfBuffer });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data:  { emailedAt: new Date() },
      });
    }

    return invoice;
  }

  return { generateAndSend };
}

async function buildPdf(order, invoiceNumber) {
  // Required lazily so that Jest can mock the module without importing it at load time.
  const PDFDocument = require('pdfkit');

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const date = new Date(order.createdAt ?? Date.now()).toLocaleDateString('tr-TR');

    doc.fontSize(20).text('CS308 Pokémon Card Shop', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text('INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(11)
      .text(`Invoice:   ${invoiceNumber}`)
      .text(`Order:     #${order.id}`)
      .text(`Date:      ${date}`)
      .text(`Delivery:  ${order.deliveryAddress}`)
      .moveDown();

    doc.text('Items:', { underline: true }).moveDown(0.3);
    for (const item of order.items ?? []) {
      const name  = item.product?.name ?? `Product #${item.productId}`;
      const price = Number(item.unitPrice).toFixed(2);
      doc.text(`  ${name}  ×${item.quantity}  —  $${price} each`);
    }

    doc.moveDown();
    doc.fontSize(12).text(`Total: $${Number(order.totalPrice).toFixed(2)}`, { align: 'right' });
    doc.end();
  });
}

async function sendEmail({ user, order, invoice, pdfBuffer }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST) return; // not configured; skip silently

  const nodemailer  = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth:   SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from:    SMTP_FROM || SMTP_USER,
    to:      user.email,
    subject: `Your order #${order.id} invoice – ${invoice.invoiceNumber}`,
    text: [
      `Dear ${user.name},`,
      '',
      `Your order #${order.id} has been placed successfully.`,
      `Invoice number: ${invoice.invoiceNumber}`,
      `Total: $${Number(order.totalPrice).toFixed(2)}`,
      '',
      'The invoice PDF is attached to this email.',
      'Thank you for shopping with us!',
    ].join('\n'),
    attachments: [
      {
        filename:    `${invoice.invoiceNumber}.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

module.exports = { createInvoiceService };
