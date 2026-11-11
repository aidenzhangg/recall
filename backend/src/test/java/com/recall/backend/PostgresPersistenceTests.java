package com.recall.backend;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="RECALL_TEST_POSTGRES_URL", matches=".+")
class PostgresPersistenceTests {
    @org.junit.jupiter.api.io.TempDir java.nio.file.Path directory;
    @Test void realPostgresPersistsAcrossRepositoryInstances() {
        var source = new DriverManagerDataSource(System.getenv("RECALL_TEST_POSTGRES_URL"),
            System.getenv("RECALL_TEST_POSTGRES_USER"), System.getenv("RECALL_TEST_POSTGRES_PASSWORD"));
        var db = new JdbcTemplate(source);
        var repository = new JdbcAccounts(db);
        String key = java.util.UUID.randomUUID().toString();
        var fixture = JdbcAccountsTests.account(key, key + "@example.test");
        try {
            repository.save(key, fixture);
            fixture.setProperty("progress", "postgres-round-trip"); repository.save(key, fixture);
            assertThat(new JdbcAccounts(db).load(key).getProperty("progress")).isEqualTo("postgres-round-trip");
        } finally { db.update("DELETE FROM recall_accounts WHERE account_key = ?", key); }
    }
    @Test void accountServiceUsesPostgresForAuthenticationAndProgress() throws Exception {
        var source = new DriverManagerDataSource(System.getenv("RECALL_TEST_POSTGRES_URL"), System.getenv("RECALL_TEST_POSTGRES_USER"), System.getenv("RECALL_TEST_POSTGRES_PASSWORD"));
        var db = new JdbcTemplate(source);
        var factory = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
        factory.registerSingleton("accounts", new JdbcAccounts(db));
        String email = java.util.UUID.randomUUID() + "@example.test";
        try {
            var store = new AccountStore(directory.toString(), factory.getBeanProvider(JdbcAccounts.class));
            var registered = store.register("Synthetic test", email, "Synthetic-test-password");
            store.saveProgress(registered.token(), "saved-in-postgres");
            var restarted = new AccountStore(directory.toString(), factory.getBeanProvider(JdbcAccounts.class));
            assertThat(restarted.login(email, "Synthetic-test-password").progress()).isEqualTo("saved-in-postgres");
            store.logout(registered.token());
            assertThatThrownBy(() -> store.workspace(registered.token())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        } finally { db.update("DELETE FROM recall_accounts WHERE email = ?", email); }
    }
}
