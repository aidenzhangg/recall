package com.recall.backend;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/study")
public class StudyController {
    public record Review(@NotBlank @Size(max=20000) String source, @Min(0) int misses, @Min(0) int successes, long dueAt) {}
    public record Generation(@NotBlank @Size(max=200000) String notes, @Min(1) @Max(15) int count,
        @Pattern(regexp="blank|choice|long|mixed") @NotNull String format, @NotNull @Size(max=250) List<@Valid Review> history) {}
    public record Question(String prompt, String answer, String kind, List<String> options, String source, String topic) {}
    private static final java.util.regex.Pattern WORD = java.util.regex.Pattern.compile("[A-Za-z][A-Za-z'-]{3,}");
    @PostMapping("/generate")
    public List<Question> generate(@Valid @RequestBody Generation request) {
        return generateAt(request, System.currentTimeMillis());
    }
    static List<Question> generateAt(Generation request, long now) {
        var priorities = new HashMap<String, Long>();
        for (var item : request.history()) {
            priorities.put(item.source(), item.dueAt() <= now ? 10L + item.misses() - item.successes() : 0L);
        }
        var sources = new ArrayList<>(Arrays.stream(request.notes().split("(?<=[.!?])\\s+|\\n+"))
            .map(String::trim).filter(line -> line.split("\\s+").length >= 5).toList());
        sources.sort(Comparator.comparingLong((String source) -> priorities.getOrDefault(source, 0L)).reversed());
        var pool = new LinkedHashMap<String,String>();
        WORD.matcher(request.notes()).results().forEach(m -> pool.putIfAbsent(m.group().toLowerCase(Locale.ROOT), m.group()));
        var questions = new ArrayList<Question>();
        for (String source : sources) {
            if (questions.size() >= request.count()) break;
            String term = WORD.matcher(source).results().map(m -> m.group()).max(Comparator.comparingInt(String::length)).orElse(null);
            if (term == null) continue;
            String kind = request.format().equals("mixed") ? List.of("blank", "choice", "long").get(questions.size() % 3) : request.format();
            String prompt = java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(term), java.util.regex.Pattern.CASE_INSENSITIVE).matcher(source).replaceAll("________");
            var options = new ArrayList<String>();
            if (kind.equals("long")) { questions.add(new Question("Explain the role of \"" + term + "\" in this part of your notes.", source, kind, List.of(), source, term)); continue; }
            if (kind.equals("choice")) {
                pool.values().stream().filter(w -> !w.equalsIgnoreCase(term)).limit(3).forEach(options::add);
                if (options.isEmpty()) kind = "blank";
                else options.add(questions.size() % (options.size() + 1), term);
            }
            questions.add(new Question(prompt, term, kind, options, source, term));
        }
        return questions;
    }
}
