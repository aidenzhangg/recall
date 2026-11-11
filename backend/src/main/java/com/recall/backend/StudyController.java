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
        @Pattern(regexp="blank|choice|long|mixed") @NotNull String format, @NotNull @Size(max=250) List<@Valid Review> history, @Size(max=200) String focus) {
        public Generation(String notes, int count, String format, List<Review> history) { this(notes, count, format, history, null); }
    }
    public record Question(String prompt, String answer, String kind, List<String> options, String source, String topic) {}
    @PostMapping("/generate")
    public List<Question> generate(@Valid @RequestBody Generation request) {
        return generateAt(request, System.currentTimeMillis());
    }
    static List<Question> generateAt(Generation request, long now) {
        var priorities = new HashMap<String, Long>();
        for (var item : request.history()) {
            priorities.put(item.source(), item.dueAt() <= now ? 10L + item.misses() - item.successes() : 0L);
        }
        var candidates = StudyContent.candidates(request.notes(), request.focus());
        var pool = new LinkedHashMap<String,String>();
        for (var item : candidates) pool.putIfAbsent(item.term().toLowerCase(Locale.ROOT), item.term());
        var questions = new ArrayList<Question>();
        for (var item : StudyContent.select(candidates, request.count(), priorities)) {
            String source = item.source();
            String term = item.term();
            String kind = request.format().equals("mixed") ? List.of("blank", "choice", "long").get(questions.size() % 3) : request.format();
            String prompt = java.util.regex.Pattern.compile("(?<![A-Za-z])" + java.util.regex.Pattern.quote(term) + "(?![A-Za-z])", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(source).replaceAll("________");
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
