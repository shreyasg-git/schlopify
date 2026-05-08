package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
)

// DeployRequest is the payload from the platform frontend form.
type DeployRequest struct {
	ShopName string `json:"shop_name"`
	Theme    string `json:"theme"`
}

// DeployResponse is returned to the frontend after provisioning.
type DeployResponse struct {
	URL       string `json:"url"`
	ShopID    string `json:"shop_id"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
	Message   string `json:"message,omitempty"`
}

// ErrorResponse wraps error messages as JSON.
type ErrorResponse struct {
	Error string `json:"error"`
}

var (
	validThemes  = map[string]bool{"brutalist": true, "minimal": true}
	slugRegex    = regexp.MustCompile(`[^a-z0-9-]`)
	minikubeIP   = getEnv("MINIKUBE_IP", "192.168.49.2")
	frontendTag  = getEnv("FRONTEND_IMAGE_TAG", "v5")
)

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func main() {
	provisioner, err := NewProvisioner()
	if err != nil {
		log.Fatalf("Failed to initialise Kubernetes provisioner: %v", err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/deploy", func(w http.ResponseWriter, r *http.Request) {
		handleDeploy(w, r, provisioner)
	})

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Wrap with CORS
	handler := corsMiddleware(mux)

	port := getEnv("PORT", "8090")
	log.Printf("Platform API listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handleDeploy(w http.ResponseWriter, r *http.Request, p *Provisioner) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Validate shop name
	if req.ShopName == "" {
		jsonError(w, "shop_name is required", http.StatusBadRequest)
		return
	}

	// Validate theme
	if !validThemes[req.Theme] {
		jsonError(w, fmt.Sprintf("Invalid theme '%s'. Valid themes: brutalist, minimal", req.Theme), http.StatusBadRequest)
		return
	}

	// Sanitize shop name → slug
	shopID := slugify(req.ShopName)
	if shopID == "" {
		jsonError(w, "shop_name must contain at least one alphanumeric character", http.StatusBadRequest)
		return
	}

	namespace := "shop-" + shopID
	host := fmt.Sprintf("%s.%s.nip.io", shopID, minikubeIP)
	frontendImage := fmt.Sprintf("shop-frontend:%s", frontendTag)

	log.Printf("Deploying shop: id=%s theme=%s namespace=%s host=%s", shopID, req.Theme, namespace, host)

	// Provision the entire tenant stack
	err := p.ProvisionShop(namespace, shopID, req.Theme, host, frontendImage)
	if err != nil {
		log.Printf("Provisioning failed for %s: %v", shopID, err)
		jsonError(w, fmt.Sprintf("Provisioning failed: %v", err), http.StatusInternalServerError)
		return
	}

	resp := DeployResponse{
		URL:       fmt.Sprintf("http://%s", host),
		ShopID:    shopID,
		Namespace: namespace,
		Status:    "ready",
		Message:   fmt.Sprintf("Shop '%s' deployed with %s theme", req.ShopName, req.Theme),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.ReplaceAll(s, " ", "-")
	s = slugRegex.ReplaceAllString(s, "")
	// Remove consecutive/trailing dashes
	s = regexp.MustCompile(`-+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	// Cap length for K8s naming constraints (63 chars max for labels)
	if len(s) > 48 {
		s = s[:48]
	}
	return s
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(ErrorResponse{Error: msg})
}
