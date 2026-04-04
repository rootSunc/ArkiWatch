package scheduler

import (
	"testing"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func TestStableJitterIsDeterministicAndBounded(t *testing.T) {
	first := StableJitterSeconds("collector:fmi", 900, 120)
	if first != StableJitterSeconds("collector:fmi", 900, 120) || first < 0 || first > 120 {
		t.Fatalf("jitter = %d", first)
	}
	if value := StableJitterSeconds("collector:fmi", 10, 120); value > 2 {
		t.Fatalf("short interval jitter = %d", value)
	}
}

func TestBuildDefaultSpecsSortsCollectorsAndIncludesPipelineJobs(t *testing.T) {
	cfg := config.DefaultConfig()
	specs := BuildDefaultSpecs(map[string]int{"hsy": 600, "fmi": 900}, cfg)
	if len(specs) != 8 || specs[0].JobKey != "collector:fmi" || specs[1].JobKey != "collector:hsy" {
		t.Fatalf("specs = %#v", specs)
	}
	if specs[2].JobKey != "pipeline:normalize" || specs[len(specs)-1].TaskType != TaskPlatformRefresh {
		t.Fatalf("pipeline specs = %#v", specs)
	}
}
