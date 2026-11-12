package com.recall.backend;

import java.nio.file.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

/** Setting a database address is all it takes to move account storage off local files. */
@SpringBootTest
class DatabaseStorageTests {
    @TempDir static Path directory;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) throws Exception {
        // An account made earlier in local-file mode, to be imported on startup.
        var files = new AccountStore(directory.toString());
        files.register("Earlier Student", "earlier@example.test", "Earlier-password-123");
        registry.add("recall.data-dir", () -> directory.toString());
        registry.add("recall.database.url", () -> "jdbc:h2:mem:storage;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        registry.add("recall.database.username", () -> "sa");
    }
    @Autowired AccountStore store;
    @Autowired DataSource source;
    @Autowired HealthController health;

    @Test void accountsAreStoredInTheDatabaseAndFileAccountsAreImported() throws Exception {
        assertThat(health.health()).containsEntry("storage", "database");
        var db = new JdbcTemplate(source);
        assertThat(store.login("earlier@example.test", "Earlier-password-123").user().name()).isEqualTo("Earlier Student");
        var account = store.register("Database Student", "database@example.test", "Database-password-123");
        store.saveProgress(account.token(), "saved in the database");
        assertThat(db.queryForObject("SELECT progress FROM recall_accounts WHERE email = ?", String.class, "database@example.test")).isEqualTo("saved in the database");
        assertThat(db.queryForObject("SELECT password_hash FROM recall_accounts WHERE email = ?", String.class, "database@example.test")).doesNotContain("Database-password-123");
        try (var files = Files.list(directory)) { assertThat(files.count()).isEqualTo(1); }
    }
    @Test void providerAddressesAreNormalisedAndRemoteHostsRequireTls() {
        var hosted = PostgresConfig.connection("postgresql://db.example.test:5432/postgres", "student", "from-settings");
        assertThat(hosted.jdbcUrl()).isEqualTo("jdbc:postgresql://db.example.test:5432/postgres?sslmode=require");
        assertThat(hosted.username()).isEqualTo("student");
        var embedded = PostgresConfig.connection("postgres://app.user:p%40ss@db.example.test/app", "postgres", "");
        assertThat(embedded.jdbcUrl()).isEqualTo("jdbc:postgresql://db.example.test/app?sslmode=require");
        assertThat(embedded.username()).isEqualTo("app.user");
        assertThat(embedded.password()).isEqualTo("p@ss");
        assertThat(PostgresConfig.connection("jdbc:postgresql://localhost:5432/recall", "recall", "x").jdbcUrl()).isEqualTo("jdbc:postgresql://localhost:5432/recall");
        assertThatThrownBy(() -> PostgresConfig.connection("mongodb://db.example.test/app", "a", "b")).isInstanceOf(IllegalStateException.class);
    }
}
