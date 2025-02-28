const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const dbPath = path.join(__dirname, "user.db");
let db = null;

// Initialize Database and Server
const initializeDBAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
        app.listen(5000, () => console.log("Server is running on http://localhost:5000"));
    } catch (e) {
        console.log(`DB Error: ${e.message}`);
        process.exit(1);
    }
};

// Middleware for Authentication
// const authenticateToken = (request, response, next) => {
//     let jwtToken;
//     const authHeader = request.headers["authorization"];
//     if (authHeader !== undefined) {
//         jwtToken = authHeader.split(" ")[1];
//     }
//     if (!jwtToken) {
//         return response.status(401).json({ error: "Unauthorized - No Token Provided" });
//     }
//     jwt.verify(jwtToken, "My_secret_key", (error, payload) => {
//         if (error) {
//             return response.status(401).json({ error: "Invalid Access Token" });
//         }
//         request.userName = payload.userName;
//         next();
//     });
// };

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"]; 
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied, no token provided" });
    }

    jwt.verify(token, "My_secret_key", (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid token" });
        }

        // console.log("Decoded JWT:", user); 
        req.userName = user.username; 
        // console.log("Attached username to req:", req.userName);

        next();
    });
};


// Get All Users
app.get("/api/userdata", async (req, res) => {
    const getUserQuery = "SELECT * FROM USER;";
    const userData = await db.all(getUserQuery);
    res.json(userData);
});

// Get Specific User
app.get("/api/userdata/:userId", async (req, res) => {
    const { userId } = req.params;
    const getUserQuery = `SELECT * FROM USER WHERE USER_ID = ?;`;
    const userData = await db.get(getUserQuery, [userId]);
    res.json(userData);
});


