package com.recall.backend;

import java.io.ByteArrayOutputStream;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class MaterialControllerTests {
    MockMultipartFile pdf(boolean text) throws Exception {
        try (var document = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            var page = new PDPage(); document.addPage(page);
            if (text) try (var stream = new PDPageContentStream(document, page)) {
                stream.beginText(); stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA),12);
                stream.newLineAtOffset(50,700); stream.showText("Photosynthesis converts sunlight into stored chemical energy."); stream.endText();
            }
            document.save(bytes); return new MockMultipartFile("file", "fixture.pdf", "application/pdf", bytes.toByteArray());
        }
    }
    @Test void extractsSelectableTextAndRejectsScannedOrSpoofedDocuments() throws Exception {
        var controller = new MaterialController();
        assertThat(controller.extract(pdf(true)).get("text")).contains("Photosynthesis");
        assertThatThrownBy(() -> controller.extract(pdf(false))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> controller.extract(new MockMultipartFile("file", "fake.pdf", "application/pdf", "not-a-pdf".getBytes())))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void importsPdfLargerThanOldLimitAndRejectsMoreThanTwentyMegabytes() throws Exception {
        var controller = new MaterialController();
        try (var document = org.apache.pdfbox.Loader.loadPDF(pdf(true).getBytes()); var bytes = new ByteArrayOutputStream()) {
            var padding = document.getDocument().createCOSStream();
            try (var output = padding.createRawOutputStream()) { output.write(new byte[6 * 1024 * 1024]); }
            document.getDocumentCatalog().getCOSObject().setItem(org.apache.pdfbox.cos.COSName.getPDFName("TestPadding"), padding);
            document.save(bytes);
            assertThat(bytes.size()).isGreaterThan(5 * 1024 * 1024);
            assertThat(controller.extract(new MockMultipartFile("file", "large.pdf", "application/pdf", bytes.toByteArray())).get("text")).contains("Photosynthesis");
        }
        assertThatThrownBy(() -> controller.extract(new MockMultipartFile("file", "oversized.pdf", "application/pdf", new byte[20 * 1024 * 1024 + 1])))
            .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(400));
    }
}
