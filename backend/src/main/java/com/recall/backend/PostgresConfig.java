package com.recall.backend;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Stores accounts in PostgreSQL whenever a database address is configured (a hosted database such as
 * Supabase or Neon, or a locally installed PostgreSQL). With no address, Recall keeps using local files.
 */
@Configuration
@ConditionalOnExpression("!'${recall.database.url:}'.isBlank()")
public class PostgresConfig {
    record Connection(String jdbcUrl, String username, String password) {}

    /** Accepts a JDBC address or the postgresql:// address that hosted providers show, and requires TLS for remote hosts. */
    static Connection connection(String url, String username, String password) {
        url = url.trim();
        if (url.startsWith("jdbc:h2:")) return new Connection(url, username, password);
        URI uri;
        try { uri = URI.create(url.replaceFirst("^jdbc:", "").replaceFirst("^postgres(ql)?://", "postgresql://")); }
        catch (IllegalArgumentException e) { throw new IllegalStateException("The database address is not a valid PostgreSQL address."); }
        if (!"postgresql".equals(uri.getScheme()) || uri.getHost() == null)
            throw new IllegalStateException("The database address must look like postgresql://host:5432/database.");
        if (uri.getRawUserInfo() != null) {
            String[] parts = uri.getRawUserInfo().split(":", 2);
            if (username.isBlank() || username.equals("postgres")) username = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            if (password.isEmpty() && parts.length == 2) password = URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
        }
        String query = uri.getRawQuery() == null ? "" : uri.getRawQuery();
        boolean local = uri.getHost().equals("localhost") || uri.getHost().equals("127.0.0.1") || uri.getHost().equals("::1");
        if (!local && !query.contains("sslmode=")) query += (query.isEmpty() ? "" : "&") + "sslmode=require";
        String path = uri.getRawPath() == null || uri.getRawPath().length() < 2 ? "/postgres" : uri.getRawPath();
        return new Connection("jdbc:postgresql://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "") + path + (query.isEmpty() ? "" : "?" + query), username, password);
    }

    @Bean(destroyMethod = "close") DataSource recallDataSource(@Value("${recall.database.url}") String url,
            @Value("${recall.database.username:postgres}") String username,
            @Value("${recall.database.password:}") String password) {
        Connection connection = connection(url, username, password);
        var source = new HikariDataSource();
        source.setPoolName("recall-accounts");
        source.setJdbcUrl(connection.jdbcUrl()); source.setUsername(connection.username()); source.setPassword(connection.password());
        // Hosted free tiers allow few connections; a small pool also avoids a new TLS handshake per query.
        source.setMaximumPoolSize(4); source.setMinimumIdle(1); source.setConnectionTimeout(15000);
        return source;
    }
    @Bean JdbcAccounts jdbcAccounts(DataSource source) { return new JdbcAccounts(new JdbcTemplate(source)); }
}
