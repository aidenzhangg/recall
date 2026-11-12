package com.recall.backend;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class StudyControllerTests {
    final String notes = "Photosynthesis converts sunlight into stored chemical energy. Mitochondria release energy through cellular respiration. Chlorophyll absorbs light inside living plant cells.";
    @Test void mixedFormatsAndTargetedReviewWork() {
        var baseline = StudyController.generateAt(new StudyController.Generation(notes, 3, "mixed", List.of()), 1000);
        assertThat(baseline).extracting(StudyController.Question::kind).containsExactly("blank", "choice", "long");
        assertThat(baseline.get(1).options()).contains(baseline.get(1).answer()).doesNotHaveDuplicates();
        String missed = baseline.get(1).source();
        var targeted = StudyController.generateAt(new StudyController.Generation(notes, 1, "blank", List.of(new StudyController.Review(missed, 2, 0, 0))), 1000);
        assertThat(targeted.getFirst().source()).isEqualTo(missed);
        assertThat(baseline.get(2).answer()).isEqualTo(baseline.get(2).source());
    }
    @Test void laterReviewDoesNotDisplaceUnseenMaterialAndEmptyInputHasNoQuestions() {
        var baseline = StudyController.generateAt(new StudyController.Generation(notes, 3, "blank", List.of()), 1000);
        var future = new StudyController.Review(baseline.get(2).source(), 1, 2, 5000);
        assertThat(StudyController.generateAt(new StudyController.Generation(notes, 1, "blank", List.of(future)), 1000).getFirst().source()).isEqualTo(baseline.getFirst().source());
        assertThat(StudyController.generateAt(new StudyController.Generation("", 5, "choice", List.of()), 1000)).isEmpty();
    }

    @Test void wrappedPdfBodyIsUsedInsteadOfItsTitleAndLaterPagesAreCovered() {
        String pdf = "Introduction To The Biology Of Plants\n\nPhotosynthesis converts\nsunlight into stored\nchemical energy.\n\nPage 1\n\nMitochondria release\nenergy through cellular\nrespiration.\n\nChlorophyll absorbs light\ninside living plant cells.";
        var questions = StudyController.generateAt(new StudyController.Generation(pdf, 2, "blank", List.of()), 1000);
        assertThat(questions).hasSize(2);
        assertThat(questions.getFirst().source()).isEqualTo("Photosynthesis converts sunlight into stored chemical energy.");
        assertThat(questions.getLast().source()).contains("Chlorophyll");
        assertThat(questions).noneSatisfy(q -> assertThat(q.source()).contains("Introduction", "Page 1"));
        assertThat(StudyPassages.split("Photo-\nsynthesis converts light into chemical energy.")).containsExactly("Photosynthesis converts light into chemical energy.");
    }

    @Test void filtersLectureLogisticsRanksConceptsAndHonorsFocus() {
        String lecture = "Professor: Alex Example\nThe assignment is worth thirty percent of your grade.\nOffice hours are every Wednesday afternoon.\nPlease upload the assignment by Friday evening.\nCopyright 2026 University Lecture Resources. All rights reserved.\nLecture slides are posted after each class.\nThis is an extraordinarily complicated introductory presentation.\nPhotosynthesis converts sunlight into stored chemical energy.\nMitochondria release energy through cellular respiration.\nHomeostasis is the regulation of stable internal conditions.\nDiffusion: particles move from high concentration to low concentration.";
        var questions = StudyController.generateAt(new StudyController.Generation(lecture, 15, "choice", List.of()), 1000);
        assertThat(questions).hasSize(4);
        assertThat(questions.getFirst().answer()).isEqualTo("Homeostasis");
        assertThat(questions).extracting(StudyController.Question::topic).containsExactlyInAnyOrder("Photosynthesis", "Mitochondria", "Homeostasis", "Diffusion");
        assertThat(questions).allSatisfy(q -> assertThat(q.options()).allSatisfy(option -> assertThat(option).isIn("Photosynthesis", "Mitochondria", "Homeostasis", "Diffusion")));
        var focused = StudyController.generateAt(new StudyController.Generation(lecture, 10, "blank", List.of(), "respiration"), 1000);
        assertThat(focused).hasSize(1);
        assertThat(focused.getFirst().answer()).isEqualTo("Mitochondria");
        assertThat(StudyController.generateAt(new StudyController.Generation(lecture, 10, "blank", List.of(), "quantum physics"), 1000)).isEmpty();
        assertThat(StudyController.generateAt(new StudyController.Generation("Office hours are every Wednesday afternoon.", 10, "blank", List.of()), 1000)).isEmpty();
        assertThat(StudyController.generateAt(new StudyController.Generation("Mitochondria release extraordinarily substantial amounts of energy.", 1, "blank", List.of()), 1000).getFirst().answer()).isEqualTo("Mitochondria");
    }

    @Test void titlesDoNotAttachToBodyFactsAndWrappedSubjectsRemainIntact() {
        for (String title : List.of("Cell Biology", "cell biology", "How cells work", "# Cell biology", "Biology:", "Title: an introduction to the biology of cells")) {
            var question = StudyController.generateAt(new StudyController.Generation(title + "\nCells are the fundamental units of living organisms.", 1, "blank", List.of()), 1000).getFirst();
            assertThat(question.source()).as(title).isEqualTo("Cells are the fundamental units of living organisms.");
            assertThat(question.answer()).as(title).isEqualTo("Cells");
        }
        var separate = StudyController.generateAt(new StudyController.Generation("Cell biology\nCells are the fundamental units of living organisms\nMitochondria release energy through cellular respiration", 5, "blank", List.of()), 1000);
        assertThat(separate).extracting(StudyController.Question::answer).containsExactly("Cells", "Mitochondria");
        assertThat(StudyController.generateAt(new StudyController.Generation("Photosynthesis\nconverts sunlight into stored chemical energy.", 1, "blank", List.of()), 1000).getFirst().answer()).isEqualTo("Photosynthesis");
        assertThat(StudyController.generateAt(new StudyController.Generation("Homeostasis:\nregulation of stable internal conditions.", 1, "blank", List.of()), 1000).getFirst().answer()).isEqualTo("Homeostasis");
        assertThat(StudyController.generateAt(new StudyController.Generation("Cell Biology", 5, "blank", List.of()), 1000)).isEmpty();
    }

    @Test void eceCourseHeadingsCannotBecomeQuestionsOrDistractors() {
        String notes = "ECE 150 Fundamentals of Programming\nis taught in the first semester of engineering.\nVariables are named storage locations for program values.\nFunctions are reusable blocks of program instructions.";
        var questions = StudyController.generateAt(new StudyController.Generation(notes, 10, "choice", List.of()), 1000);
        assertThat(questions).extracting(StudyController.Question::answer).containsExactly("Variables", "Functions");
        assertThat(questions).allSatisfy(q -> {
            assertThat(q.source()).doesNotContain("ECE", "semester", "Fundamentals");
            assertThat(q.options()).containsOnly("Variables", "Functions");
        });
        assertThat(StudyController.generateAt(new StudyController.Generation("ECE150 Fundamentals of Programming is a first year engineering course.", 5, "blank", List.of()), 1000)).isEmpty();
    }

    @Test void generalizesToUnseenHeadersWithoutDroppingNumberedTechnicalConcepts() {
        for (String header : List.of("ASTR 241 Exploring distant stars", "HIST290A Ancient civilizations and societies", "ABCD-732 Some unfamiliar course title", "Topics from this week", "# A heading with unrelated information")) {
            var questions = StudyController.generateAt(new StudyController.Generation(header + "\nGravity is the attraction between objects with mass.\nDNA contains instructions for the development of organisms.", 10, "choice", List.of()), 1000);
            assertThat(questions).as(header).extracting(StudyController.Question::answer).containsExactly("Gravity", "DNA");
        }
        assertThat(StudyController.generateAt(new StudyController.Generation("ASTR241 Exploring distant stars is a first semester course.", 5, "blank", List.of()), 1000)).isEmpty();
        var technical = StudyController.generateAt(new StudyController.Generation("ISO9001 describes requirements for quality management systems. HTTP404 means the requested resource was not found.", 5, "blank", List.of()), 1000);
        assertThat(technical).extracting(StudyController.Question::answer).containsExactly("HTTP404", "ISO9001");
    }
    @org.junit.jupiter.api.Test void multipleChoiceAsksARealQuestionInsteadOfBlankingTheSentence() {
        String notes = "Osmosis is the movement of water across a semipermeable membrane.\nMitochondria release energy through cellular respiration.\nDiffusion: particles move from high concentration to low concentration.";
        var questions = StudyController.generateAt(new StudyController.Generation(notes, 3, "choice", List.of()), 1000);
        assertThat(questions).extracting(StudyController.Question::prompt).containsExactlyInAnyOrder(
            "Which of these is the movement of water across a semipermeable membrane?",
            "Which of these release energy through cellular respiration?",
            "Which term matches this description: \"particles move from high concentration to low concentration\"?");
        assertThat(questions).allSatisfy(question -> assertThat(question.options()).contains(question.answer()));
    }
}
