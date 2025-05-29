import express from 'express';
import authRoutes from './routes/authRoutes'
import eventRoutes from './routes/eventRoutes'

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/admin/events', eventRoutes)

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});