// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pkg from "pg";

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Railway PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}


// ✅ Test DB connection
pool.connect()
  .then(() => console.log("✅ Connected to Railway PostgreSQL"))
  .catch(err => console.error("❌ Connection error:", err.stack));

// Example API route to test data
app.get("/admin", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM admin");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database query failed");
  }
});

// Example API route to list faculty count
app.get("/faculty/count", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) AS faculty_count FROM faculty");
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Query failed");
  }
});

// ====================== LOGIN ROUTES ======================

// Faculty Login - Updated to use email_id column
app.post("/login/faculty", async (req, res) => {
  const { email_id, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM faculty WHERE email_id = $1 AND password = $2",
      [email_id, password]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    res.json({ message: "Login successful", user: result.rows[0], role: "faculty" });
  } catch (err) {
    console.error("Faculty login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Incharge Login
app.post("/login/incharge", async (req, res) => {
  const { email_id, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM incharge WHERE email_id = $1 AND password = $2",
      [email_id, password]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    res.json({ message: "Login successful", user: result.rows[0], role: "incharge" });
  } catch (err) {
    console.error("Incharge login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Worker Login
app.post("/login/worker", async (req, res) => {
  const { mobile_no, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM workers WHERE mobile_no = $1 AND password = $2",
      [mobile_no, password]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    res.json({ message: "Login successful", user: result.rows[0], role: "worker" });
  } catch (err) {
    console.error("Worker login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Login
app.post("/login/admin", async (req, res) => {
  const { email_id, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM admin WHERE email_id = $1 AND password = $2",
      [email_id, password]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    res.json({ message: "Login successful", user: result.rows[0], role: "admin" });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================== COMPLAINT MANAGEMENT ======================

// Register new complaint (auto-assign incharge based on category)
app.post("/complaints", async (req, res) => {
  const { category, type, classroom, description, faculty_id } = req.body;

  try {
    // 1️⃣ Find incharge for that category (matching role column)
    const inchargeResult = await pool.query(
      "SELECT name FROM incharge WHERE role = $1 LIMIT 1",
      [category]
    );

    if (inchargeResult.rows.length === 0)
      return res.status(400).json({ error: "No incharge found for this category" });

    const assignedIncharge = inchargeResult.rows[0].name;

    // 2️⃣ Insert complaint
    const insertResult = await pool.query(
      `INSERT INTO complaints
       (category, type, classroom, status, description, faculty_id, assigned_incharge, created_at)
       VALUES ($1, $2, $3, 'Pending', $4, $5, $6, NOW())
       RETURNING *`,
      [category, type, classroom, description, faculty_id, assignedIncharge]
    );

    res.status(201).json({
      message: "Complaint registered successfully",
      complaint: insertResult.rows[0],
    });
  } catch (err) {
    console.error("Error inserting complaint:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================== FETCH COMPLAINTS WITH FILTERING ======================

// All complaints (admin view) - WITH STATUS FILTERING
app.get("/complaints/all", async (req, res) => {
  const { status } = req.query;
  try {
    let query = "SELECT * FROM complaints";
    let params = [];

    if (status && status !== 'total') {
      query += " WHERE status = $1";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching complaints:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Complaints for a specific incharge - WITH STATUS FILTERING
app.get("/complaints", async (req, res) => {
  const { incharge, faculty_id, status } = req.query;
  try {
    let query = "SELECT * FROM complaints WHERE assigned_incharge = $1";
    let params = [incharge];

    if (status && status !== 'total') {
      query += " AND status = $2";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching incharge complaints:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Complaints for a worker (assigned to them) - WITH STATUS FILTERING
app.get("/complaints/worker/:name", async (req, res) => {
  const { name } = req.params;
  const { status } = req.query;
  try {
    let query = "SELECT * FROM complaints WHERE worker = $1";
    let params = [name];

    if (status && status !== 'total') {
      query += " AND status = $2";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching worker complaints:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Complaints for a faculty - WITH STATUS FILTERING
app.get("/complaints/faculty/:faculty_id", async (req, res) => {
  const { faculty_id } = req.params;
  const { status } = req.query;
  try {
    let query = "SELECT * FROM complaints WHERE faculty_id = $1";
    let params = [faculty_id];

    if (status && status !== 'total') {
      query += " AND status = $2";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching faculty complaints:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================== WORKER MANAGEMENT ======================

// Get all workers of same role/category (for incharge dropdown)
app.get("/workers/:role", async (req, res) => {
  const { role } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM workers WHERE role = $1 ORDER BY name ASC",
      [role]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching workers:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all categories/roles (for dropdown population)
app.get("/categories", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT role FROM incharge ORDER BY role ASC"
    );
    res.json(result.rows.map(row => row.role));
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Assign worker to complaint
app.put("/complaints/:id/assign", async (req, res) => {
  const { id } = req.params;
  const { worker } = req.body;
  try {
    const result = await pool.query(
      "UPDATE complaints SET worker = $1, status = 'In Progress' WHERE id = $2 RETURNING *",
      [worker, id]
    );
    res.json({ message: "Worker assigned successfully", complaint: result.rows[0] });
  } catch (err) {
    console.error("Error assigning worker:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update complaint status (e.g. Resolved, In Progress, Completed)
app.put("/complaints/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      "UPDATE complaints SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );
    res.json({ message: "Status updated successfully", complaint: result.rows[0] });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================== PASSWORD MANAGEMENT ======================

// Change password for any user type
app.put("/change-password/:userType/:userId", async (req, res) => {
  const { userType, userId } = req.params;
  const { newPassword } = req.body;

  try {
    let query, params;

    switch(userType) {
      case 'faculty':
        query = "UPDATE faculty SET password = $1 WHERE faculty_id = $2 RETURNING faculty_name as name";
        params = [newPassword, userId];
        break;
      case 'incharge':
        query = "UPDATE incharge SET password = $1 WHERE email_id = $2 RETURNING name";
        params = [newPassword, userId];
        break;
      case 'worker':
        query = "UPDATE workers SET password = $1 WHERE mobile_no = $2 RETURNING name";
        params = [newPassword, userId];
        break;
      case 'admin':
        query = "UPDATE admin SET password = $1 WHERE email_id = $2 RETURNING name";
        params = [newPassword, userId];
        break;
      default:
        return res.status(400).json({ error: "Invalid user type" });
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ 
      message: "Password updated successfully", 
      user: result.rows[0] 
    });
  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ====================== SERVER ======================
const PORT = 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));