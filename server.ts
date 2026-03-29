import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory store for file metadata (since we don't have a DB yet)
// In a real app, use a database.
const fileStore = new Map<string, { originalName: string; filename: string; size: number }>();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomUUID();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    // Only allow .apk files
    if (path.extname(file.originalname).toLowerCase() === ".apk") {
      cb(null, true);
    } else {
      cb(new Error("Only .apk files are allowed"));
    }
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API: Upload APK
  app.post("/api/upload", upload.single("apk"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileId = crypto.randomUUID();
    fileStore.set(fileId, {
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
    });

    res.json({
      id: fileId,
      name: req.file.originalname,
      size: req.file.size,
      downloadUrl: `/api/download/${fileId}`,
    });
  });

  // API: Download APK
  app.get("/api/download/:id", (req, res) => {
    const fileData = fileStore.get(req.params.id);
    if (!fileData) {
      return res.status(404).json({ error: "File not found" });
    }

    const filePath = path.join(UPLOADS_DIR, fileData.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    res.download(filePath, fileData.originalName);
  });

  // Error handling middleware for Multer/Uploads
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: "File is too large. Max limit is 100MB." });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
