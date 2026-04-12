// Test file with hardcoded secrets
const API_KEY = "sk_live_1234567890abcdef1234567890";
const DATABASE_URL = "postgresql://user:password@localhost:5432/db";
const JWT_SECRET = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const config = {
    apiKey: "ghp_1234567890abcdef1234567890abcdef123456",
    secretKey: "xoxb-1234567890-1234567890-1234567890abcdef",
    dbPassword: "supersecretpassword123"
};

module.exports = { API_KEY, DATABASE_URL, JWT_SECRET, config };
