import { expect } from "chai";
import { describe, it } from "mocha";

/**
 * Basic test to validate test infrastructure is working
 */
describe("Test Infrastructure", () => {
  it("should have working test framework", () => {
    expect(true).to.be.true;
    expect("hello").to.equal("hello");
  });

  it("should support async tests", async () => {
    const result = await Promise.resolve(42);
    expect(result).to.equal(42);
  });

  it("should have access to TypeScript", () => {
    interface TestInterface {
      value: number;
    }
    
    const testObject: TestInterface = { value: 123 };
    expect(testObject.value).to.equal(123);
  });
});