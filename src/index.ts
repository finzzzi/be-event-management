import express from "express";
import authRoutes from "./routes/authRoutes";
import eventRoutes from "./routes/eventRoutes";
import transactionRoutes from "./routes/transactionRoutes";
import cors from "cors";
import "./schedulers/transactionScheduler";
import "./schedulers/expiryScheduler";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());

// Middleware
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/events", eventRoutes);
app.use("/transactions", transactionRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
