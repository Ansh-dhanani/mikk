package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/example/go-service/config"
	"github.com/example/go-service/handlers"
	"github.com/example/go-service/middleware"
)

func main() {
	cfg := config.Load()
	mux := http.NewServeMux()

	authMiddleware := middleware.NewAuthMiddleware(cfg.JWTSecret)
	userHandler := handlers.NewUserHandler()
	taskHandler := handlers.NewTaskHandler()

	mux.HandleFunc("/health", handlers.HealthCheck)
	mux.HandleFunc("/users/register", userHandler.Register)
	mux.HandleFunc("/users/login", userHandler.Login)
	mux.Handle("/users/me", authMiddleware.Protect(http.HandlerFunc(userHandler.Profile)))
	mux.Handle("/tasks", authMiddleware.Protect(http.HandlerFunc(taskHandler.List)))
	mux.Handle("/tasks/create", authMiddleware.Protect(http.HandlerFunc(taskHandler.Create)))

	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("Server starting on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
