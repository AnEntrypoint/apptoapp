const assert = require("assert");
const { generateJsonData, writeFilesFromStr } = require("../index.js");

describe("Apptoapp", function () {
  describe("#generateJsonData()", function () {
    it("should generate JSON data from the source directory", function () {
      // Call the function with a test source directory
      const result = generateJsonData("./test-src");
      // Check that the result is as expected
      assert.equal(result, "expected result");
    });
  });

  describe("#writeFilesFromStr()", function () {
    it("should write files from a string", function () {
      // Call the function with a test string
      const result = writeFilesFromStr("test string");
      // Check that the result is as expected
      assert.equal(result, "expected result");
    });
  });
});
