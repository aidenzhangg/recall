package com.recall.backend;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

class JdbcAccountsTests {
    @Test void persistsAccountsAndUpdatesOnlyOwnedProgress() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:accounts;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(source);
        var store = new JdbcAccounts(jdbc);
        var first = account("one", "one@example.test");
        var second = account("two", "two@example.test");
        store.save("key-one", first); store.save("key-two", second);
        first.setProperty("progress", "private-progress"); store.save("key-one", first);
        var restarted = new JdbcAccounts(jdbc);
        assertThat(restarted.load("key-one").getProperty("progress")).isEqualTo("private-progress");
        assertThat(restarted.load("key-two").getProperty("progress")).isNull();
        assertThat(restarted.load("key-one").getProperty("password")).isEqualTo("synthetic-hash");
        assertThatThrownBy(() -> store.save("other-key", account("three", "one@example.test")))
            .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
        assertThat(store.exists("missing")).isFalse();
    }
    static Properties account(String id, String email) {
        var p = new Properties(); p.setProperty("id", id); p.setProperty("email", email);
        p.setProperty("name", "Synthetic fixture"); p.setProperty("salt", "synthetic-salt"); p.setProperty("password", "synthetic-hash");
        return p;
    }
}
