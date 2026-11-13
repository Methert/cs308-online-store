import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  placeOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  requestReturn,
} from '../controllers/orderController.js';

const router = Router();

router.post('/',                         requireAuth, placeOrder);
router.get('/',                          requireAuth, getMyOrders);
router.get('/:orderId',                  requireAuth, getOrder);
router.put('/:orderId/cancel',           requireAuth, cancelOrder);
router.post('/:orderId/return',          requireAuth, requestReturn);

export default router;
