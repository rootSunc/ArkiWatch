package database

import (
	"context"
	"database/sql"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
)

func (store *Store) IsActiveUser(ctx context.Context, userID string) (bool, error) {
	var active bool
	err := store.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM users WHERE id = $1 AND status = 'ACTIVE'
		)
	`, userID).Scan(&active)
	return active, err
}

func (store *Store) GetUser(ctx context.Context, userID string) (users.User, error) {
	var user users.User
	err := scanUser(store.pool.QueryRow(ctx, `
		SELECT id, email, name, locale, timezone, status::text, created_at, updated_at
		FROM users
		WHERE id = $1
	`, userID), &user)
	return user, err
}

func (store *Store) GetOrCreateAdminUser(ctx context.Context, cfg config.Config) (users.User, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return users.User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var user users.User
	err = scanUser(tx.QueryRow(ctx, `
		SELECT id, email, name, locale, timezone, status::text, created_at, updated_at
		FROM users WHERE email = $1
	`, cfg.AdminEmail), &user)
	if err == pgx.ErrNoRows {
		err = scanUser(tx.QueryRow(ctx, `
			SELECT id, email, name, locale, timezone, status::text, created_at, updated_at
			FROM users WHERE id = $1
		`, cfg.AdminUserID), &user)
	}
	if err == pgx.ErrNoRows {
		err = scanUser(tx.QueryRow(ctx, `
			INSERT INTO users (id, email, name, locale, timezone, status)
			VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
			RETURNING id, email, name, locale, timezone, status::text, created_at, updated_at
		`, cfg.AdminUserID, cfg.AdminEmail, cfg.AdminName, cfg.AdminLocale, cfg.Timezone), &user)
	} else if err == nil {
		err = scanUser(tx.QueryRow(ctx, `
			UPDATE users
			SET email = $1, name = $2, locale = $3, timezone = $4, status = 'ACTIVE', updated_at = now()
			WHERE id = $5
			RETURNING id, email, name, locale, timezone, status::text, created_at, updated_at
		`, cfg.AdminEmail, cfg.AdminName, cfg.AdminLocale, cfg.Timezone, user.ID), &user)
	}
	if err != nil {
		return users.User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return users.User{}, err
	}
	return user, nil
}

func scanUser(row rowScanner, user *users.User) error {
	var email, name sql.NullString
	if err := row.Scan(
		&user.ID,
		&email,
		&name,
		&user.Locale,
		&user.Timezone,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		return err
	}
	if email.Valid {
		user.Email = &email.String
	}
	if name.Valid {
		user.Name = &name.String
	}
	return nil
}
