package com.recall.backend;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class AiClientTests {
    @Test void aiIsOffUntilAProviderModelAndKeyAreSet() {
        assertThat(new AiClient("", "", "", "").enabled()).isFalse();
        assertThat(new AiClient("groq", "", "some-model", "").enabled()).isFalse();
        assertThat(new AiClient("groq", "", "some-model", "test-key").enabled()).isTrue();
        assertThat(new AiClient("ollama", "", "some-model", "").enabled()).isTrue();
        assertThat(new AiClient("", "http://remote.example.test/v1", "some-model", "test-key").enabled()).isFalse();
        assertThatThrownBy(() -> new AiClient("", "", "", "").ask("question", List.of(), null)).isInstanceOf(ResponseStatusException.class);
    }
    @Test void requestIsValidJsonGroundedInTheNotesAndNeverContainsAKey() {
        String body = AiClient.requestBody("some-model", "What is \"osmosis\"?\nExplain", List.of("Osmosis is the movement of water."), "Osmosis");
        var parsed = org.springframework.boot.json.JsonParserFactory.getJsonParser().parseMap(body);
        assertThat(parsed).containsEntry("model", "some-model");
        assertThat(body).contains("ONLY these lines", "- Osmosis is the movement of water.", "Never write the term").doesNotContain("test-key", "Bearer");
        assertThat(AiClient.prompt("q", List.of(), null)).contains("do not cover this");
    }
    @Test void replyIsReadAndOneThatLeaksAHiddenAnswerIsRefused() {
        String body = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\" Water moves across a membrane. \"}}]}";
        assertThat(AiClient.reply(body, null)).isEqualTo("Water moves across a membrane.");
        assertThatThrownBy(() -> AiClient.reply("{\"choices\":[{\"message\":{\"content\":\"It is osmosis.\"}}]}", "Osmosis")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> AiClient.reply("{\"error\":\"nope\"}", null)).isInstanceOf(ResponseStatusException.class);
    }
    @Test void eachUserIsRateLimited() throws Exception {
        var controller = new AiController(new AiClient("", "", "", ""), null);
        for (int i = 0; i < AiController.LIMIT; i++) controller.allow("user-1", 1000 + i);
        assertThatThrownBy(() -> controller.allow("user-1", 2000)).isInstanceOf(ResponseStatusException.class);
        controller.allow("user-2", 2000);
        controller.allow("user-1", 2000 + AiController.WINDOW);
    }
}
