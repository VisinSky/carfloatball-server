const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Simple Auth Config
const ADMIN_USER = {
  username: "admin",
  password: "123456"
};
// In-memory session store (resets on restart)
const sessions = new Set();


const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, "db.json");

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for Base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, "public"))); // Serve admin UI
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve APK files

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 解码中文文件名 (multer 默认使用 latin1)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + "-" + originalName);
  },
});

const upload = multer({ storage: storage });

// Helper to read DB
function getDb() {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

// Helper to write DB
// Helper to write DB
function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// --- Auth Middleware ---
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ code: 401, message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  if (sessions.has(token)) {
    next();
  } else {
    res.status(401).json({ code: 401, message: "Invalid token" });
  }
};

// --- API Endpoints ---

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
    const token = crypto.randomBytes(16).toString("hex");
    sessions.add(token);
    res.json({ code: 0, data: { token } });
  } else {
    res.json({ code: 401, message: "用户名或密码错误" });
  }
});


// Get all apps
app.get("/api/apps", (req, res) => {
  try {
    const apps = getDb();
    // Append full URL for downloads if needed, or client handles relative
    // Here we return relative paths (e.g. /uploads/xxx.apk)
    // Construction of full URL should happen on client side based on server IP
    res.json({ code: 0, data: apps });
  } catch (error) {
    res.status(500).json({ code: 500, message: "Server Error" });
  }
});

// Upload APK (Protected)
app.post("/api/upload", authMiddleware, upload.single("file"), (req, res) => {
  console.log("Upload request received");
  console.log("File:", req.file);
  
  if (!req.file) {
    console.log("No file in request");
    return res.status(400).json({ code: 400, message: "No file uploaded" });
  }
  
  const downloadUrl = "/uploads/" + req.file.filename;
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  console.log("Upload success:", downloadUrl);
  
  res.json({
    code: 0,
    data: {
      url: downloadUrl,
      size: req.file.size,
      originalName: originalName,
    },
  });
});

// Add App (Protected)
app.post("/api/apps", authMiddleware, (req, res) => {
  try {
    const apps = getDb();
    const newApp = {
      ...req.body,
      id: Date.now().toString(),
      updateTime: Date.now(),
    };
    apps.unshift(newApp); // Add to top
    saveDb(apps);
    res.json({ code: 0, data: newApp });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// Update App (Protected)
app.put("/api/apps/:id", authMiddleware, (req, res) => {
  try {
    const apps = getDb();
    const index = apps.findIndex((a) => a.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ code: 404, message: "App not found" });
    }

    apps[index] = {
      ...apps[index],
      ...req.body,
      id: req.params.id, // Ensure ID doesn't change
      updateTime: Date.now(),
    };
    saveDb(apps);
    res.json({ code: 0, data: apps[index] });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// Delete App (Protected)
app.delete("/api/apps/:id", authMiddleware, (req, res) => {
  try {
    let apps = getDb();
    const appToDelete = apps.find((a) => a.id === req.params.id);

    if (appToDelete) {
      // Optional: Delete file
      if (
        appToDelete.downloadUrl &&
        appToDelete.downloadUrl.startsWith("/uploads/")
      ) {
        const filePath = path.join(__dirname, appToDelete.downloadUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    apps = apps.filter((a) => a.id !== req.params.id);
    saveDb(apps);
    res.json({ code: 0, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
  console.log(`Admin UI: http://localhost:${PORT}`);
});
