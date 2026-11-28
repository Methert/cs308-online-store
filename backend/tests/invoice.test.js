// The invoice is marked as emailed only when a mail was really sent (requirement 4).
const fs = require('fs');
const { createInvoiceService } = require('../src/services/invoice.service');

const order = {
  id: 7,
  userId: 1,
  totalPrice: '9.00',
  deliveryAddress: 'Tuzla, Istanbul',
  items: [{ quantity: 1, unitPrice: '9.00', product: { name: 'Pikachu' } }],
};

function fakePrisma() {
  return {
    invoice: {
      create: jest.fn(async ({ data }) => ({ id: 1, ...data })),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn(async () => ({ email: 'ash@example.com', name: 'Ash' })) },
  };
}

let smtpHost;
beforeEach(() => {
  smtpHost = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
});
afterEach(() => {
  if (smtpHost !== undefined) process.env.SMTP_HOST = smtpHost;
  jest.restoreAllMocks();
});

test('without SMTP settings the invoice is saved but not marked as emailed', async () => {
  const prisma = fakePrisma();
  const invoice = await createInvoiceService({ prisma }).generateAndSend(order);

  expect(invoice.invoiceNumber).toMatch(/^INV-\d{8}-000007$/);
  expect(prisma.invoice.create).toHaveBeenCalled();
  expect(prisma.invoice.update).not.toHaveBeenCalled();
});
