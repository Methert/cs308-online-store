import { describe, expect, test } from 'vitest';
import { filterOrders, ORDERS_KEY, ordersFor, readOrders, sampleOrders, saveOrders, sortOrders, stepIndex } from './orders.js';

describe('order history helpers', () => {
  test('orders are sorted newest first without changing the original list', () => {
    expect(sortOrders(sampleOrders).map(order => order.id)).toEqual([1003, 1002, 1001]);
    expect(sampleOrders.map(order => order.id)).toEqual([1001, 1002, 1003]);
  });

  test('status filter and the step of each status', () => {
    expect(filterOrders(sampleOrders, 'all')).toBe(sampleOrders);
    expect(filterOrders(sampleOrders, 'in_transit').map(order => order.id)).toEqual([1002]);
    expect(filterOrders(sampleOrders, 'processing')).toEqual([]);
    expect(['processing', 'in_transit', 'delivered', 'cancelled'].map(status => stepIndex(status))).toEqual([0, 1, 2, -1]);
  });

  test('a customer only sees their own orders', () => {
    const other = { ...sampleOrders[0], id: 1004, userId: 'demo:ash@example.com' };
    const all = [...sampleOrders, other];
    expect(ordersFor(all, 'demo:trainer@example.com')).toEqual(sampleOrders);
    expect(ordersFor(all, 'demo:ash@example.com')).toEqual([other]);
  });

  test('saved orders are read back and broken storage gives the sample orders', () => {
    expect(readOrders()).toBe(sampleOrders);
    const orders = [...sampleOrders, { ...sampleOrders[1], id: 1004 }];
    expect(saveOrders(orders)).toBe(true);
    expect(readOrders()).toEqual(orders);
    localStorage.setItem(ORDERS_KEY, 'not json');
    expect(readOrders()).toBe(sampleOrders);
  });
});
