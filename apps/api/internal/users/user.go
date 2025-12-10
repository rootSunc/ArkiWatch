package users

import "time"

type User struct {
	ID        string    `json:"id"`
	Email     *string   `json:"email"`
	Name      *string   `json:"name"`
	Locale    string    `json:"locale"`
	Timezone  string    `json:"timezone"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
