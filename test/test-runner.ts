#!/usr/bin/env tsx

/**
 * Comprehensive Test Runner for OpenAI Responses API
 * 
 * This script orchestrates the complete test suite and provides detailed reporting
 * for different test categories (unit, integration, compatibility, performance).
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface TestSuite {
  name: string;
  pattern: string;
  description: string;
  timeout?: number;
  parallel?: boolean;
}

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  duration: number;
  exitCode: number;
  output: string;
}

class TestRunner {
  private readonly testSuites: TestSuite[] = [
    {
      name: "Core Unit Tests",
      pattern: "test/specs/core/**/*.test.ts",
      description: "Core transformer and interface validation",
      timeout: 30000
    },
    {
      name: "Streaming Integration",
      pattern: "test/specs/streaming/**/*.test.ts", 
      description: "SSE streaming and event processing",
      timeout: 60000
    },
    {
      name: "Backward Compatibility",
      pattern: "test/specs/compatibility/**/*.test.ts",
      description: "CRITICAL: Ensures no regression in existing functionality",
      timeout: 45000
    },
    {
      name: "Performance Benchmarks", 
      pattern: "test/benchmarks/**/*.test.ts",
      description: "Performance validation and baseline establishment",
      timeout: 120000
    }
  ];

  private results: TestResult[] = [];

  async runAll(): Promise<boolean> {
    console.log("🚀 Starting OpenAI Responses API Test Suite\n");
    
    let allPassed = true;

    for (const suite of this.testSuites) {
      const result = await this.runSuite(suite);
      this.results.push(result);
      
      if (result.exitCode !== 0) {
        allPassed = false;
      }
    }

    this.printSummary();
    return allPassed;
  }

  private async runSuite(suite: TestSuite): Promise<TestResult> {
    console.log(`\n📋 Running ${suite.name}`);
    console.log(`   ${suite.description}`);
    console.log(`   Pattern: ${suite.pattern}\n`);

    const startTime = Date.now();
    
    try {
      const mochaCommand = [
        "npx mocha",
        "--require tsx/cjs",
        `'${suite.pattern}'`,
        `--timeout ${suite.timeout || 30000}`,
        "--reporter spec",
        "--colors"
      ].join(" ");

      const output = execSync(mochaCommand, { 
        encoding: "utf-8",
        env: { 
          ...process.env,
          NODE_ENV: "test",
          PRINT_BENCHMARKS: suite.name.includes("Performance") ? "true" : "false"
        }
      });

      const duration = Date.now() - startTime;
      const result = this.parseTestOutput(output);

      console.log(`✅ ${suite.name} completed in ${duration}ms`);
      console.log(`   Passed: ${result.passed}, Failed: ${result.failed}\n`);

      return {
        suite: suite.name,
        passed: result.passed,
        failed: result.failed,
        duration,
        exitCode: 0,
        output
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const output = error.stdout || error.message;
      const result = this.parseTestOutput(output);

      console.log(`❌ ${suite.name} failed in ${duration}ms`);
      console.log(`   Error: ${error.message}\n`);

      return {
        suite: suite.name,
        passed: result.passed,
        failed: result.failed,
        duration,
        exitCode: error.status || 1,
        output
      };
    }
  }

  private parseTestOutput(output: string): { passed: number; failed: number } {
    // Parse Mocha output to extract test counts
    const passMatch = output.match(/(\d+) passing/);
    const failMatch = output.match(/(\d+) failing/);
    
    return {
      passed: passMatch ? parseInt(passMatch[1]) : 0,
      failed: failMatch ? parseInt(failMatch[1]) : 0
    };
  }

  private printSummary(): void {
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));

    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;

    for (const result of this.results) {
      const status = result.exitCode === 0 ? "✅ PASS" : "❌ FAIL";
      console.log(`${status} ${result.suite}`);
      console.log(`      Passed: ${result.passed}, Failed: ${result.failed}, Duration: ${result.duration}ms`);
      
      totalPassed += result.passed;
      totalFailed += result.failed;
      totalDuration += result.duration;
    }

    console.log("\n" + "-".repeat(60));
    console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log(`DURATION: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    
    if (totalFailed === 0) {
      console.log("🎉 ALL TESTS PASSED - Ready for implementation!");
    } else {
      console.log("💥 TESTS FAILED - Fix issues before proceeding");
    }

    // Critical compatibility check
    const compatibilityResult = this.results.find(r => r.suite.includes("Compatibility"));
    if (compatibilityResult && compatibilityResult.failed > 0) {
      console.log("\n⚠️  CRITICAL: Backward compatibility tests failed!");
      console.log("   These MUST pass before any Responses API changes can be merged.");
    }

    console.log("=".repeat(60) + "\n");
  }

  async runSpecific(pattern: string): Promise<boolean> {
    console.log(`🎯 Running specific tests: ${pattern}\n`);
    
    const customSuite: TestSuite = {
      name: "Custom Test Run",
      pattern,
      description: "User-specified test pattern"
    };

    const result = await this.runSuite(customSuite);
    return result.exitCode === 0;
  }

  async generateReport(): Promise<void> {
    const reportPath = path.join(__dirname, "test-report.json");
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        totalSuites: this.results.length,
        passedSuites: this.results.filter(r => r.exitCode === 0).length,
        failedSuites: this.results.filter(r => r.exitCode !== 0).length,
        totalTests: this.results.reduce((sum, r) => sum + r.passed + r.failed, 0),
        totalPassed: this.results.reduce((sum, r) => sum + r.passed, 0),
        totalFailed: this.results.reduce((sum, r) => sum + r.failed, 0),
        totalDuration: this.results.reduce((sum, r) => sum + r.duration, 0)
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Test report saved to: ${reportPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const runner = new TestRunner();

  try {
    let success = false;

    if (args.length === 0) {
      // Run all tests
      success = await runner.runAll();
    } else if (args[0] === "--pattern" && args[1]) {
      // Run specific pattern
      success = await runner.runSpecific(args[1]);
    } else if (args[0] === "--compatibility") {
      // Run only compatibility tests (for CI)
      success = await runner.runSpecific("test/specs/compatibility/**/*.test.ts");
    } else if (args[0] === "--core") {
      // Run only core tests
      success = await runner.runSpecific("test/specs/core/**/*.test.ts");
    } else if (args[0] === "--streaming") {
      // Run only streaming tests
      success = await runner.runSpecific("test/specs/streaming/**/*.test.ts");
    } else if (args[0] === "--benchmarks") {
      // Run only benchmark tests
      success = await runner.runSpecific("test/benchmarks/**/*.test.ts");
    } else {
      console.log("Usage:");
      console.log("  tsx test/test-runner.ts                    # Run all tests");
      console.log("  tsx test/test-runner.ts --compatibility    # Run compatibility tests only");
      console.log("  tsx test/test-runner.ts --core             # Run core tests only");
      console.log("  tsx test/test-runner.ts --streaming        # Run streaming tests only");
      console.log("  tsx test/test-runner.ts --benchmarks       # Run benchmark tests only");
      console.log("  tsx test/test-runner.ts --pattern <glob>   # Run custom pattern");
      process.exit(1);
    }

    await runner.generateReport();
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error("❌ Test runner failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { TestRunner };