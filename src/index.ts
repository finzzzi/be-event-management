import express from "express";
import authRoutes from "./routes/authRoutes";
import eventRoutes from "./routes/eventRoutes";
import transactionRoutes from "./routes/transactionRoutes";
import cors from "cors";
import path from "path";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());

// Middleware
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/events", eventRoutes);
app.use("/transactions", transactionRoutes);
const uploadsPath = path.join(__dirname, "../uploads");
app.use("/uploads", express.static(uploadsPath));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
