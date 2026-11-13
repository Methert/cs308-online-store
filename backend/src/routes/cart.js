import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeGuestCart,
} from '../controllers/cartController.js';

const router = Router();

router.get('/',                      optionalAuth, getCart);
router.post('/items',                optionalAuth, addItem);
router.put('/items/:productId',      optionalAuth, updateItem);
router.delete('/items/:productId',   optionalAuth, removeItem);
router.delete('/',                   optionalAuth, clearCart);
router.post('/merge',                requireAuth,  mergeGuestCart);

export default router;
