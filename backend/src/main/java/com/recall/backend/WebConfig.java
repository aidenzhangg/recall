package com.recall.backend;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

	// Browsers block requests from other origins unless the server allows them.
	// Allow the Chrome extension and the Vite dev server (npm run dev).
	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**")
				.allowedOriginPatterns("chrome-extension://*", "http://localhost:5173")
				.allowedMethods("GET", "POST", "DELETE");
	}

}
