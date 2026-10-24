package com.recall.backend;

import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AccountApiTests {
    @TempDir static Path directory;
    @LocalServerPort int port;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("recall.data-dir", () -> directory.toString());
    }
    private final HttpClient client = HttpClient.newHttpClient();
    private HttpResponse<String> request(String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/account/" + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body == null) builder.GET();
        else builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void accountEndpointsValidateAuthenticateSaveAndLogout() throws Exception {
        assertThat(request("me", null, null).statusCode()).isEqualTo(401);
        assertThat(request("register", "{\"name\":\"Student\",\"email\":\"not-an-email\",\"password\":\"short\"}", null).statusCode()).isEqualTo(400);
        var registered = request("register", "{\"name\":\"Student\",\"email\":\"student@example.com\",\"password\":\"Test-password-1234\"}", null);
        assertThat(registered.statusCode()).isEqualTo(200);
        var matcher = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"").matcher(registered.body());
        assertThat(matcher.find()).isTrue();
        String token = matcher.group(1);
        assertThat(request("progress", "{\"progress\":\"sample-notes\"}", token).statusCode()).isEqualTo(200);
        var me = request("me", null, token);
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(me.body()).contains("sample-notes", "student@example.com").doesNotContain("password", "salt");
        assertThat(request("progress", "{\"progress\":\"overwrite\"}", "wrong-token").statusCode()).isEqualTo(401);
        assertThat(request("logout", "{}", token).statusCode()).isEqualTo(200);
        assertThat(request("me", null, token).statusCode()).isEqualTo(401);
    }
}
