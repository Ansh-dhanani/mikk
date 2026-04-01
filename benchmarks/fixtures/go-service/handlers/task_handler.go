package handlers

import (
	"encoding/json"
	"net/http"
)

type TaskHandler struct{}

func NewTaskHandler() *TaskHandler {
	return &TaskHandler{}
}

func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]map[string]string{{"id": "task-1", "title": "Example task"}})
}

func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": "new-task-id", "title": req.Title})
}
