package com.recall.backend;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {
	private final boolean database;

	public HealthController() { this.database = false; }
	@Autowired
	public HealthController(AccountStore accounts) { this.database = accounts.usesDatabase(); }

	// Lets the extension check that the server is running and where accounts are stored
	@GetMapping("/health")
	public Map<String, String> health() {
		return Map.of("status", "ok", "service", "recall", "storage", database ? "database" : "files");
	}

}