// Get All Leads of Specific User
app.get("/api/user/leadsdata", authenticateToken, async (req, res) => {
    const { storeLocation } = req.query;
    const userName = req.userName; 

    if (!userName) {
        return res.status(401).json({ error: "Unauthorized: Missing username" });
    }

    try {
        const getLeadsQuery = "SELECT * FROM LEADS WHERE EMPLOYEE_NAME COLLATE NOCASE = ?;";
        const getLeads = await db.all(getLeadsQuery, [userName]);

        res.json(getLeads);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//Get the FollowUp Leads
app.get("/api/user/followUp",authenticateToken, async (req,res) =>{
    const userName = req.userName;
    if (!userName) {
        return res.status(401).json({ error: "Unauthorized: Missing username" });
    }
    try {
        const getLeadsQuery = "SELECT * FROM LEADS WHERE EMPLOYEE_NAME COLLATE NOCASE = ? AND SUBSTR(FOLLOW_UP_DATE, 1, 10) = DATE('now');";
        const getLeads = await db.all(getLeadsQuery, [userName]);

        res.json(getLeads);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }

})

//Get Missed Leads 
app.get("/api/leads/missed",authenticateToken, async (req,res) => {
    const userName = req.userName;
    if (!userName) {
        return res.status(401).json({ error: "Unauthorized: Missing username" });
    }
    try {
        const getLeadsQuery = "SELECT * FROM LEADS WHERE EMPLOYEE_NAME COLLATE NOCASE = ? AND SUBSTR(FOLLOW_UP_DATE, 1, 10) <= DATE('now') AND is_followed_up =false;";
        const getLeads = await db.all(getLeadsQuery, [userName]);

        res.json(getLeads);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})


//GET Leads Based on Location or All Leads
app.get("/api/leadsdata", async (req, res) => {
    try {
        const { storeLocation,userInput} = req.query;
        let getLeadsQuery;
        let params = [];
        let userInputValue=userInput ? userInput.trim():"";
        let search = storeLocation.trim();

        if (search !=="" && userInputValue !=="") {
            getLeadsQuery = "SELECT * FROM LEADS WHERE STORE_LOCATION LIKE ? AND LOWER(EMPLOYEE_NAME) LIKE LOWER(?);";
            params = [`%${search}%`,`%${userInputValue}%`];
        } else if( search !== "" && userInputValue ==="") {
            getLeadsQuery = "SELECT * FROM LEADS WHERE STORE_LOCATION LIKE ?;";
            params = [`%${search}%`];
        }
        else if (search === "" && userInputValue !== "") {
            getLeadsQuery = "SELECT * FROM LEADS WHERE EMPLOYEE_NAME COLLATE NOCASE LIKE ?;";
            // getLeadsQuery = "SELECT * FROM LEADS WHERE LOWER(EMPLOYEE_NAME) = LOWER(?);";
            params = [`%${userInputValue}%`];
        }
        else {
            getLeadsQuery = "SELECT * FROM LEADS;"; // Fetch all leads if no storeLocation is provided
        }

        const getLeads = await db.all(getLeadsQuery, params);
        res.json(getLeads);
    } catch (error) {
        console.error("Error fetching leads:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});



//Update the FollowUp Leads
app.post("/api/leadUpdate/followUp", async (req,res)=>{
    const { isFollowedUp, leadId } = req.body;
    if (leadId === undefined) {
        return res.status(400).json({ error: "Lead ID is required" });
    }
    const updateFollowUpQuery = `
        UPDATE LEADS SET is_followed_up=? WHERE LEAD_ID=?;
    `;
    try {
        await db.run(updateFollowUpQuery, [isFollowedUp ? 1 : 0, leadId]);
        res.json({ message: "Follow-up updated successfully" });
    } catch (error) {
        console.error("Database update error:", error.message);
        res.status(500).json({ error: error.message });
    }
})



// Get Specific Lead
app.get("/api/leadsdata/:leadId", async (req, res) => {
    const { leadId } = req.params;
    const getLeadsQuery = "SELECT * FROM LEADS WHERE LEAD_ID = ?;";
    const getLeads = await db.get(getLeadsQuery, [leadId]);
    res.json(getLeads);
});

// Add New User
app.post("/api/user", async (req, res) => {
    const { name, userName, password, occupation } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const dbUser = await db.get("SELECT * FROM USER WHERE USERNAME = ?", [userName]);
    if (dbUser) {
        return res.status(400).json({ error: "User already exists" });
    }

    const createUserQuery = `
        INSERT INTO USER (NAME, USERNAME, PASSWORD, OCCUPATION)
        VALUES (?, ?, ?, ?);`;
    const dbResponse = await db.run(createUserQuery, [name, userName, hashedPassword, occupation]);

    res.json({ message: "User created successfully", userId: dbResponse.lastID });
});

// Add New Lead
app.post("/api/lead", async (req, res) => {
    const { storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDate } = req.body;
    const addLeadQuery = `
        INSERT INTO LEADS (STORE_NAME, STORE_TYPE, STORE_LOCATION, CONTACT_NO, EMPLOYEE_NAME, STATUS, REMARK, FOLLOW_UP_DATE)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;
    
    const dbResponse = await db.run(addLeadQuery, [storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDate]);
    
    res.json({ message: "Lead added successfully", leadId: dbResponse.lastID });
});

// Update User
app.put("/api/user/:userId", async (req, res) => {
    const { userId } = req.params;
    const { name, userName, password, occupation } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const updateUserQuery = `
        UPDATE USER
        SET NAME = ?, USERNAME = ?, PASSWORD = ?, OCCUPATION = ?
        WHERE USER_ID = ?;`;
    
    await db.run(updateUserQuery, [name, userName, hashedPassword, occupation, userId]);
    res.json({ message: "User updated successfully" });
});

//Update the Leads
app.put("/api/lead/:leadId", async (req,res)=>{
    const {leadId}=req.params;
    const {storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDate}=req.body;
    const updateLeadQuery=`
    UPDATE LEADS
    SET STORE_NAME=?, STORE_TYPE=?, STORE_LOCATION=?, CONTACT_NO=?, EMPLOYEE_NAME=?, STATUS=?, REMARK=?, FOLLOW_UP_DATE=?
    WHERE LEAD_ID=?;`;
    await db.run(updateLeadQuery,[storeName, storeType, storeLocation, contactNo, employeeName, status, remark, followUpDate, leadId]);
    res.json({message:"Lead updated successfully"});
})

// Delete User
app.delete("/api/user/delete/:userId", async (req, res) => {
    const { userId } = req.params;
    await db.run("DELETE FROM USER WHERE USER_ID = ?;", [userId]);
    res.json({ message: "User deleted successfully" });
});

// User Login
app.post("/login", async (req, res) => {
    const { userName, password } = req.body;
    const dbUser = await db.get("SELECT * FROM USER WHERE USERNAME = ?", [userName]);

    if (!dbUser) {
        return res.status(400).json({ error: "Invalid User" });
    }
    
    const isPasswordMatched = await bcrypt.compare(password, dbUser.PASSWORD);
    if (isPasswordMatched) {
        const jwtToken = jwt.sign({ username: userName }, "My_secret_key",{expiresIn: "10h"});
        console.log("Generated JWT:",jwtToken);
        res.json({ jwtToken });
    } else {
        res.status(400).json({ error: "Invalid Password" });
    }
});

// Start Server
initializeDBAndServer();
