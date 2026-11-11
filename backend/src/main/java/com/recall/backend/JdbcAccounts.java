package com.recall.backend;

import java.util.Properties;
import org.springframework.jdbc.core.JdbcTemplate;

/** Parameterized SQL; the same account contract supports local files and PostgreSQL. */
public class JdbcAccounts {
    private final JdbcTemplate db;
    public JdbcAccounts(JdbcTemplate db) {
        this.db = db;
        db.execute("CREATE TABLE IF NOT EXISTS recall_accounts (account_key VARCHAR(64) PRIMARY KEY, id VARCHAR(36) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, progress TEXT)");
    }
    public boolean exists(String key) {
        return Integer.valueOf(1).equals(db.queryForObject("SELECT COUNT(*) FROM recall_accounts WHERE account_key = ?", Integer.class, key));
    }
    public Properties load(String key) {
        return db.queryForObject("SELECT id, name, email, salt, password_hash, progress FROM recall_accounts WHERE account_key = ?", (rs, row) -> {
            var p = new Properties();
            for (String field : new String[]{"id", "name", "email", "salt"}) p.setProperty(field, rs.getString(field));
            p.setProperty("password", rs.getString("password_hash"));
            if (rs.getString("progress") != null) p.setProperty("progress", rs.getString("progress"));
            return p;
        }, key);
    }
    public void save(String key, Properties p) {
        if (db.update("UPDATE recall_accounts SET name = ?, progress = ? WHERE account_key = ?", p.getProperty("name"), p.getProperty("progress"), key) == 0)
            db.update("INSERT INTO recall_accounts (account_key, id, name, email, salt, password_hash, progress) VALUES (?, ?, ?, ?, ?, ?, ?)",
                key, p.getProperty("id"), p.getProperty("name"), p.getProperty("email"), p.getProperty("salt"), p.getProperty("password"), p.getProperty("progress"));
    }
}
