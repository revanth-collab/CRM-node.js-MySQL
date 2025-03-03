const express = require("express");
// const mysql = require("mysql2");
const fs = require("fs");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const port = process.env.PORT || 5000;

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MySQL Database
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        ca: fs.readFileSync(__dirname + '/certs/ca-certificate.crt'),
        rejectUnauthorized: true
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// const showDatabases = async () => {
//     try {
//         const [result] = await pool.query("SHOW TABLES;");
//         console.log("Tables in the database:");
//         console.log(result);
//     } catch (error) {
//         console.error("Error fetching databases:", error);
//     }
// };

// // Call the function if needed
// showDatabases();



// Initialize Database and Server
const initializeDBAndServer = async () => {
    try {
        app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));
    } catch (e) {
        console.error(`Server Error: ${e.message}`);
        process.exit(1);
    }
};


// Middleware for Authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    // const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    const token = authHeader?.split(" ")[1];    

    if (!token) return res.status(401).json({ error: "Access denied, no token provided" });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.userName = user.username;
        next();
    });
};

// Get All Users
app.get("/api/userdata", async (req, res) => {
    try {
        const [users] = await pool.query("SELECT * FROM USER;");
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// Get Specific User
app.get("/api/userdata/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const [user] = await pool.query("SELECT * FROM USER WHERE USER_ID = ?", [userId]);
        res.json(user[0]);
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

//Get All Leads of Specific User
app.get("/api/user/leadsdata", authenticateToken, async (req, res) => {
    const userName = req.userName;
    const [leads] = await pool.query("SELECT * FROM LEADS WHERE LOWER(EMPLOYEE_NAME) = LOWER(?)", [userName]);
    res.json(leads);
});

//Get The Followup Leads
app.get("/api/user/followUp", authenticateToken, async (req, res) => {
    const userName = req.userName;
    if (!userName) {
        return res.status(401).json({ error: "Unauthorized: Missing username" });
    }
    try {
        const getLeadsQuery = `
            SELECT * FROM LEADS 
            WHERE LOWER(EMPLOYEE_NAME) = LOWER(?) 
            AND DATE(FOLLOW_UP_DATE) = CURDATE();
        `;
        const [getLeads] = await pool.query(getLeadsQuery, [userName]);

        res.json(getLeads);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//Get Missed Leads
app.get("/api/leads/missed", authenticateToken, async (req, res) => {
    const userName = req.userName;
    if (!userName) {
        return res.status(401).json({ error: "Unauthorized: Missing username" });
    }
    try {
        const getLeadsQuery = `
            SELECT * FROM LEADS 
            WHERE LOWER(EMPLOYEE_NAME) = LOWER(?) 
            AND DATE(FOLLOW_UP_DATE) <= CURDATE() 
            AND is_followed_up = FALSE;
        `;
        const [getLeads] = await pool.query(getLeadsQuery, [userName]);

        res.json(getLeads);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//GET Leads Based on Location or All Leads
app.get("/api/leadsdata", async (req, res) => {
    try {
        const { storeLocation, userInput } = req.query;
        let getLeadsQuery;
        let params = [];
        let userInputValue = userInput ? userInput.trim() : "";
        let search = storeLocation ? storeLocation.trim() : "";

        if (search !== "" && userInputValue !== "") {
            getLeadsQuery = "SELECT * FROM LEADS WHERE STORE_LOCATION LIKE ? AND LOWER(EMPLOYEE_NAME) LIKE LOWER(?);";
            params = [`%${search}%`, `%${userInputValue}%`];
        } else if (search !== "" && userInputValue === "") {
            getLeadsQuery = "SELECT * FROM LEADS WHERE STORE_LOCATION LIKE ?;";
            params = [`%${search}%`];
        } else if (search === "" && userInputValue !== "") {
            getLeadsQuery = "SELECT * FROM LEADS WHERE LOWER(EMPLOYEE_NAME) LIKE LOWER(?);";
            params = [`%${userInputValue}%`];
        } else {
            getLeadsQuery = "SELECT * FROM LEADS;"; // Fetch all leads if no filters are applied
        }

        const [getLeads] = await pool.query(getLeadsQuery, params);
        res.json(getLeads);
    } catch (error) {
        console.error("Error fetching leads:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//Update the FollowUp Leads
app.post("/api/leadUpdate/followUp", async (req, res) => {
    const { isFollowedUp, leadId } = req.body;

    if (leadId === undefined) {
        return res.status(400).json({ error: "Lead ID is required" });
    }

    const updateFollowUpQuery = `
        UPDATE LEADS SET is_followed_up = ? WHERE LEAD_ID = ?;
    `;

    try {
        const [result] = await pool.query(updateFollowUpQuery, [isFollowedUp ? 1 : 0, leadId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Lead not found" });
        }

        res.json({ message: "Follow-up updated successfully" });
    } catch (error) {
        console.error("Database update error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//Get Specific Lead
app.get("/api/leadsdata/:leadId", async (req, res) => {
    const { leadId } = req.params;

    if (!leadId) {
        return res.status(400).json({ error: "Lead ID is required" });
    }

    const getLeadsQuery = "SELECT * FROM LEADS WHERE LEAD_ID = ?;";

    try {
        const [rows] = await pool.query(getLeadsQuery, [leadId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Lead not found" });
        }

        res.json(rows[0]); // Return the first (and only) matching lead
    } catch (error) {
        console.error("Database query error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// User Registration
app.post("/api/user", async (req, res) => {
    const { name, userName, password, occupation } = req.body;
    if (!password) return res.status(400).json({ error: "Password is required" });

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const [existingUser] = await pool.query("SELECT * FROM USER WHERE USERNAME = ?", [userName]);
        if (existingUser.length > 0) return res.status(400).json({ error: "User already exists" });

        await pool.query("INSERT INTO USER (NAME, USERNAME, PASSWORD, OCCUPATION) VALUES (?, ?, ?, ?)",
            [name, userName, hashedPassword, occupation]);

        res.json({ message: "User created successfully" });
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

//Add New Lead
app.post("/api/lead", async (req, res) => {
    const { storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDate } = req.body;
    const followUpDateConvert = new Date(followUpDate)
    .toISOString()
    .slice(0, 19) // Removes milliseconds and 'Z'
    .replace("T", " "); // Converts 'T' separator to space

    console.log(followUpDate);

    if (!storeName || !storeType || !storeLocation || !contactNo || !employeeName || !status) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const addLeadQuery = `
        INSERT INTO LEADS (STORE_NAME, STORE_TYPE, STORE_LOCATION, CONTACT_NO, EMPLOYEE_NAME, STATUS, REMARK, FOLLOW_UP_DATE)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;

    try {
        const [result] = await pool.query(addLeadQuery, [storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDateConvert]);

        res.json({ message: "Lead added successfully", leadId: result.insertId });
    } catch (error) {
        console.error("Database insert error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Update User
app.put("/api/user/:userId", async (req, res) => {
    const { userId } = req.params;
    const { name, userName, password, occupation } = req.body;

    if (!userId || !name || !userName || !password || !occupation) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        if (!password) return res.status(400).json({ error: "Password is required" });

        const hashedPassword = await bcrypt.hash(password, 10);

        const updateUserQuery = `
            UPDATE USER
            SET NAME = ?, USERNAME = ?, PASSWORD = ?, OCCUPATION = ?
            WHERE USER_ID = ?;
        `;

        const [result] = await pool.query(updateUserQuery, [name, userName, hashedPassword, occupation, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found or no changes made" });
        }

        res.json({ message: "User updated successfully" });

    } catch (error) {
        console.error("Database update error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//Update the Leads
app.put("/api/lead/:leadId", async (req, res) => {
    const { leadId } = req.params;
    const { storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDate } = req.body;

    if (!leadId || !storeName || !storeType || !storeLocation || !contactNo || !employeeName || !status || !remark || !followUpDate) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // Ensure the followUpDate is in the proper format for SQL (YYYY-MM-DD HH:mm:ss)
    try {
        const followUpDateConvert = new Date(followUpDate)
        .toISOString()
        .slice(0, 19) // Removes milliseconds and 'Z'
        .replace("T", " "); // Converts 'T' separator to space
        const updateLeadQuery = `
            UPDATE LEADS
            SET STORE_NAME = ?, STORE_TYPE = ?, STORE_LOCATION = ?, CONTACT_NO = ?, EMPLOYEE_NAME = ?, STATUS = ?, REMARK = ?, FOLLOW_UP_DATE = ?
            WHERE LEAD_ID = ?;
        `;

        const [result] = await pool.query(updateLeadQuery, [
            storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDateConvert, leadId
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Lead not found or no changes made" });
        }

        res.json({ message: "Lead updated successfully" });

    } catch (error) {
        console.error("Database update error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//Delete User
app.delete("/api/user/delete/:userId", async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
    }

    try {
        const deleteUserQuery = "DELETE FROM USER WHERE USER_ID = ?;";
        const [result] = await pool.query(deleteUserQuery, [userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Database delete error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// User Login
app.post("/login", async (req, res) => {
    const { userName, password } = req.body;

    try {
        const [users] = await pool.query("SELECT * FROM USER WHERE USERNAME = ?", [userName]);
        if (users.length === 0) return res.status(400).json({ error: "Invalid User" });

        const user = users[0];
        const isPasswordMatched = await bcrypt.compare(password, user.PASSWORD);
        if (!isPasswordMatched) return res.status(400).json({ error: "Invalid Password" });

        const jwtToken = jwt.sign({ username: userName }, process.env.JWT_SECRET, { expiresIn: "10h" });
        res.json({ jwtToken });
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// Start Server
initializeDBAndServer();
