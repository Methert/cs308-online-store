// The roles of the system. Must match the "enum Role" in prisma/schema.prisma exactly.
const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  PRODUCT_MANAGER: 'product_manager',
  SALES_MANAGER: 'sales_manager',
  SUPPORT_AGENT: 'support_agent',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ALL_ROLES };
