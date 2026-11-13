import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/cart',   cartRoutes);
app.use('/api/orders', orderRoutes);

export default app;
