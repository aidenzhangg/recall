package com.recall.backend;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@Configuration
@Profile("postgres")
public class PostgresConfig {
    @Bean DataSource recallDataSource(@Value("${recall.database.url}") String url,
            @Value("${recall.database.username}") String username,
            @Value("${recall.database.password}") String password) {
        var source = new DriverManagerDataSource();
        source.setDriverClassName("org.postgresql.Driver");
        source.setUrl(url); source.setUsername(username); source.setPassword(password);
        return source;
    }
    @Bean JdbcAccounts jdbcAccounts(DataSource source) { return new JdbcAccounts(new JdbcTemplate(source)); }
}
