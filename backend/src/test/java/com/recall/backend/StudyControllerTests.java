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
}
