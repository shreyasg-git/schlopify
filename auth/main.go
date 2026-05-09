package main

import (
	"database/sql"
	"encoding/json"

	// "fmt"
	"log"
	"net/http"
	"os"
	"time"

	"context"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	"google.golang.org/api/idtoken"
)

var db *sql.DB
var jwtSecret = []byte(getEnv("JWT_SECRET", "supersecret"))

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

type GoogleAuthRequest struct {
	Credential string `json:"credential"`
	Role       string `json:"role"`
	TenantID   string `json:"tenant_id"`
}

var googleClientID = getEnv("GOOGLE_CLIENT_ID", getEnv("VITE_GOOGLE_CLIENT_ID", ""))

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
		role TEXT NOT NULL CHECK (role IN ('tenant', 'customer')),
		tenant_id TEXT,
		UNIQUE(email, tenant_id, role)
	);`

	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("Failed to create table: %v", err)
	}

	http.HandleFunc("/auth/google", googleAuthHandler)
	http.HandleFunc("/api/auth/google", googleAuthHandler)

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

func googleAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req GoogleAuthRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		jsonError(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if req.Credential == "" || req.Role == "" {
		jsonError(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	if req.Role != "tenant" && req.Role != "customer" {
		jsonError(w, "Invalid role", http.StatusBadRequest)
		return
	}

	// Verify Google Token
	ctx := context.Background()
	payload, err := idtoken.Validate(ctx, req.Credential, googleClientID)
	if err != nil {
		log.Printf("Invalid Google token: %v", err)
		jsonError(w, "Invalid Google token", http.StatusUnauthorized)
		return
	}

	email := payload.Claims["email"].(string)

	var tenantID interface{}
	if req.TenantID != "" {
		tenantID = req.TenantID
	} else {
		tenantID = nil
	}

	// Find or create user
	var id int
	query := `SELECT id FROM users WHERE email = ? AND role = ? AND (tenant_id = ? OR (? IS NULL AND tenant_id IS NULL))`
	err = db.QueryRow(query, email, req.Role, tenantID, tenantID).Scan(&id)

	if err != nil {
		if err == sql.ErrNoRows {
			// Auto-register
			insertQuery := `INSERT INTO users (email, role, tenant_id) VALUES (?, ?, ?)`
			res, err := db.Exec(insertQuery, email, req.Role, tenantID)
			if err != nil {
				log.Printf("Error creating user: %v", err)
				jsonError(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			insertedID, _ := res.LastInsertId()
			id = int(insertedID)
		} else {
			log.Printf("Database error: %v", err)
			jsonError(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":   id,
		"email":     email,
		"role":      req.Role,
		"tenant_id": req.TenantID,
		"exp":       time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		jsonError(w, "Error generating token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(TokenResponse{Token: tokenString})
}
