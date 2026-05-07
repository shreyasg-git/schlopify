package main

import (
	"database/sql"
	"encoding/json"

	// "fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

var db *sql.DB
var jwtSecret = []byte(getEnv("JWT_SECRET", "supersecret"))

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

type Credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id"`
}

type TokenResponse struct {
	Token string `json:"token"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

func main() {
	var err error

	// Create data directory for sqlite DB if it doesn't exist
	os.MkdirAll("/data", 0755)

	db, err = sql.Open("sqlite3", "/data/auth.db")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	createTableQuery := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL CHECK (role IN ('tenant', 'customer')),
		tenant_id TEXT,
		UNIQUE(email, tenant_id, role)
	);`

	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("Failed to create table: %v", err)
	}

	http.HandleFunc("/auth/register", registerHandler)
	http.HandleFunc("/auth/login", loginHandler)

	// Simple healthcheck
	http.HandleFunc("/auth/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	port := getEnv("PORT", "8080")
	log.Printf("Auth server running on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func jsonError(w http.ResponseWriter, errMsg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(ErrorResponse{Error: errMsg})
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var creds Credentials
	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		jsonError(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if creds.Email == "" || creds.Password == "" || creds.Role == "" {
		jsonError(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	if creds.Role != "tenant" && creds.Role != "customer" {
		jsonError(w, "Invalid role", http.StatusBadRequest)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(creds.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	insertQuery := `INSERT INTO users (email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?)`
	var tenantID interface{}
	if creds.TenantID != "" {
		tenantID = creds.TenantID
	} else {
		tenantID = nil
	}

	_, err = db.Exec(insertQuery, creds.Email, string(hashedPassword), creds.Role, tenantID)
	if err != nil {
		log.Printf("Registration error: %v", err)
		jsonError(w, "Registration failed or user already exists", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(`{"message":"User created successfully"}`))
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var creds Credentials
	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		jsonError(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	query := `SELECT id, password_hash FROM users WHERE email = ? AND role = ? AND (tenant_id = ? OR (? IS NULL AND tenant_id IS NULL))`

	var tenantID interface{}
	if creds.TenantID != "" {
		tenantID = creds.TenantID
	} else {
		tenantID = nil
	}

	var id int
	var storedHash string
	err = db.QueryRow(query, creds.Email, creds.Role, tenantID, tenantID).Scan(&id, &storedHash)
	if err != nil {
		if err == sql.ErrNoRows {
			jsonError(w, "Invalid credentials", http.StatusUnauthorized)
			return
		}
		log.Printf("Database error during login: %v", err)
		jsonError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(creds.Password))
	if err != nil {
		jsonError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":   id,
		"email":     creds.Email,
		"role":      creds.Role,
		"tenant_id": creds.TenantID,
		"exp":       time.Now().Add(time.Hour * 24).Unix(), // 24 hours expiry
	})

	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		jsonError(w, "Error generating token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(TokenResponse{Token: tokenString})
}
